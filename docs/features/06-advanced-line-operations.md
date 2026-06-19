# Feature 06 — Advanced Line Operations & Insertions (Notepad++ "Edit" menu)

**Phase:** 3 (Editing Features) — completing parity with Notepad++'s **Edit → Line Operations**, **Sort**, and **Insert** submenus
**Status:** ✅ Delivered

Extends the editable-document command set with numeric / length / case-insensitive
sorting, consecutive-duplicate removal, line shuffling, blank-line insertion, and
text insertion (Insert Date/Time, Copy file path to clipboard).

---

## 1. Overview

Increment 4 covered the core Edit menu. This increment fills the remaining
Notepad++ **Edit** menu gaps that are expressible as pure, testable transforms,
plus two small app-level insertions.

| Group | New operations |
| --- | --- |
| **Sorting** | Ignore Case, As Integers ↑/↓, By Length ↑/↓ |
| **Line ops** | Randomize Line Order, Remove Consecutive Duplicates |
| **Blank lines** | Insert Blank Line Above / Below |
| **Insert** | Insert Date/Time (Short / Long) |
| **Copy to clipboard** | Full File Path, File Name, Directory Path |

Maps to Notepad++ `IDM_EDIT_*` commands: `IDM_EDIT_SORTLINES_*`,
`IDM_EDIT_SORTLINESINTEGER_*`, `IDM_EDIT_RMV_CONSECUTIVE_DUP_LINES`,
`IDM_EDIT_SORTLINES_RANDOMLY`, `IDM_EDIT_BLANKLINEABOVECURRENT` /
`...BELOWCURRENT`, `IDM_EDIT_INSERT_DATETIME_*`, `IDM_EDIT_FULLPATHTOCLIP` /
`IDM_EDIT_FILENAMETOCLIP` / `IDM_EDIT_CURRENTDIRTOCLIP`.

---

## 2. Architecture

The same two-source model as Increment 4: pure `StateCommand`s for buffer
transforms, with the host component supplying environment-derived values (the
current date/time string, the file path) before invoking a command.

```
 Toolbar Edit menu ── action id ──► AppComponent.onEditAction(id)
                                          │
   pure transforms ──► TextEditorComponent.runCommand(editCommands.*)
                                          │
   value-bearing  ──► insertText(<computed string>)  (date/time)
   side effects   ──► navigator.clipboard.writeText() (copy path)
```

### Why `insertText` is a factory

Date/time formatting and file paths are **environment-derived**, not pure
functions of editor state. Keeping the command pure (`insertText(text)` returns a
`StateCommand` over a fixed string) preserves unit-testability while the
component owns the impure bit (`Date`, `navigator.clipboard`).

### Numeric sort semantics

`sortLinesNumericAscending/Descending` extract the **first** numeric token of
each line (`/-?\d+(?:\.\d+)?/`). Lines with no number sort to the **end** in both
directions, matching Notepad++'s "leftover lines go last" behavior. This handles
the common case of `item 10` vs `item 2` correctly (10 after 2), which a
lexicographic sort gets wrong.

### Deterministic randomize

`randomizeLines(rng = Math.random)` is a factory taking an injectable RNG, so the
Fisher–Yates shuffle is **deterministic in tests** (inject `() => 0`) while
defaulting to `Math.random` in the app.

---

## 3. Files

| File | Change |
| --- | --- |
| `src/app/editor/edit-commands.ts` | + numeric/length/case-insensitive sorts, `removeConsecutiveDuplicateLines`, `randomizeLines`, `insertBlankLineAbove/Below`, `insertText` |
| `src/app/editor/edit-commands.spec.ts` | + 11 unit tests (25 total) |
| `src/app/app.component.ts` | dispatcher cases + `formatDateTime`, `fileName`, `dirName`, `copyToClipboard` helpers |
| `src/app/components/toolbar/toolbar.component.ts` | new Edit-menu items |

---

## 4. Public API (new exports in `edit-commands.ts`)

| Export | Kind | Description |
| --- | --- | --- |
| `sortLinesCaseInsensitiveAscending` / `...Descending` | `StateCommand` | Sort ignoring case |
| `sortLinesNumericAscending` / `...Descending` | `StateCommand` | Sort by leading number; non-numeric last |
| `sortLinesByLengthAscending` / `...Descending` | `StateCommand` | Sort by line length |
| `removeConsecutiveDuplicateLines` | `StateCommand` | `uniq`-style adjacent dedupe |
| `randomizeLines(rng?)` | factory → `StateCommand` | Fisher–Yates shuffle |
| `insertBlankLineAbove` / `insertBlankLineBelow` | `StateCommand` | Insert empty line around caret |
| `insertText(text)` | factory → `StateCommand` | Replace selection / insert at caret |

---

## 5. Key decisions

- **Pure-where-possible**: every buffer transform stays a pure `StateCommand`;
  impurity (clock, clipboard, path) lives in `AppComponent`.
- **Non-numeric lines sort last** for numeric sort — predictable and matches
  Notepad++.
- **Single transaction per command** → one undo step (consistent with Increments
  4–5).
- **Clipboard failures are swallowed** (`navigator.clipboard` can reject without
  focus); copying a path is a convenience, not a critical path.

---

## 6. Testing

- **Unit:** 11 new Jasmine cases (case-insensitive/numeric/length sort, numeric
  non-number ordering, consecutive dedupe, deterministic randomize, blank-line
  above/below, insert text). Total suite: **25 passing**.
- **Build:** `npm run build` clean.
- **Manual:** [../MANUAL_TESTING.md](../MANUAL_TESTING.md) §2.10 — exercises every
  new menu item against `test-fixtures/edit-ops.txt` and `numbers.txt`.

---

## 7. Future work

- Sort "Decimal Comma" vs "Decimal Dot" locale variants.
- Insert Date/Time **customized** format (Notepad++ preference-driven).
- "Copy all filenames / all paths" across every open tab.
- Column-mode number sequence insertion (Column Editor).
