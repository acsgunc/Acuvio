/**
 * Pure search engine powering the Find dialog (Notepad++ "Search → Find",
 * Ctrl+F). Everything here is side-effect free so the full matrix of Notepad++
 * search options can be unit-tested without an editor:
 *
 *  - **Search modes:** Normal (literal), Extended (`\n \r \t \0 \xHH \uHHHH …`),
 *    Regular expression (with optional ". matches newline").
 *  - **Match case** and **Match whole word only**.
 *  - **Wrap around** and **Backward direction** navigation.
 *  - **In selection** is handled by the caller filtering matches to a range.
 *
 * The editor component turns these results into selections, replacements and
 * the "Find All" results list.
 */

/** Which interpretation to apply to the search term. */
export type SearchMode = 'normal' | 'extended' | 'regex';

/** A fully specified search term + matching options. */
export interface FindQuery {
  term: string;
  mode: SearchMode;
  caseSensitive: boolean;
  wholeWord: boolean;
  /** Regex only: let `.` also match newline characters (dotAll). */
  dotMatchesNewline: boolean;
}

/** A single match span (absolute offsets into the searched text). */
export interface FindMatch {
  from: number;
  to: number;
}

/** Result of resolving the next/previous match relative to the caret. */
export interface NextMatch {
  /** Index into the matches array, or `null` when none applies. */
  index: number | null;
  /** True when navigation wrapped past the document edge. */
  wrapped: boolean;
}

const WORD_BOUNDARY_BEFORE = '(?<![\\w$])';
const WORD_BOUNDARY_AFTER = '(?![\\w$])';

/** Escape a string for safe use as a literal inside a RegExp. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Interpret C-style escape sequences in a string (Notepad++ "Extended" mode).
 *
 * Supports `\n \r \t \0 \a \b \f \v \\`, hex `\xHH`, unicode `\uHHHH`, octal
 * `\oOOO` and decimal `\dDDD`. An unrecognized escape is left verbatim
 * (backslash kept), matching the principle of least surprise.
 */
export function unescapeExtended(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch !== '\\' || i === input.length - 1) {
      out += ch;
      continue;
    }
    const next = input[++i];
    switch (next) {
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case '0': out += '\0'; break;
      case 'a': out += '\x07'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case '\\': out += '\\'; break;
      case 'x': {
        const hex = input.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 2;
        } else {
          out += '\\x';
        }
        break;
      }
      case 'u': {
        const hex = input.slice(i + 1, i + 5);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          out += '\\u';
        }
        break;
      }
      case 'o': {
        const oct = input.slice(i + 1, i + 4);
        if (/^[0-7]{1,3}$/.test(oct)) {
          out += String.fromCharCode(parseInt(oct, 8));
          i += oct.length;
        } else {
          out += '\\o';
        }
        break;
      }
      case 'd': {
        const dec = input.slice(i + 1, i + 4);
        if (/^[0-9]{1,3}$/.test(dec)) {
          out += String.fromCharCode(parseInt(dec, 10));
          i += dec.length;
        } else {
          out += '\\d';
        }
        break;
      }
      default:
        out += '\\' + next;
    }
  }
  return out;
}

/**
 * Interpret the limited escape set Notepad++ allows in a **replacement** string
 * (`\n \r \t \\`). Leaves `\1`, `$1` and other characters untouched so regex
 * group references still work.
 */
export function unescapeReplacement(input: string): string {
  return input.replace(/\\([nrt\\])/g, (_, ch: string) => {
    switch (ch) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      default: return '\\';
    }
  });
}

/**
 * Compile a {@link FindQuery} into a global {@link RegExp}, or `null` when the
 * term is empty or the regular expression is invalid.
 */
export function compileQuery(query: FindQuery): RegExp | null {
  if (!query.term) return null;

  let pattern: string;
  switch (query.mode) {
    case 'regex':
      pattern = query.term;
      break;
    case 'extended':
      pattern = escapeRegExp(unescapeExtended(query.term));
      break;
    default:
      pattern = escapeRegExp(query.term);
  }

  // Whole-word only applies to literal modes (Notepad++ disables it for regex).
  if (query.wholeWord && query.mode !== 'regex') {
    pattern = `${WORD_BOUNDARY_BEFORE}(?:${pattern})${WORD_BOUNDARY_AFTER}`;
  }

  let flags = 'gm';
  if (!query.caseSensitive) flags += 'i';
  if (query.mode === 'regex' && query.dotMatchesNewline) flags += 's';

  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * Every non-overlapping match of `query` in `text`, in document order. Empty or
 * invalid queries yield an empty array. Zero-width matches are skipped.
 */
export function findAllMatches(text: string, query: FindQuery): FindMatch[] {
  const re = compileQuery(query);
  if (!re) return [];
  const matches: FindMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    matches.push({ from: m.index, to: m.index + m[0].length });
  }
  return matches;
}

/**
 * Resolve the next match to select relative to a caret/selection.
 *
 * Forward search picks the first match starting at/after `caretTo`; backward
 * search picks the last match ending at/before `caretFrom`. When nothing is
 * found in the chosen direction and `wrapAround` is set, navigation wraps to the
 * other end and `wrapped` is `true`.
 */
export function nextMatchIndex(
  matches: readonly FindMatch[],
  caretFrom: number,
  caretTo: number,
  opts: { backward: boolean; wrapAround: boolean },
): NextMatch {
  if (matches.length === 0) return { index: null, wrapped: false };

  if (opts.backward) {
    for (let i = matches.length - 1; i >= 0; i--) {
      if (matches[i].to <= caretFrom) return { index: i, wrapped: false };
    }
    return opts.wrapAround ? { index: matches.length - 1, wrapped: true } : { index: null, wrapped: false };
  }

  for (let i = 0; i < matches.length; i++) {
    if (matches[i].from >= caretTo) return { index: i, wrapped: false };
  }
  return opts.wrapAround ? { index: 0, wrapped: true } : { index: null, wrapped: false };
}

/**
 * Build the replacement text for a single match.
 *
 * - **normal:** the replacement is inserted literally.
 * - **extended:** C-style escapes in the replacement are interpreted.
 * - **regex:** the matched text is re-run against the (non-global) pattern so
 *   `$1`/`$&` group references expand; `\n \r \t` are honored too.
 */
export function buildReplacement(query: FindQuery, replacement: string, matched: string): string {
  switch (query.mode) {
    case 'extended':
      return unescapeExtended(replacement);
    case 'regex': {
      const re = compileQuery(query);
      if (!re) return replacement;
      const single = new RegExp(re.source, re.flags.replace('g', ''));
      return matched.replace(single, unescapeReplacement(replacement));
    }
    default:
      return replacement;
  }
}
