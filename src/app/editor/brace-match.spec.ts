import { EditorState } from '@codemirror/state';
import { bracketMatching } from '@codemirror/language';
import { findMatchingBracket } from './brace-match';

/** Build a minimal state with bracket-matching enabled. */
function stateFor(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [bracketMatching()] });
}

describe('findMatchingBracket', () => {
  it('matches an opening bracket to its closer', () => {
    const state = stateFor('a(bc)d');
    // caret just before the '(' at index 1
    const pair = findMatchingBracket(state, 1);
    expect(pair).not.toBeNull();
    expect(pair!.bracketFrom).toBe(1);
    expect(pair!.matchFrom).toBe(4); // the ')'
  });

  it('matches a closing bracket to its opener', () => {
    const state = stateFor('a(bc)d');
    // caret just after the ')' at index 5
    const pair = findMatchingBracket(state, 5);
    expect(pair).not.toBeNull();
    expect(pair!.matchFrom).toBe(1); // back to the '('
  });

  it('handles nested brackets', () => {
    const state = stateFor('{a[b]c}');
    const pair = findMatchingBracket(state, 0); // before '{'
    expect(pair).not.toBeNull();
    expect(pair!.matchFrom).toBe(6); // the closing '}'
  });

  it('returns null when the caret is not next to a bracket', () => {
    const state = stateFor('hello');
    expect(findMatchingBracket(state, 2)).toBeNull();
  });

  it('returns null for an unbalanced bracket', () => {
    const state = stateFor('a(b');
    // The '(' has no closer.
    expect(findMatchingBracket(state, 1)).toBeNull();
  });
});
