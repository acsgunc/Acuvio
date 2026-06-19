import { findMatches } from './mark';
import {
  markHighlighter,
  setMarkEffect,
  clearAllMarksEffect,
  markCount,
  MARK_STYLE_COUNT,
} from './mark';
import { EditorState } from '@codemirror/state';

describe('mark findMatches', () => {
  it('returns no matches for an empty term', () => {
    expect(findMatches('hello world', '')).toEqual([]);
  });

  it('finds all case-insensitive occurrences by default', () => {
    const spans = findMatches('Foo foo FOO', 'foo');
    expect(spans.length).toBe(3);
    expect(spans[0]).toEqual({ from: 0, to: 3 });
    expect(spans[1]).toEqual({ from: 4, to: 7 });
    expect(spans[2]).toEqual({ from: 8, to: 11 });
  });

  it('respects case sensitivity', () => {
    const spans = findMatches('Foo foo FOO', 'foo', { caseSensitive: true });
    expect(spans).toEqual([{ from: 4, to: 7 }]);
  });

  it('matches whole words only when requested', () => {
    const spans = findMatches('cat category cat', 'cat', { wholeWord: true });
    expect(spans.length).toBe(2);
    expect(spans[0]).toEqual({ from: 0, to: 3 });
    expect(spans[1]).toEqual({ from: 13, to: 16 });
  });

  it('treats the term literally unless regexp is set', () => {
    expect(findMatches('a.b axb', 'a.b')).toEqual([{ from: 0, to: 3 }]);
  });

  it('supports regular expressions', () => {
    const spans = findMatches('a1 b2 c3', '\\d', { regexp: true });
    expect(spans.map((s) => s.from)).toEqual([1, 4, 7]);
  });

  it('returns no matches for an invalid regular expression', () => {
    expect(findMatches('abc', '(', { regexp: true })).toEqual([]);
  });

  it('does not hang on zero-width regex matches', () => {
    const spans = findMatches('abc', 'x*', { regexp: true });
    expect(spans).toEqual([]); // zero-width matches are skipped
  });
});

describe('mark styles (state field)', () => {
  const opts = { caseSensitive: false, wholeWord: false, regexp: false };

  function make(doc: string) {
    return EditorState.create({ doc, extensions: [markHighlighter()] });
  }

  it('exposes five independent style slots', () => {
    expect(MARK_STYLE_COUNT).toBe(5);
  });

  it('marks a term in a chosen style slot', () => {
    let state = make('foo bar foo');
    state = state.update({
      effects: setMarkEffect.of({ styleIndex: 1, term: 'foo', options: opts }),
    }).state;
    expect(markCount(state, 1)).toBe(2);
    expect(markCount(state, 0)).toBe(0);
    expect(markCount(state)).toBe(2);
  });

  it('keeps styles independent and sums them across slots', () => {
    let state = make('foo bar baz foo bar');
    state = state.update({
      effects: setMarkEffect.of({ styleIndex: 0, term: 'foo', options: opts }),
    }).state;
    state = state.update({
      effects: setMarkEffect.of({ styleIndex: 2, term: 'bar', options: opts }),
    }).state;
    expect(markCount(state, 0)).toBe(2);
    expect(markCount(state, 2)).toBe(2);
    expect(markCount(state)).toBe(4);
  });

  it('clears a single slot with an empty term', () => {
    let state = make('foo foo');
    state = state.update({
      effects: setMarkEffect.of({ styleIndex: 0, term: 'foo', options: opts }),
    }).state;
    state = state.update({
      effects: setMarkEffect.of({ styleIndex: 0, term: '', options: opts }),
    }).state;
    expect(markCount(state, 0)).toBe(0);
  });

  it('clears every slot with clearAllMarksEffect', () => {
    let state = make('foo bar foo bar');
    state = state.update({
      effects: setMarkEffect.of({ styleIndex: 0, term: 'foo', options: opts }),
    }).state;
    state = state.update({
      effects: setMarkEffect.of({ styleIndex: 3, term: 'bar', options: opts }),
    }).state;
    state = state.update({ effects: clearAllMarksEffect.of(null) }).state;
    expect(markCount(state)).toBe(0);
  });

  it('recomputes marks when the document changes', () => {
    let state = make('foo');
    state = state.update({
      effects: setMarkEffect.of({ styleIndex: 0, term: 'foo', options: opts }),
    }).state;
    expect(markCount(state, 0)).toBe(1);
    state = state.update({ changes: { from: 3, insert: ' foo foo' } }).state;
    expect(markCount(state, 0)).toBe(3);
  });
});
