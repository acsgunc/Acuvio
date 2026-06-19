import { nextBookmarkLine, prevBookmarkLine } from './bookmarks';

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
