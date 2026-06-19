import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import {
  sortLinesAscending,
  sortLinesDescending,
  removeDuplicateLines,
  removeEmptyLines,
  reverseLines,
  joinLines,
  toUpperCase,
  toLowerCase,
  toProperCase,
  invertCase,
  trimTrailingWhitespace,
  tabsToSpaces,
  spacesToTabs,
} from './edit-commands';

/** Run a command on `doc` and return the resulting document text. */
function run(
  command: (t: { state: EditorState; dispatch: (tr: Transaction) => void }) => boolean,
  doc: string,
  selectWholeDoc = false,
): { handled: boolean; doc: string } {
  const selection = selectWholeDoc ? EditorSelection.single(0, doc.length) : undefined;
  const state = EditorState.create({ doc, selection });
  let result = state;
  const handled = command({
    state,
    dispatch: (tr: Transaction) => {
      result = tr.state;
    },
  });
  return { handled, doc: result.doc.toString() };
}

describe('edit-commands', () => {
  it('sorts lines ascending (whole doc when no selection)', () => {
    expect(run(sortLinesAscending, 'banana\napple\ncherry').doc).toBe('apple\nbanana\ncherry');
  });

  it('sorts lines descending', () => {
    expect(run(sortLinesDescending, 'apple\nbanana\ncherry').doc).toBe('cherry\nbanana\napple');
  });

  it('removes duplicate lines, keeping first occurrence', () => {
    expect(run(removeDuplicateLines, 'a\nb\na\nc\nb').doc).toBe('a\nb\nc');
  });

  it('removes empty and whitespace-only lines', () => {
    expect(run(removeEmptyLines, 'a\n\n  \nb').doc).toBe('a\nb');
  });

  it('reverses line order', () => {
    expect(run(reverseLines, '1\n2\n3').doc).toBe('3\n2\n1');
  });

  it('joins selected lines', () => {
    expect(run(joinLines, 'foo\nbar\nbaz', true).doc).toBe('foobarbaz');
  });

  it('converts selection to UPPERCASE', () => {
    expect(run(toUpperCase, 'Hello World', true).doc).toBe('HELLO WORLD');
  });

  it('converts selection to lowercase', () => {
    expect(run(toLowerCase, 'Hello World', true).doc).toBe('hello world');
  });

  it('converts selection to Proper Case', () => {
    expect(run(toProperCase, 'hello world', true).doc).toBe('Hello World');
  });

  it('inverts the case of the selection', () => {
    expect(run(invertCase, 'Hello', true).doc).toBe('hELLO');
  });

  it('is a no-op for case conversion without a selection', () => {
    expect(run(toUpperCase, 'hello').handled).toBe(false);
  });

  it('trims trailing whitespace on every line', () => {
    expect(run(trimTrailingWhitespace, 'a   \nb\t\nc').doc).toBe('a\nb\nc');
  });

  it('converts tabs to spaces', () => {
    expect(run(tabsToSpaces(2), '\tx').doc).toBe('  x');
  });

  it('converts spaces to tabs', () => {
    expect(run(spacesToTabs(2), '    x').doc).toBe('\t\tx');
  });
});
