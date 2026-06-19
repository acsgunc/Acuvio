import { StateField, StateEffect, RangeSet, type Extension } from '@codemirror/state';
import { EditorView, GutterMarker, gutter, Decoration, type DecorationSet } from '@codemirror/view';

/**
 * Bookmark support for the editable document view (Notepad++ Search → Bookmark).
 *
 * Bookmarks are anchored to line-start positions and survive edits because they
 * live in a {@link StateField} backed by a {@link RangeSet} (CodeMirror maps the
 * positions through every change). A gutter renders a marker and the whole line
 * gets a subtle background.
 *
 * The pure navigation helpers ({@link nextBookmarkLine} / {@link prevBookmarkLine})
 * are exported separately so they can be unit-tested without an editor.
 */

/** Toggle the bookmark at a document position (snapped to its line start). */
export const toggleBookmarkEffect = StateEffect.define<number>();
/** Remove every bookmark. */
export const clearBookmarksEffect = StateEffect.define<null>();
/** Replace the whole bookmark set with bookmarks at the given line-start positions. */
export const setBookmarksEffect = StateEffect.define<number[]>();

class BookmarkMarker extends GutterMarker {
  override toDOM(): Node {
    const span = document.createElement('span');
    span.textContent = '\u25C6'; // ◆
    span.className = 'cm-bookmark-marker';
    return span;
  }
}

const bookmarkMarker = new BookmarkMarker();
const bookmarkLineDeco = Decoration.line({ class: 'cm-bookmark-line' });

/** State field holding the set of bookmarked line-start positions (gutter). */
const bookmarkGutterField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(set, tr) {
    set = set.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(toggleBookmarkEffect)) {
        const line = tr.state.doc.lineAt(effect.value);
        set = toggleAt(set, line.from, () => bookmarkMarker.range(line.from));
      } else if (effect.is(setBookmarksEffect)) {
        const ranges = [...new Set(effect.value)]
          .sort((a, b) => a - b)
          .map((pos) => bookmarkMarker.range(pos));
        set = RangeSet.of(ranges, true);
      } else if (effect.is(clearBookmarksEffect)) {
        set = RangeSet.empty;
      }
    }
    return set;
  },
});

/** State field mirroring the gutter set as full-line background decorations. */
const bookmarkLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(set, tr) {
    set = set.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(toggleBookmarkEffect)) {
        const line = tr.state.doc.lineAt(effect.value);
        set = toggleAt(set, line.from, () => bookmarkLineDeco.range(line.from));
      } else if (effect.is(setBookmarksEffect)) {
        const ranges = [...new Set(effect.value)]
          .sort((a, b) => a - b)
          .map((pos) => bookmarkLineDeco.range(pos));
        set = Decoration.set(ranges, true);
      } else if (effect.is(clearBookmarksEffect)) {
        set = Decoration.none;
      }
    }
    return set;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Add a range at `pos` if none exists there, otherwise remove the one present. */
function toggleAt<T extends { range: { from: number } }>(
  set: RangeSet<any>,
  pos: number,
  make: () => any,
): RangeSet<any> {
  let exists = false;
  set.between(pos, pos, () => {
    exists = true;
    return false;
  });
  if (exists) {
    return set.update({ filter: (from) => from !== pos });
  }
  return set.update({ add: [make()], sort: true });
}

const bookmarkGutter = gutter({
  class: 'cm-bookmark-gutter',
  markers: (view) => view.state.field(bookmarkGutterField),
  initialSpacer: () => bookmarkMarker,
});

const bookmarkTheme = EditorView.baseTheme({
  '.cm-bookmark-gutter': { width: '14px' },
  '.cm-bookmark-marker': { color: '#3794ff' },
  '.cm-bookmark-line': { backgroundColor: 'rgba(55, 148, 255, 0.10)' },
});

/** The complete bookmark extension bundle for the editor. */
export function bookmarks(): Extension {
  return [bookmarkGutterField, bookmarkLineField, bookmarkGutter, bookmarkTheme];
}

/** Read the sorted list of 1-based bookmarked line numbers from a state. */
export function bookmarkedLines(state: { field: (f: any) => any; doc: any }): number[] {
  const set = state.field(bookmarkGutterField) as RangeSet<GutterMarker>;
  const lines: number[] = [];
  const cursor = set.iter();
  while (cursor.value) {
    lines.push(state.doc.lineAt(cursor.from).number);
    cursor.next();
  }
  return lines;
}

/**
 * The next bookmarked line strictly after `current`, wrapping to the first.
 * Returns `null` when there are no bookmarks. `lines` need not be sorted.
 */
export function nextBookmarkLine(lines: number[], current: number): number | null {
  if (lines.length === 0) return null;
  const sorted = [...lines].sort((a, b) => a - b);
  for (const l of sorted) {
    if (l > current) return l;
  }
  return sorted[0];
}

/**
 * The previous bookmarked line strictly before `current`, wrapping to the last.
 * Returns `null` when there are no bookmarks. `lines` need not be sorted.
 */
export function prevBookmarkLine(lines: number[], current: number): number | null {
  if (lines.length === 0) return null;
  const sorted = [...lines].sort((a, b) => a - b);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i] < current) return sorted[i];
  }
  return sorted[sorted.length - 1];
}

/**
 * Split a document's lines into those that are bookmarked and those that are not.
 *
 * `bookmarked` is a list of 1-based line numbers (any order, duplicates ignored);
 * out-of-range numbers are ignored. Both result arrays preserve document order.
 * Pure so it can be unit-tested without an editor.
 */
export function partitionByBookmarks(
  lines: string[],
  bookmarked: number[],
): { marked: string[]; unmarked: string[] } {
  const set = new Set(bookmarked);
  const marked: string[] = [];
  const unmarked: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (set.has(i + 1)) marked.push(lines[i]);
    else unmarked.push(lines[i]);
  }
  return { marked, unmarked };
}

/**
 * Invert a bookmark selection: returns the 1-based line numbers in
 * `[1..totalLines]` that are NOT currently bookmarked, sorted ascending.
 */
export function invertBookmarks(totalLines: number, bookmarked: number[]): number[] {
  const set = new Set(bookmarked);
  const out: number[] = [];
  for (let n = 1; n <= totalLines; n++) {
    if (!set.has(n)) out.push(n);
  }
  return out;
}

