import { findMatches } from './mark';

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
