# Feature 11 — Bookmark Line Operations (Notepad++ "Search → Bookmark" submenu)

**Phase:** 4 (Search & Navigation) — parity with Notepad++'s **Search →
Bookmark → Cut / Copy / Remove Bookmarked Lines, Remove Unbookmarked Lines,
Inverse Bookmark**
**Status:** ✅ Delivered

Builds on the bookmark gutter from [Feature 08](08-bookmarks.md): once lines are
bookmarked, operate on them as a set — copy, cut, delete, keep-only, or invert.

---

## 1. Overview

| Capability | Notepad++ equivalent | Effect |
| --- | --- | --- |
| Copy Bookmarked Lines | `IDM_SEARCH_COPYMARKEDLINES` | Bookmarked lines' text → clipboard |
| Cut Bookmarked Lines | `IDM_SEARCH_CUTMARKEDLINES` | Copy, then delete those lines |
| Remove Bookmarked Lines | `IDM_SEARCH_DELETEMARKEDLINES` | Delete the bookmarked lines |
| Remove Unbookmarked Lines | `IDM_SEARCH_DELETEUNMARKEDLINES` | Keep only bookmarked lines |
| Inverse Bookmarks | `IDM_SEARCH_INVERSEMARKS` | Bookmark the unbookmarked, clear the rest |

All five are surfaced in the **Search** dropdown beneath the existing
toggle/next/previous/clear bookmark items.

---

## 2. Architecture

```
 Search menu ─ action id ─► AppComponent.onEditAction
                                   │
                                   ▼
        TextEditorComponent.{copy,cut,remove}BookmarkedLines /
        removeNonBookmarkedLines / inverseBookmarks
                                   │
   bookmarkedLines(state) ─────────┤  reads 1-based marked line numbers
                                   │
   editor/bookmarks.ts pure helpers:
     partitionByBookmarks(lines, marks) → { marked, unmarked }
     invertBookmarks(totalLines, marks) → number[]
                                   │
                                   ▼
   dispatch doc change (+ clearBookmarksEffect) OR setBookmarksEffect
```

### Pure helpers (`editor/bookmarks.ts`)

- **`partitionByBookmarks(lines, marks)`** splits the document's line texts into
  `marked` / `unmarked`, preserving document order. Ignores duplicate and
  out-of-range line numbers. Drives copy/cut/remove/keep.
- **`invertBookmarks(totalLines, marks)`** returns the sorted 1-based line
  numbers that are *not* currently bookmarked. Drives Inverse.

Both are side-effect free and unit-tested without an editor.

### New state effect

`setBookmarksEffect: StateEffect<number[]>` replaces the entire bookmark set
with markers at the given line-start positions (used by Inverse). Both the
gutter `RangeSet` and the line-decoration `DecorationSet` StateFields handle it
by rebuilding from the sorted, de-duplicated positions.

### Component commands

| Method | Behaviour |
| --- | --- |
| `copyBookmarkedLines()` | Writes the marked lines (newline-joined) to the clipboard; returns the count. |
| `cutBookmarkedLines()` | Copies, then calls `removeBookmarkedLines()`. |
| `removeBookmarkedLines()` | Replaces the doc with the `unmarked` lines. |
| `removeNonBookmarkedLines()` | Replaces the doc with the `marked` lines. |
| `inverseBookmarks()` | Dispatches `setBookmarksEffect` with the inverted positions. |

Line-deleting operations also dispatch `clearBookmarksEffect`, because the
anchor lines they pointed at no longer exist after the rewrite. They no-op when
nothing is bookmarked.

---

## 3. Files

| File | Role |
| --- | --- |
| `src/app/editor/bookmarks.ts` | `partitionByBookmarks`, `invertBookmarks`, `setBookmarksEffect` |
| `src/app/editor/bookmarks.spec.ts` | +4 unit tests (partition ×3, invert ×1) |
| `src/app/components/text-editor/text-editor.component.ts` | 5 commands + `keepLines`/`collectBookmarkedLines` helpers |
| `src/app/components/toolbar/toolbar.component.ts` | Search dropdown items |
| `src/app/app.component.ts` | Routes the five actions |

---

## 4. Public API

### `editor/bookmarks.ts`

| Export | Kind | Description |
| --- | --- | --- |
| `partitionByBookmarks(lines, marks)` | function | `{ marked, unmarked }` split by 1-based line number |
| `invertBookmarks(totalLines, marks)` | function | Sorted unbookmarked line numbers |
| `setBookmarksEffect` | StateEffect | Replace the whole bookmark set |

### `TextEditorComponent`

| Method | Returns | Description |
| --- | --- | --- |
| `copyBookmarkedLines()` | `number` | Copy marked lines to clipboard |
| `cutBookmarkedLines()` | `number` | Copy + delete marked lines |
| `removeBookmarkedLines()` | `void` | Delete marked lines |
| `removeNonBookmarkedLines()` | `void` | Keep only marked lines |
| `inverseBookmarks()` | `void` | Invert the bookmark set |

---

## 5. Key decisions

- **Pure partition/invert helpers** keep the set logic unit-tested and let the
  component stay a thin dispatcher.
- **Clipboard via `navigator.clipboard`** (consistent with the Edit-menu copy
  helpers from Increment 6); guarded with `?.` so non-secure contexts no-op.
- **Drop bookmarks after a line-deleting rewrite** rather than trying to remap
  them — the kept lines change identity, so a clean slate is the least
  surprising result and matches Notepad++ (the cut/removed marks are gone).
- **Whole-document rewrite** (single change from `0..doc.length`) keeps undo a
  single step.

---

## 6. Testing

- **Unit:** +4 Jasmine cases (`partitionByBookmarks`, `invertBookmarks`). Total
  suite: **48 passing**.
- **Build:** `npm run build` clean.
- **Manual:** [../MANUAL_TESTING.md](../MANUAL_TESTING.md) §2.15.

---

## 7. Future work

- Paste-back command for cut lines at the caret (Notepad++ pastes via the
  normal clipboard, already supported by Ctrl+V).
- Bookmark persistence across reopen.
