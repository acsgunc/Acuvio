import { matchBrackets } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

/**
 * Brace-matching navigation for the editable view (Notepad++ Search → Go to
 * Matching Brace / Select All between Matching Braces).
 *
 * The {@link findMatchingBracket} helper is a thin, testable wrapper over
 * CodeMirror's {@link matchBrackets}. It probes both immediately before and
 * after `pos` (so a caret touching either side of a bracket works) and in both
 * scan directions, returning the resolved positions or `null`.
 */

/** Result of resolving the bracket pair around a caret position. */
export interface BracketPair {
  /** Start offset of the bracket token under/next to the caret. */
  bracketFrom: number;
  /** End offset of that bracket token. */
  bracketTo: number;
  /** Start offset of the matching bracket token. */
  matchFrom: number;
  /** End offset of the matching bracket token. */
  matchTo: number;
}

/**
 * Resolve the matching-bracket pair for the caret at `pos`.
 *
 * Returns `null` when the caret is not adjacent to a bracket, or when the
 * bracket has no (matched) partner. Only positively `matched` pairs qualify, so
 * an unbalanced `}` reports no match.
 */
export function findMatchingBracket(state: EditorState, pos: number): BracketPair | null {
  // Probe order: bracket just after caret (dir 1), then just before (dir -1).
  const probes: Array<{ at: number; dir: 1 | -1 }> = [
    { at: pos, dir: 1 },
    { at: pos, dir: -1 },
    { at: pos - 1, dir: 1 },
  ];
  for (const probe of probes) {
    if (probe.at < 0) continue;
    const result = matchBrackets(state, probe.at, probe.dir);
    if (result && result.matched && result.end) {
      return {
        bracketFrom: result.start.from,
        bracketTo: result.start.to,
        matchFrom: result.end.from,
        matchTo: result.end.to,
      };
    }
  }
  return null;
}
