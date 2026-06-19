import { EditorSelection, type ChangeSpec, type StateCommand } from '@codemirror/state';

/**
 * Reusable editing commands operating on a CodeMirror editor state.
 *
 * These mirror common Notepad++ "Edit" menu operations (line operations, case
 * conversion, blank operations). Each is a {@link StateCommand} — a pure
 * `({state, dispatch}) => boolean` function — so they are trivially unit-testable
 * and can be bound to menus, the command palette, or keymaps without touching
 * the editor component.
 *
 * Convention: line-oriented commands act on the lines touched by the current
 * selection, or the whole document when the selection is empty and spans a
 * single caret on the first/only context. Character-oriented commands act on
 * the selected text (no-op when nothing is selected).
 */

type LineRange = { fromLine: number; toLine: number };

/** The 1-based line range covered by the primary selection (or all lines). */
function selectedLineRange(state: { doc: any; selection: any }, fallbackToAll = true): LineRange {
  const sel = state.selection.main;
  const fromLine = state.doc.lineAt(sel.from).number;
  const toLine = state.doc.lineAt(sel.to).number;
  if (fromLine === toLine && sel.empty && fallbackToAll) {
    return { fromLine: 1, toLine: state.doc.lines };
  }
  return { fromLine, toLine };
}

/** Replace the block of lines [fromLine..toLine] with `lines`, reselecting it. */
function replaceLines(
  view: { state: any; dispatch: (tr: any) => void },
  range: LineRange,
  lines: string[],
): boolean {
  const { state, dispatch } = view;
  const from = state.doc.line(range.fromLine).from;
  const to = state.doc.line(range.toLine).to;
  const insert = lines.join('\n');
  dispatch(
    state.update({
      changes: { from, to, insert },
      selection: EditorSelection.range(from, from + insert.length),
      scrollIntoView: true,
      userEvent: 'input.edit',
    }),
  );
  return true;
}

/** Collect the text of lines [fromLine..toLine] (1-based, inclusive). */
function getLines(state: any, range: LineRange): string[] {
  const out: string[] = [];
  for (let n = range.fromLine; n <= range.toLine; n++) {
    out.push(state.doc.line(n).text);
  }
  return out;
}

// ---- Line operations ------------------------------------------------------

/** Sort the selected lines (or whole doc) lexicographically. */
export const sortLinesAscending: StateCommand = (view) => {
  const range = selectedLineRange(view.state);
  const sorted = getLines(view.state, range).sort((a, b) => a.localeCompare(b));
  return replaceLines(view, range, sorted);
};

/** Sort the selected lines (or whole doc) in reverse lexicographic order. */
export const sortLinesDescending: StateCommand = (view) => {
  const range = selectedLineRange(view.state);
  const sorted = getLines(view.state, range).sort((a, b) => b.localeCompare(a));
  return replaceLines(view, range, sorted);
};

/** Remove duplicate lines, keeping the first occurrence (order preserved). */
export const removeDuplicateLines: StateCommand = (view) => {
  const range = selectedLineRange(view.state);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of getLines(view.state, range)) {
    if (!seen.has(line)) {
      seen.add(line);
      result.push(line);
    }
  }
  return replaceLines(view, range, result);
};

/** Remove blank (empty or whitespace-only) lines. */
export const removeEmptyLines: StateCommand = (view) => {
  const range = selectedLineRange(view.state);
  const result = getLines(view.state, range).filter((l) => l.trim().length > 0);
  return replaceLines(view, range, result.length ? result : ['']);
};

/** Reverse the order of the selected lines (or whole doc). */
export const reverseLines: StateCommand = (view) => {
  const range = selectedLineRange(view.state);
  return replaceLines(view, range, getLines(view.state, range).reverse());
};

/** Join the selected lines into a single line (no separator added). */
export const joinLines: StateCommand = (view) => {
  const range = selectedLineRange(view.state, false);
  if (range.fromLine === range.toLine) return false;
  const joined = getLines(view.state, range).join('');
  return replaceLines(view, range, [joined]);
};

// ---- Case conversion ------------------------------------------------------

/** Apply `fn` to each non-empty selection range's text. */
function transformSelection(
  view: { state: any; dispatch: (tr: any) => void },
  fn: (text: string) => string,
): boolean {
  const { state, dispatch } = view;
  const changes: ChangeSpec[] = [];
  let any = false;
  for (const range of state.selection.ranges) {
    if (range.empty) continue;
    const text = state.sliceDoc(range.from, range.to);
    changes.push({ from: range.from, to: range.to, insert: fn(text) });
    any = true;
  }
  if (!any) return false;
  dispatch(state.update({ changes, userEvent: 'input.edit' }));
  return true;
};

export const toUpperCase: StateCommand = (view) => transformSelection(view, (t) => t.toUpperCase());
export const toLowerCase: StateCommand = (view) => transformSelection(view, (t) => t.toLowerCase());

/** Title Case: capitalize the first letter of each word. */
export const toProperCase: StateCommand = (view) =>
  transformSelection(view, (t) => t.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w/g, (c) => c.toLowerCase()));

/** Sentence case: capitalize the first letter of each sentence. */
export const toSentenceCase: StateCommand = (view) =>
  transformSelection(view, (t) =>
    t.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (s) => s.toUpperCase()),
  );

/** Invert the case of each character. */
export const invertCase: StateCommand = (view) =>
  transformSelection(view, (t) =>
    t.replace(/[a-z]/gi, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())),
  );

// ---- Blank operations -----------------------------------------------------

/** Remove trailing whitespace from every line in the document. */
export const trimTrailingWhitespace: StateCommand = (view) => {
  const range: LineRange = { fromLine: 1, toLine: view.state.doc.lines };
  const lines = getLines(view.state, range).map((l) => l.replace(/[ \t]+$/, ''));
  return replaceLines(view, range, lines);
};

/** Remove leading whitespace from every line in the document. */
export const trimLeadingWhitespace: StateCommand = (view) => {
  const range: LineRange = { fromLine: 1, toLine: view.state.doc.lines };
  const lines = getLines(view.state, range).map((l) => l.replace(/^[ \t]+/, ''));
  return replaceLines(view, range, lines);
};

/** Convert leading tabs to `size` spaces (whole document). */
export function tabsToSpaces(size = 4): StateCommand {
  const spaces = ' '.repeat(size);
  return (view) => {
    const range: LineRange = { fromLine: 1, toLine: view.state.doc.lines };
    const lines = getLines(view.state, range).map((l) => l.replace(/\t/g, spaces));
    return replaceLines(view, range, lines);
  };
}

/** Convert runs of `size` leading spaces to tabs (whole document). */
export function spacesToTabs(size = 4): StateCommand {
  return (view) => {
    const range: LineRange = { fromLine: 1, toLine: view.state.doc.lines };
    const re = new RegExp(` {${size}}`, 'g');
    const lines = getLines(view.state, range).map((l) => l.replace(re, '\t'));
    return replaceLines(view, range, lines);
  };
}
