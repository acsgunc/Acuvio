# Manual Testing Guide

This guide describes how to manually exercise every delivered Acuvio feature
end-to-end in the running desktop app. It complements the automated suites
(Rust unit tests + Angular/Jasmine specs) by covering the things automation
can't easily verify: native file dialogs, rendering, keyboard shortcuts, and
the GB-scale viewer fast path.

> Automated tests still run first. See the bottom of this file for the commands.

---

## 1. Prerequisites

1. Install dependencies (once):
   ```bash
   npm install
   ```
2. Generate the test fixtures:
   ```bash
   npm run fixtures
   # or, to also create the 52 MiB viewer-fallback file:
   npm run fixtures:large
   ```
   This writes sample files into `test-fixtures/` (git-ignored):

   | File | Purpose |
   | --- | --- |
   | `sample.ts` `sample.py` `sample.rs` `sample.json` `sample.sql` `sample.md` | Syntax highlighting per language |
   | `eol-lf.txt` `eol-crlf.txt` `eol-cr.txt` | EOL detection & conversion |
   | `edit-ops.txt` | Sort / dedupe / trim / case / blank-line ops |
   | `numbers.txt` | Numeric & length sorting, non-numeric ordering |
   | `utf8-bom.txt` | Encoding/BOM detection |
   | `app.log` (5000 lines) | Search / filter / severity highlighting |
   | `large-over-50mb.log` (with `--large`) | Read-only viewer fallback |

3. (Optional) Generate a multi-gigabyte log + a live-append stream for the
   viewer and Follow mode:
   ```bash
   npm run sample-log -- 1024 test-fixtures/huge.log     # ~1 GB
   npm run sample-log -- --follow test-fixtures/live.log  # appends forever
   ```

4. Launch the app in dev mode:
   ```bash
   npm run dev
   ```

---

## 2. Test matrix by feature

Walk these in order. Each row lists the steps and the expected result. Mark
PASS/FAIL as you go.

### 2.1 File open & viewer vs editor selection (Increment 2)

| Step | Expected |
| --- | --- |
| File → Open `test-fixtures/sample.ts` (or Ctrl+O) | Opens in the **editor** (caret visible, text selectable/typable) |
| Open `test-fixtures/app.log` | Opens in the editor (under 50 MiB) |
| Open `test-fixtures/large-over-50mb.log` | Falls back to the **read-only viewer** (no caret; fast scroll) |
| Open `test-fixtures/huge.log` (~1 GB) | Opens near-instantly in the viewer; scrolling stays smooth |

### 2.2 New / Save / Save As (Increment 2)

| Step | Expected |
| --- | --- |
| Ctrl+N (or New button) | New empty editable tab, marked unsaved |
| Type some text | Tab shows a dirty indicator (•) |
| Ctrl+S on a new file | Native Save dialog; after saving, dirty indicator clears |
| Edit again, Ctrl+S | Saves silently (no dialog), dirty clears |
| Ctrl+Shift+S | Save As dialog; saving to a new path updates the tab title |

### 2.3 View preferences (Increment 1)

| Step | Expected |
| --- | --- |
| Toggle Word Wrap | Long lines wrap / unwrap immediately |
| Zoom + / − | Font size changes; status bar reflects it |
| Toggle theme (dark/light) | Whole UI + syntax colors switch |
| Close & reopen the app | Theme, wrap, and font size are **persisted** |

### 2.4 Syntax highlighting (Increment 3)

| Step | Expected |
| --- | --- |
| Open each `sample.*` fixture | Correct language auto-detected from extension; tokens colored |
| Open `sample.json`, change status-bar language to `YAML` | Highlighting switches live |
| Open DevTools Network tab while switching languages | Language grammar loads as a **lazy chunk** (only when first used) |
| Switch theme while a code file is open | Syntax colors adapt to the theme |

### 2.5 Edit operations (Increment 4)

Open `test-fixtures/edit-ops.txt`, then use the **Edit** dropdown menu (or the
listed shortcuts) and verify each transform against the messy input:

| Operation | Expected on `edit-ops.txt` |
| --- | --- |
| Sort Lines Ascending / Descending | Lines reorder lexicographically |
| Remove Duplicate Lines | The second `apple` disappears |
| Remove Empty Lines | Empty and whitespace-only lines removed |
| Reverse Line Order | Order flips |
| Join Lines (select 2+) | Selected lines merge into one |
| UPPER / lower / Proper / Sentence / Invert case | `MixedCase Text Here` transforms accordingly |
| Trim Trailing / Leading Whitespace | `Date  ` and `\tTabIndented` clean up |
| Tabs → Spaces / Spaces → Tabs | Indentation converts |
| Duplicate Line (Ctrl+D) | Current line duplicated below |
| Move Line Up / Down | Current line swaps with neighbor |
| Delete Line | Current line removed |
| Toggle Comment (Ctrl+/) | Line comment added/removed (code files) |

After any op the tab should become **dirty**; Ctrl+Z must undo it in one step.

### 2.6 Find & Replace (Increment 5)

Open any editable file (e.g. `sample.py`):

| Step | Expected |
| --- | --- |
| Ctrl+F or Ctrl+H (or the **Replace** toolbar button) | Find & Replace bar appears; find box auto-focused |
| Type a term in the Find box | Match count updates; Enter jumps to next match |
| Find Next / Find Previous buttons | Selection moves between matches, wrapping around |
| Toggle Match Case | Case-sensitive matching changes the count |
| Toggle Whole Word | Only full-word matches count |
| Toggle Regex, search e.g. `\bdef\b` | Regex matching works |
| Type a Replace value, click Replace | Current match replaced; moves to next |
| Replace All | Every match replaced; document becomes dirty |
| Esc / Close button | Bar closes; editor keeps focus |

### 2.7 EOL conversion & encoding (Increment 2)

| Step | Expected |
| --- | --- |
| Open `eol-crlf.txt` | Status bar / EOL control shows **CRLF** |
| Open `eol-lf.txt` / `eol-cr.txt` | Shows **LF** / **CR** respectively |
| Change EOL to Unix (LF) and Save | File written with `\n` line endings |
| Open `utf8-bom.txt` | Encoding detected as UTF-8 (BOM preserved on save) |

### 2.8 Log viewer: Search, Filter, Follow

Open `test-fixtures/app.log` (or `huge.log`) — these use the **viewer**:

| Step | Expected |
| --- | --- |
| Toggle Search, query `ERROR` | Match list populates; clicking a result scrolls to the line |
| Search with Regex enabled, e.g. `req=\d{3}` | Regex matches highlighted |
| Toggle Filter, filter `WARN` | Only matching lines shown; status bar shows matched count |
| Clear Filter | All lines return |
| Severity coloring | INFO/WARN/ERROR/DEBUG/TRACE lines color-coded |
| Enable Follow, then append with the `--follow` sample-log script | View auto-scrolls to new lines (tail -f) |
| Go to Line N | Viewport jumps to that line |

### 2.9 Tabs

| Step | Expected |
| --- | --- |
| Open several files | Each gets its own tab; click to switch |
| Edit one tab | Only that tab shows the dirty indicator |
| Close a tab | Remaining tabs unaffected |

### 2.10 Advanced line operations & insertions (Increment 6)

Open `test-fixtures/numbers.txt` for the sorting rows and
`test-fixtures/edit-ops.txt` for the rest. Use the **Edit** dropdown menu.

| Operation | Expected |
| --- | --- |
| Sort Lines (Ignore Case) on `edit-ops.txt` | `Apple`/`apple` group together regardless of case |
| Sort Lines as Integers ↑ on `numbers.txt` | Order becomes `item 1, item 2, item 3, item 10, item 21, item 100`, then `no-number-here` last |
| Sort Lines as Integers ↓ | Reverse numeric order; `no-number-here` still last |
| Sort Lines by Length ↑ / ↓ | Lines reorder shortest→longest / longest→shortest |
| Reverse Line Order | Lines reverse |
| Randomize Line Order | Lines shuffle; running it again reshuffles; no line is lost |
| Remove Duplicate Lines | All duplicates removed (keeps first) |
| Remove Consecutive Duplicates | Only *adjacent* duplicate lines collapse |
| Remove Empty Lines | Blank / whitespace-only lines removed |
| Insert Blank Line Above / Below | An empty line appears above / below the caret line |
| Insert Date/Time (Short) | Locale short date+time string inserted at caret |
| Insert Date/Time (Long) | Locale full date + time string inserted at caret |
| Copy Full File Path | Clipboard holds the file's absolute path (paste to verify) |
| Copy File Name | Clipboard holds just the file name |
| Copy Directory Path | Clipboard holds the containing folder path |

After any buffer-changing op the tab becomes **dirty** and a single Ctrl+Z
undoes it. The three "Copy …" items don't modify the document.

### 2.11 View rendering options (Increment 7)

Open any editable file (e.g. `sample.ts` or `edit-ops.txt`) and use the **View**
dropdown menu. Each toggle shows a ✓ when active.

| Step | Expected |
| --- | --- |
| View → Word Wrap | Long lines wrap/unwrap; checkmark reflects state |
| View → Show Whitespace | Spaces and tabs render as visible glyphs |
| View → Highlight Trailing Whitespace | Trailing spaces/tabs at line ends get a tint (try `edit-ops.txt`'s `Date  ` line) |
| View → Highlight Active Line | The caret's line background turns on/off live |
| View → Zoom In / Zoom Out / Restore Default Zoom | Font size changes; status bar updates |
| View → Dark Theme | Whole UI + syntax colors switch; checkmark reflects dark/light |
| Close & reopen the app | **All** View toggles persist (stored in `localStorage`) |

---

## 3. Regression sweep (run before every release)

1. `npm run build` — production bundle succeeds.
2. Frontend tests:
   ```bash
   npx ng test --watch=false --browsers=ChromeHeadless
   ```
3. Backend tests:
   ```bash
   cd src-tauri && cargo test --lib
   ```
4. Walk §2.1–§2.9 above with freshly generated fixtures.

Record results (date, version, PASS/FAIL per section) in your release notes.

---

## 4. Fixture script reference

`scripts/generate-test-fixtures.mjs` (run via `npm run fixtures`):

| Flag | Effect |
| --- | --- |
| *(none)* | Writes all small fixtures to `test-fixtures/` |
| `<outDir>` | First positional arg overrides the output directory |
| `--large` | Also writes `large-over-50mb.log` (~52 MiB) for the viewer-fallback test |

`scripts/generate-sample-log.mjs` (run via `npm run sample-log`):

| Usage | Effect |
| --- | --- |
| `npm run sample-log -- <MB> [outPath]` | Generate an ~`<MB>` megabyte log (default 100 MB) |
| `npm run sample-log -- --follow [outPath]` | Continuously append lines for Follow-mode testing |

All generated files live under `test-fixtures/` (and `sample.log`), which are
git-ignored.
