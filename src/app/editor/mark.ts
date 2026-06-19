import { StateField, StateEffect, RangeSetBuilder, type Extension } from '@codemirror/state';
import { EditorView, Decoration, type DecorationSet } from '@codemirror/view';

/**
 * "Mark" support for the editable document view (Notepad++ Search → Mark).
 *
 * Unlike a transient find highlight, marks are **persistent**: every occurrence
 * of the marked term stays highlighted until cleared, independent of the active
 * find query. The match scan is a pure function ({@link findMatches}) so it can
 * be unit-tested without an editor; the editor wraps it in a {@link StateField}
 * that recomputes decorations whenever the term or the document changes.
 */

/** A single match span (absolute document offsets). */
export interface MatchSpan {
  from: number;
  to: number;
}

/** Options controlling how the marked term is matched. */
export interface MarkOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

const DEFAULT_OPTIONS: MarkOptions = { caseSensitive: false, wholeWord: false, regexp: false };

/** Set/replace the marked term (empty string clears the mark). */
export const setMarkEffect = StateEffect.define<{ term: string; options: MarkOptions } | null>();

const WORD_CHAR = /[\w$]/;

/** Escape a string for safe use as a literal inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find every (non-overlapping) match of `term` in `text`.
 *
 * Pure and side-effect free. Returns matches in document order. An empty term,
 * or an invalid regular expression when `regexp` is set, yields an empty list.
 */
export function findMatches(
  text: string,
  term: string,
  options: Partial<MarkOptions> = {},
): MatchSpan[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (!term) return [];

  let pattern = opts.regexp ? term : escapeRegExp(term);
  if (opts.wholeWord) pattern = `(?<![\\w$])(?:${pattern})(?![\\w$])`;

  let re: RegExp;
  try {
    re = new RegExp(pattern, opts.caseSensitive ? 'g' : 'gi');
  } catch {
    return []; // invalid regex
  }

  const spans: MatchSpan[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      // Zero-width match — advance to avoid an infinite loop.
      re.lastIndex++;
      continue;
    }
    spans.push({ from: m.index, to: m.index + m[0].length });
  }
  return spans;
}

const markDecoration = Decoration.mark({ class: 'cm-mark-highlight' });

interface MarkState {
  term: string;
  options: MarkOptions;
  decorations: DecorationSet;
}

const EMPTY_STATE: MarkState = {
  term: '',
  options: DEFAULT_OPTIONS,
  decorations: Decoration.none,
};

function buildDecorations(text: string, term: string, options: MarkOptions): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const span of findMatches(text, term, options)) {
    builder.add(span.from, span.to, markDecoration);
  }
  return builder.finish();
}

const markField = StateField.define<MarkState>({
  create() {
    return EMPTY_STATE;
  },
  update(value, tr) {
    // A new term was set explicitly.
    for (const effect of tr.effects) {
      if (effect.is(setMarkEffect)) {
        if (!effect.value || !effect.value.term) return EMPTY_STATE;
        const { term, options } = effect.value;
        return { term, options, decorations: buildDecorations(tr.state.doc.toString(), term, options) };
      }
    }
    // Otherwise, recompute only if the document changed and a term is active.
    if (tr.docChanged && value.term) {
      return {
        ...value,
        decorations: buildDecorations(tr.state.doc.toString(), value.term, value.options),
      };
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, (s) => s.decorations),
});

const markTheme = EditorView.baseTheme({
  '.cm-mark-highlight': {
    backgroundColor: 'rgba(255, 200, 0, 0.40)',
    borderRadius: '2px',
  },
});

/** The complete Mark extension bundle for the editor. */
export function markHighlighter(): Extension {
  return [markField, markTheme];
}

/** Number of marked occurrences currently in `state`. */
export function markCount(state: { field: (f: any) => any }): number {
  const value = state.field(markField) as MarkState;
  return value.decorations.size;
}
