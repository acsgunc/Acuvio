import { nextBookmarkLine, prevBookmarkLine, partitionByBookmarks, invertBookmarks } from './bookmarks';

describe('bookmark navigation', () => {
  it('returns null when there are no bookmarks', () => {
    expect(nextBookmarkLine([], 1)).toBeNull();
    expect(prevBookmarkLine([], 1)).toBeNull();
  });

  it('finds the next bookmark strictly after the current line', () => {
    expect(nextBookmarkLine([2, 5, 9], 5)).toBe(9);
    expect(nextBookmarkLine([2, 5, 9], 1)).toBe(2);
  });

  it('wraps to the first bookmark when past the last', () => {
    expect(nextBookmarkLine([2, 5, 9], 9)).toBe(2);
    expect(nextBookmarkLine([2, 5, 9], 100)).toBe(2);
  });

  it('finds the previous bookmark strictly before the current line', () => {
    expect(prevBookmarkLine([2, 5, 9], 5)).toBe(2);
    expect(prevBookmarkLine([2, 5, 9], 10)).toBe(9);
  });

  it('wraps to the last bookmark when before the first', () => {
    expect(prevBookmarkLine([2, 5, 9], 2)).toBe(9);
    expect(prevBookmarkLine([2, 5, 9], 1)).toBe(9);
  });

  it('does not require sorted input', () => {
    expect(nextBookmarkLine([9, 2, 5], 3)).toBe(5);
    expect(prevBookmarkLine([9, 2, 5], 6)).toBe(5);
  });
});

describe('bookmark line operations', () => {
  const lines = ['one', 'two', 'three', 'four', 'five'];

  it('partitions lines into marked and unmarked, preserving order', () => {
    const { marked, unmarked } = partitionByBookmarks(lines, [2, 4]);
    expect(marked).toEqual(['two', 'four']);
    expect(unmarked).toEqual(['one', 'three', 'five']);
  });

  it('ignores out-of-range and duplicate bookmark numbers', () => {
    const { marked, unmarked } = partitionByBookmarks(lines, [4, 4, 99, 0]);
    expect(marked).toEqual(['four']);
    expect(unmarked).toEqual(['one', 'two', 'three', 'five']);
  });

  it('returns all lines unmarked when nothing is bookmarked', () => {
    const { marked, unmarked } = partitionByBookmarks(lines, []);
    expect(marked).toEqual([]);
    expect(unmarked).toEqual(lines);
  });

  it('inverts a bookmark selection over the whole document', () => {
    expect(invertBookmarks(5, [2, 4])).toEqual([1, 3, 5]);
    expect(invertBookmarks(3, [])).toEqual([1, 2, 3]);
    expect(invertBookmarks(3, [1, 2, 3])).toEqual([]);
  });
});
