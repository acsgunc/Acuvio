# Feature 08 — Bookmarks (Notepad++ "Search → Bookmark")

**Phase:** 4 (Search & Navigation) — parity with Notepad++'s **Search → Bookmark**
**Status:** ✅ Delivered

Line bookmarks for editable documents: toggle, jump to next/previous (wrapping),
and clear-all, with a gutter marker and a subtle line highlight. Bookmarks track
edits automatically.

---

## 1. Overview

| Capability | Notepad++ equivalent | Shortcut |
| --- | --- | --- |
| Toggle Bookmark | `IDM_SEARCH_TOGGLE_BOOKMARK` | Ctrl+F2 |
| Next Bookmark | `IDM_SEARCH_NEXT_BOOKMARK` | F2 |
| Previous Bookmark | `IDM_SEARCH_PREV_BOOKMARK` | Shift+F2 |
| Clear All Bookmarks | `IDM_SEARCH_CLEAR_BOOKMARKS` | — |

Surfaced through a **Bookmarks** toolbar dropdown (edit mode only) and the
keyboard shortcuts above.

---

## 2. Architecture

```
 Toolbar "Bookmarks" menu / Ctrl+F2 / F2 / Shift+F2
        │  action id
        ▼
 AppComponent.onEditAction(id) ──► TextEditorComponent.{toggle,next,previous,clear}Bookmark
        │                                          │
        │                              effects: toggleBookmarkEffect / clearBookmarksEffect
        ▼                                          ▼
   editor/bookmarks.ts:  bookmarkGutterField (RangeSet<GutterMarker>)
                         bookmarkLineField   (DecorationSet, line background)
                         bookmarkGutter      (renders ◆)
                         nextBookmarkLine / prevBookmarkLine  (pure, tested)
```

### Why a RangeSet-backed StateField

Bookmarks are anchored to **line-start positions** inside a CodeMirror
`RangeSet`. On every transaction the set is mapped through `tr.changes`, so
inserting/deleting text above a bookmark moves it correctly — no manual
bookkeeping. Two parallel fields keep concerns separate:

- `bookmarkGutterField` → `RangeSet<GutterMarker>` drives the gutter `◆`.
- `bookmarkLineField` → `DecorationSet` provides the full-line background and is
  exposed to the view via `provide: EditorView.decorations.from(...)`.

### Pure navigation helpers

`nextBookmarkLine(lines, current)` and `prevBookmarkLine(lines, current)` are
pure functions over a list of line numbers with wrap-around semantics. They are
exported and unit-tested independently of any editor instance, mirroring the
`edit-commands.ts` pattern.

### Toggle semantics

`toggleAt` checks for an existing range at the position (`set.between(pos, pos)`)
and either filters it out or adds a new one — a single idempotent helper shared
by both fields.

---

## 3. Files

| File | Role |
| --- | --- |
| `src/app/editor/bookmarks.ts` | State fields, effects, gutter, theme, `bookmarks()` extension, pure nav helpers |
| `src/app/editor/bookmarks.spec.ts` | 6 unit tests for the nav helpers |
| `src/app/components/text-editor/text-editor.component.ts` | `toggleBookmark`, `nextBookmark`, `previousBookmark`, `clearBookmarks`; F2 keymap; registers `bookmarks()` |
| `src/app/components/toolbar/toolbar.component.ts` | Bookmarks dropdown (`bookmarkMenuItems`) |
| `src/app/app.component.ts` | Routes bookmark actions in `onEditAction` |

---

## 4. Public API (bookmarks.ts)

| Export | Kind | Description |
| --- | --- | --- |
| `bookmarks()` | `() => Extension` | The full bookmark extension bundle |
| `toggleBookmarkEffect` | `StateEffect<number>` | Toggle at a document position |
| `clearBookmarksEffect` | `StateEffect<null>` | Remove all bookmarks |
| `bookmarkedLines(state)` | function | Sorted 1-based bookmarked line numbers |
| `nextBookmarkLine(lines, current)` | pure | Next line after `current` (wraps); `null` if none |
| `prevBookmarkLine(lines, current)` | pure | Previous line before `current` (wraps); `null` if none |

### `TextEditorComponent`

| Method | Description |
| --- | --- |
| `toggleBookmark()` | Toggle on the caret's line |
| `nextBookmark()` / `previousBookmark()` | Jump to the next/previous bookmark (wraps) |
| `clearBookmarks()` | Remove all bookmarks |

---

## 5. Key decisions

- **Positions, not line numbers, are stored** so bookmarks survive edits via
  `RangeSet.map`.
- **Two fields** (gutter + line decoration) keep rendering concerns isolated and
  both map through changes consistently.
- **Pure, tested navigation** keeps wrap-around logic verifiable without a DOM.
- **Notepad++ shortcuts** (Ctrl+F2 / F2 / Shift+F2) bound at high precedence.

---

## 6. Testing

- **Unit:** 6 Jasmine cases (empty, next/prev, wrap-around both directions,
  unsorted input). Total suite: **31 passing**.
- **Build:** `npm run build` clean.
- **Manual:** [../MANUAL_TESTING.md](../MANUAL_TESTING.md) §2.12.

---

## 7. Future work

- Cut / copy / remove bookmarked lines; remove non-bookmarked lines; inverse
  bookmarks (Notepad++ bookmark line-operations).
- "Mark" — persistent styled highlighting of all matches of a search term
  (Search → Mark), distinct from bookmarks.
- Persist bookmarks per file across sessions.
