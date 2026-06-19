import {
  unescapeExtended,
  unescapeReplacement,
  compileQuery,
  findAllMatches,
  nextMatchIndex,
  buildReplacement,
  escapeRegExp,
  type FindQuery,
} from './find-engine';

function query(partial: Partial<FindQuery>): FindQuery {
  return {
    term: '',
    mode: 'normal',
    caseSensitive: false,
    wholeWord: false,
    dotMatchesNewline: false,
    ...partial,
  };
}

describe('find-engine escapeRegExp', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
  });
});

describe('find-engine unescapeExtended', () => {
  it('interprets common control escapes', () => {
    expect(unescapeExtended('a\\nb\\tc\\r')).toBe('a\nb\tc\r');
  });

  it('interprets hex, unicode, octal and decimal escapes', () => {
    expect(unescapeExtended('\\x41')).toBe('A');
    expect(unescapeExtended('\\u0042')).toBe('B');
    expect(unescapeExtended('\\o101')).toBe('A');
    expect(unescapeExtended('\\d65')).toBe('A');
  });

  it('keeps unknown escapes verbatim', () => {
    expect(unescapeExtended('\\q')).toBe('\\q');
    expect(unescapeExtended('\\xZZ')).toBe('\\xZZ');
  });

  it('handles a trailing backslash', () => {
    expect(unescapeExtended('abc\\')).toBe('abc\\');
  });
});

describe('find-engine unescapeReplacement', () => {
  it('only interprets \\n \\r \\t \\\\ and preserves group refs', () => {
    expect(unescapeReplacement('a\\nb')).toBe('a\nb');
    expect(unescapeReplacement('$1\\t\\1')).toBe('$1\t\\1');
  });
});

describe('find-engine compileQuery', () => {
  it('returns null for an empty term', () => {
    expect(compileQuery(query({ term: '' }))).toBeNull();
  });

  it('returns null for an invalid regex', () => {
    expect(compileQuery(query({ term: '(', mode: 'regex' }))).toBeNull();
  });

  it('treats the term literally in normal mode', () => {
    const re = compileQuery(query({ term: 'a.b' }))!;
    expect('a.b axb'.match(re)!.length).toBe(1);
  });

  it('adds the dotAll flag for regex with . matches newline', () => {
    expect(compileQuery(query({ term: 'a.b', mode: 'regex', dotMatchesNewline: true }))!.flags).toContain('s');
    expect(compileQuery(query({ term: 'a.b', mode: 'regex' }))!.flags).not.toContain('s');
  });
});

describe('find-engine findAllMatches', () => {
  it('finds case-insensitive occurrences by default', () => {
    expect(findAllMatches('Foo foo FOO', query({ term: 'foo' })).length).toBe(3);
  });

  it('respects match case', () => {
    expect(findAllMatches('Foo foo', query({ term: 'foo', caseSensitive: true }))).toEqual([
      { from: 4, to: 7 },
    ]);
  });

  it('matches whole words only when requested', () => {
    expect(findAllMatches('cat category cat', query({ term: 'cat', wholeWord: true }))).toEqual([
      { from: 0, to: 3 },
      { from: 13, to: 16 },
    ]);
  });

  it('interprets escapes in extended mode', () => {
    expect(findAllMatches('a\nb', query({ term: '\\n', mode: 'extended' }))).toEqual([
      { from: 1, to: 2 },
    ]);
  });

  it('supports regex with dotAll across newlines', () => {
    const m = findAllMatches('a\nb', query({ term: 'a.b', mode: 'regex', dotMatchesNewline: true }));
    expect(m).toEqual([{ from: 0, to: 3 }]);
    expect(findAllMatches('a\nb', query({ term: 'a.b', mode: 'regex' }))).toEqual([]);
  });

  it('does not hang on zero-width regex matches', () => {
    expect(findAllMatches('abc', query({ term: 'x*', mode: 'regex' }))).toEqual([]);
  });
});

describe('find-engine nextMatchIndex', () => {
  const matches = [
    { from: 0, to: 3 },
    { from: 10, to: 13 },
    { from: 20, to: 23 },
  ];

  it('finds the next match after the caret', () => {
    expect(nextMatchIndex(matches, 3, 3, { backward: false, wrapAround: true }).index).toBe(1);
  });

  it('wraps forward when past the last match', () => {
    expect(nextMatchIndex(matches, 23, 23, { backward: false, wrapAround: true })).toEqual({
      index: 0,
      wrapped: true,
    });
  });

  it('does not wrap forward when wrap is off', () => {
    expect(nextMatchIndex(matches, 23, 23, { backward: false, wrapAround: false }).index).toBeNull();
  });

  it('finds the previous match before the caret', () => {
    expect(nextMatchIndex(matches, 20, 23, { backward: true, wrapAround: true }).index).toBe(1);
  });

  it('wraps backward to the last match', () => {
    expect(nextMatchIndex(matches, 0, 0, { backward: true, wrapAround: true })).toEqual({
      index: 2,
      wrapped: true,
    });
  });

  it('returns null for an empty match set', () => {
    expect(nextMatchIndex([], 0, 0, { backward: false, wrapAround: true }).index).toBeNull();
  });
});

describe('find-engine buildReplacement', () => {
  it('inserts the replacement literally in normal mode', () => {
    expect(buildReplacement(query({ term: 'x' }), '$1&y', 'x')).toBe('$1&y');
  });

  it('interprets escapes in extended mode', () => {
    expect(buildReplacement(query({ term: 'x', mode: 'extended' }), 'a\\tb', 'x')).toBe('a\tb');
  });

  it('expands regex group references', () => {
    const q = query({ term: '(\\w+)@(\\w+)', mode: 'regex' });
    expect(buildReplacement(q, '$2.$1', 'user@host')).toBe('host.user');
  });
});
