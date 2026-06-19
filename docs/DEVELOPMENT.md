# Acuvio — Development Document

> **Goal:** Evolve **Acuvio** (a Tauri 2 + Angular + CodeMirror 6 log analyzer)
> into a modern text/code editor with **feature parity with Notepad++**, while
> preserving the existing architecture wherever practical.

This document is the single source of truth for the feature roadmap. It captures
**every feature** requested in [`Prompt.md`](../Prompt.md), maps each one to the
**current state** of the Acuvio codebase, and tracks progress.

> Per-feature deep-dive documentation lives in
> [`docs/features/`](features/README.md).

- Status legend: ✅ Done · 🟡 Partial · ⬜ Not started

---

## 1. Architecture Overview

| Layer | Technology | Responsibility |
| --- | --- | --- |
| **Backend** | Rust + Tauri 2 | File I/O, indexing, search, tailing — all heavy work off the UI thread. |
| **Frontend** | Angular 22 (standalone, Signals, zoneless) | UI, state, view orchestration. |
| **Editor** | CodeMirror 6 | Virtualized text rendering of a sliding window. |
| **IPC** | Tauri commands + events | Frontend requests chunks; backend streams results/tail. |

### Key backend modules (`src-tauri/src/`)

| File | Responsibility |
| --- | --- |
| `commands.rs` | Tauri command handlers (open, read window, search, etc.). |
| `indexer.rs` | Background byte-offset line index for O(1) line seeks. |
| `log_file.rs` | Memory-mapped file model (`memmap2`). |
| `search.rs` | ripgrep-based search (`grep-searcher` + `grep-regex`). |
| `tailer.rs` | `notify`-based live tailing of appended bytes. |
| `state.rs` | Shared app/session state. |
| `lib.rs` / `main.rs` | App bootstrap & command registration. |

### Key frontend modules (`src/app/`)

| Path | Responsibility |
| --- | --- |
| `components/log-viewer/` | CodeMirror host, highlighting, search highlight. |
| `components/toolbar/` | Top toolbar actions. |
| `components/filter-panel/` | Include/exclude filtering UI. |
| `components/search-panel/` | Search UI. |
| `components/status-bar/` | Size, line count, position, encoding indicators. |
| `services/log.service.ts` | Open/read window, line index access. |
| `services/search.service.ts` | Search orchestration. |
| `services/tail.service.ts` | Live follow mode. |
| `models.ts` | Shared TypeScript models. |

---

## 2. Feature Matrix (mapped to Prompt.md)

### Phase 2 — Core Editor Features

| Feature | Status | Notes / Where |
| --- | --- | --- |
| Multiple document interface (tabs) | 🟡 | Tabs host both read-only viewers and editable docs; dirty indicator shown. |
| Open / Save / Save As | ✅ | Editable files load via `open_text`; Save / Save As / Ctrl+S / Ctrl+Shift+S write back (`save_text`). |
| Auto Save | ⬜ | New setting + debounced writer. |
| Session restore | 🟡 | Partial state in `state.rs`; persist open tabs + cursor. |
| Recent files | ⬜ | Store in settings; surface in menu. |
| Drag & Drop | ⬜ | Tauri file-drop event → open. |
| File change detection | 🟡 | `tailer.rs` watches via `notify`; extend to external-edit prompts. |
| Read-only mode | ✅ | Default for huge logs (viewer); editable mode for normal files. |
| Encoding detection (UTF‑8/16, ANSI) | 🟡 | Status bar shows encoding; add detection + conversion. |
| Line endings (CRLF/LF/CR) | ✅ | Detected on open, convertible via Edit menu, preserved on save. |
| Zoom | ✅ | Toolbar A−/A+/reset → CodeMirror font-size compartment; persisted. |
| Word Wrap | ✅ | Toolbar toggle → `EditorView.lineWrapping` compartment; persisted. |
| Minimap | ⬜ | Optional CM6 minimap extension. |
| Line numbers | ✅ | CodeMirror gutter. |
| Code folding | 🟡 | Available in editable mode via CodeMirror `basicSetup`; add to viewer. |
| Bookmark lines | ⬜ | Gutter marker + nav. |
| Goto line | ✅ | Toolbar line input → viewer O(1) seek or editor caret move. |
| Goto symbol | ⬜ | Requires outline/symbol provider. |
| Split editor (H/V) | ⬜ | Multi-pane layout. |

### Phase 3 — Editing Features

| Feature | Status | Notes |
| --- | --- | --- |
| Undo / Redo (multi-level) | ✅ | CodeMirror history in editable mode. |
| Multi-cursor editing | ✅ | CodeMirror native (editable mode). |
| Column / rectangular selection | ✅ | `basicSetup` rectangular selection (Alt+drag). |
| Multiple selections | ✅ | CodeMirror native. |
| Duplicate line | ✅ | `copyLineDown` via Edit menu + Ctrl+D. |
| Move line up/down | ✅ | `moveLineUp/Down` via Edit menu + Alt+↑/↓. |
| Join / split lines | 🟡 | Join done (`joinLines`); split pending. |
| Delete line | ✅ | `deleteLine` via Edit menu + Ctrl+Shift+K. |
| Trim whitespace | ✅ | Trim trailing/leading via Edit menu (`edit-commands.ts`). |
| Convert tabs/spaces | ✅ | Tabs→Spaces / Spaces→Tabs via Edit menu. |
| Auto / smart indentation | ✅ | `indentOnInput` + `indentWithTab` (editable mode). |
| Auto-closing brackets/quotes | ✅ | `basicSetup` closeBrackets (editable mode). |
| Smart Home/End, Smart Backspace | 🟡 | CodeMirror default keymap; verify bindings. |
| Incremental search | 🟡 | Backend search exists; editable mode has CM search. |

### Phase 4 — Search

| Feature | Status | Notes |
| --- | --- | --- |
| Find / Replace | 🟡 | Find via `search.rs`; Replace needs editable docs. |
| Find / Replace in files | 🟡 | ripgrep backend can extend to multi-file. |
| Regular expressions | ✅ | `grep-regex`. |
| Whole word / Match case | 🟡 | Case toggle present; add whole-word. |
| Mark matches / Highlight all | ✅ | `search-highlight.ts`. |
| Search history | ⬜ | Persist queries. |
| Search across project | ⬜ | Needs workspace/folder context. |
| Search results panel | 🟡 | `search-panel`; extend to grouped file results. |

### Phase 5 — Syntax Highlighting

| Languages | Status | Notes |
| --- | --- | --- |
| C / C++ / C# / Java | ✅ | `lang-cpp`, `lang-java`; C# via legacy `clike` stream parser. |
| JS / TS | ✅ | `@codemirror/lang-javascript` (jsx + typescript). |
| Python / Go / Rust | ✅ | `lang-python`, `lang-go`, `lang-rust`. |
| HTML / XML / JSON / YAML / SQL / CSS | ✅ | Respective CM6 lang packages. |
| Markdown / PowerShell / Bash | ✅ | `lang-markdown`; PowerShell + Shell via legacy modes. |
| Pluggable language registry | ✅ | `LanguageRegistry` with lazy-loaded definitions; `register()` extensibility seam. |
| Log severity highlighting | ✅ | `log-highlight.ts` (ERROR/WARN/INFO/DEBUG/TRACE, timestamps, IPs, numbers). |

### Phase 6 — Code Editing Features

| Feature | Status | Notes |
| --- | --- | --- |
| Bracket matching / brace highlight | ✅ | `basicSetup` bracketMatching (editable mode). |
| Auto completion | 🟡 | `basicSetup` autocomplete scaffold present; needs language sources. |
| IntelliSense-ready architecture | 🟡 | `LanguageRegistry` provides the per-language seam to attach completion sources. |
| Snippets | ⬜ | CM6 snippet support. |
| Parameter hints | ⬜ | Tooltip provider. |
| Code / symbol navigation | ⬜ | Symbol provider + goto. |
| Folding by syntax | 🟡 | Editable mode folds via grammar; viewer pending. |
| Outline view | ⬜ | Sidebar panel from symbol provider. |

### Phase 7 — File Explorer

| Feature | Status | Notes |
| --- | --- | --- |
| Folder tree | ⬜ | New sidebar component + Rust dir-walk command. |
| Workspace / multiple folders | ⬜ | Workspace model in `state.rs`. |
| File filtering / search | ⬜ | Glob filter. |
| Rename / Delete / Move | ⬜ | Tauri fs commands. |
| New File / New Folder | ⬜ | fs commands. |
| Refresh | ⬜ | Re-walk + diff. |
| Drag & Drop | ⬜ | Tree DnD. |

### Phase 8 — Plugin Architecture

| Feature | Status | Notes |
| --- | --- | --- |
| Plugin discovery / load / unload | ⬜ | Manifest-based plugin dir scan. |
| Commands / menus / tool windows | ⬜ | Contribution points. |
| Event subscriptions | ⬜ | Pub/sub event bus. |
| Editor interaction API | ⬜ | Stable, versioned plugin API surface. |

### Phase 9 — UI Improvements

| Feature | Status | Notes |
| --- | --- | --- |
| Dockable panels | ⬜ | Layout manager. |
| Dark / Light mode | ✅ | Toolbar 🌙/☀️ toggle → `data-theme` on root; CSS-variable themes; persisted. |
| Custom / icon themes | ⬜ | Theme registry. |
| Configurable toolbar | 🟡 | `toolbar` exists; make config-driven. |
| Status bar | ✅ | `status-bar.component.ts`. |
| Command palette | ⬜ | Quick-open command registry. |
| Keyboard shortcut customization | ⬜ | Keymap settings. |
| Context menus | ⬜ | Right-click contributions. |
| Responsive layout | 🟡 | Improve panel resizing. |

### Phase 10 — Productivity Features

| Feature | Status | Notes |
| --- | --- | --- |
| Macro record / playback | ⬜ | Record command stream. |
| Session / workspace management | 🟡 | Extend `state.rs` persistence. |
| Favorites / recent projects | ⬜ | Settings store. |
| Clipboard history | ⬜ | Ring buffer + picker. |
| Compare documents / diff viewer | ⬜ | Diff engine + side-by-side view. |

### Phase 11 — Advanced Features

| Feature | Status | Notes |
| --- | --- | --- |
| Large file support | ✅ | mmap + byte-offset index (`log_file.rs`, `indexer.rs`). |
| Async file loading | ✅ | Background indexing thread. |
| Background indexing | ✅ | `indexer.rs`. |
| Incremental rendering | ✅ | CM6 sliding window. |
| High-performance scrolling | ✅ | Windowed reads. |
| Memory optimization | ✅ | OS-paged mmap, never full copy. |
| Crash recovery / backup / auto recovery | ⬜ | Periodic backup + restore on launch. |

### Phase 12 — Configuration

| Feature | Status | Notes |
| --- | --- | --- |
| JSON configuration | 🟡 | `SettingsService` persists JSON to `localStorage`; move to app config dir next. |
| Import / Export settings | ⬜ | File dialog round-trip. |
| User / workspace settings | ⬜ | Two-tier merge. |
| Theme / font / keyboard settings | 🟡 | Theme + font size done via `SettingsService`; keyboard pending. |

### Phase 13 — Architecture Improvements

| Concern | Status | Notes |
| --- | --- | --- |
| Separation of concerns | 🟡 | Service-per-domain already; continue. |
| Testability | 🟡 | Add unit tests (Karma/Jasmine FE, `cargo test` BE). |
| Extensibility | ⬜ | Registries (language, command, completion, plugin). |
| Performance | ✅ | Core path already optimized. |
| Maintainability | 🟡 | Document conventions. |
| Dependency injection | ✅ | Angular DI. |
| Modular services | ✅ | `services/` split by domain. |

---

## 3. Recommended Implementation Order

Editing the document model is the unlock for most phases. Suggested sequence:

1. **Editable document model** — make CodeMirror editable + Save/Save As
   (enables Phase 3, Replace, undo/redo).
2. **Configuration system** (Phase 12) — needed by nearly every later feature.
3. **View toggles** — Word Wrap, Zoom, Minimap, Code Folding (Phase 2).
4. **Syntax highlighting + language registry** (Phase 5).
5. **Code editing** — bracket match, autocomplete, snippets (Phase 6).
6. **File Explorer** (Phase 7).
7. **UI** — command palette, themes, shortcut customization (Phase 9).
8. **Productivity** — diff, macros, clipboard history (Phase 10).
9. **Crash recovery / backup** (Phase 11).
10. **Plugin architecture** (Phase 8) — last, once the API surface is stable.

> **Trade-off note:** Phases 3, 4 (Replace), 6, and 10 depend on an **editable**
> document model. Acuvio is currently a read-only viewer optimized for GB-scale
> mmap files. Editing GB files in place is a different problem from editing
> normal source files. Recommendation: keep the **read-only mmap viewer** for
> huge logs and add a separate **editable buffer mode** for regular files,
> selected automatically by file size threshold.

---

## 4. Scripts Reference

All build/maintenance scripts live in [`scripts/`](../scripts/) and are wired
through `package.json`.

| Script | npm command | Purpose |
| --- | --- | --- |
| `generate-icon.mjs` | `node scripts/generate-icon.mjs` | Generate the base app icon (PNG) before `tauri icon`. |
| `generate-sample-log.mjs` | `node scripts/generate-sample-log.mjs` | Produce a large sample log for testing GB-scale performance. |
| `generate-test-fixtures.mjs` | `npm run fixtures` / `:large` | Generate per-language, EOL, encoding, edit-ops and viewer-fallback fixtures for [manual testing](MANUAL_TESTING.md). |
| `run.mjs` | `npm run app` (or `run.cmd` / `run.sh`) | One-click launcher: verifies toolchain, installs deps on first run, then opens the app (`--build` / `--web` variants). |
| `build-installer.mjs` | `npm run app:installer` | Build platform installers (NSIS/MSI/DMG/DEB/RPM/AppImage). |
| `update-deps.mjs` | `npm run update` / `:check` / `:latest` | Cross-platform npm + Cargo dependency updater (see [`UPDATING.md`](UPDATING.md)). |
| `update.cmd` / `update.ps1` / `update.sh` | — | OS-specific launchers for the updater. |

### npm scripts (from `package.json`)

| Command | Action |
| --- | --- |
| `npm start` | `ng serve` — web-only UI (no backend commands). |
| `npm run app` | One-click launcher (`run.cmd` / `run.sh` wrap this). |
| `npm run dev` | `tauri dev` — full app with hot reload. |
| `npm run build` | `ng build` — frontend production build. |
| `npm test` | `ng test` — Karma/Jasmine unit tests. |
| `npm run test:run` | One-shot headless Angular/Jasmine run (CI-style). |
| `npm run test:watch` | Interactive Karma watch mode. |
| `npm run test:rust` | Rust backend unit tests (`cargo test --lib`). |
| `npm run fixtures` / `fixtures:large` | Generate manual-test fixtures into `test-fixtures/`. |
| `npm run sample-log` | Generate / `--follow` a sample log. |
| `npm run app:build` | `tauri build` — production app bundle. |
| `npm run app:build:debug` | Debug bundle. |
| `npm run app:installer[:win/:mac/:linux]` | Platform installers. |
| `npm run update[:check/:latest]` | Dependency maintenance. |

### Backend tests / checks

```bash
cargo test     # run Rust unit tests (from src-tauri/)
cargo check    # type-check without building
```

---

## 5. Delivery Process (per Prompt.md)

For every feature/phase the workflow is:

1. Explain the implementation plan.
2. Explain architectural decisions & trade-offs.
3. Implement the code (extend, don't rewrite).
4. Update affected files.
5. Add tests where applicable (Jasmine FE, `cargo test` BE).
6. Provide a summary of changes.
7. List remaining work.

**Principles:** reuse existing components, follow project conventions, keep
modules small and DI-friendly, avoid breaking changes, ship production-ready
increments, and always preserve existing read-only GB-log performance.

---

## 6. Delivered Increments

### Increment 1 — View preferences (Phases 2, 9, 12)

- **Word Wrap** toggle (CodeMirror `lineWrapping` compartment).
- **Zoom** in / out / reset (font-size theme compartment).
- **Go to Line** input in the toolbar (uses the existing O(1) line seek).
- **Light / Dark theme** toggle via `data-theme` on the document root, with a
  full CSS-variable light palette in [`src/styles.scss`](../src/styles.scss).
- **Settings persistence** — new
  [`SettingsService`](../src/app/services/settings.service.ts) stores theme,
  word wrap, and font size in `localStorage` (first slice of Phase 12).

All preferences survive reloads and apply to the active and future tabs.
No backend changes were required; the read-only mmap fast path is unchanged.

### Increment 2 — Editable document model (Phases 2, 3, 6)

Adds a true editing mode alongside the read-only GB-log viewer, selected
automatically by file size.

- **Backend** — new [`text_file.rs`](../src-tauri/src/text_file.rs) module +
  commands `open_text`, `save_text`, `max_edit_bytes`. Files ≤ 50 MiB are read
  into memory (no mmap, so the file isn't locked); larger files fall back to the
  viewer. Line endings are detected on open and **preserved on save** (LF/CRLF/CR).
  Covered by unit tests (`cargo test`, 17 passing).
- **Editable view** — new
  [`TextEditorComponent`](../src/app/components/text-editor/text-editor.component.ts)
  built on CodeMirror `basicSetup`: undo/redo, multi-cursor, rectangular
  selection, bracket matching, auto-close brackets, code folding, and CM search
  all work out of the box. Word-wrap and zoom honor the shared settings.
- **App integration** —
  [`EditorService`](../src/app/services/editor.service.ts) bridges the new
  commands; tabs now carry a `mode` (`view` | `edit`), a `dirty` flag (shown as
  `●` in the tab and `*` on the Save button), and per-tab line ending.
- **Commands & shortcuts** — toolbar **New / Save / Save As**, plus
  **Ctrl+N**, **Ctrl+O**, **Ctrl+S**, **Ctrl+Shift+S**. Closing a dirty tab
  prompts for confirmation; Save As uses the native file dialog.

Search / Filter / Follow remain viewer-only (they rely on the backend file
index) and are disabled for editable tabs. The GB-log fast path is untouched.

**Trade-off:** editing keeps the whole file in the renderer, so it is capped at
50 MiB; huge files stay in the windowed read-only viewer. This preserves
Acuvio's core performance guarantee while adding full editing for normal files.

### Increment 3 — Syntax highlighting & language registry (Phase 5)

Adds per-language syntax highlighting for editable documents via a pluggable,
lazily-loaded registry. Full details:
[`features/03-syntax-highlighting.md`](features/03-syntax-highlighting.md).

- **`LanguageRegistry`** service — table of `LanguageDefinition`s, each with a
  dynamic-`import()` loader; detection by exact filename then extension; resolved
  grammars cached by id. New languages register without editor changes.
- **18 built-in languages** — JS, TS, Python, Rust, HTML, XML, JSON, YAML, SQL,
  CSS, Markdown, C/C++, Java, Go, PHP (dedicated packages) + C#, PowerShell,
  Shell (legacy stream modes). All code-split into lazy chunks.
- **Editor integration** — `TextEditorComponent` gains a `languageId` input
  applied through a dedicated CodeMirror compartment, with race-safe async
  resolution.
- **UI** — status-bar language picker (edit mode) with auto-detection on open
  and Save As.

The GB-log viewer keeps its bespoke severity highlighter; source-grammar
highlighting is editable-mode only.

### Increment 4 — Edit operations (Phase 3, Notepad++ Edit menu)

Adds the bulk of Notepad++'s **Edit** menu for editable documents. Full details:
[`features/04-edit-operations.md`](features/04-edit-operations.md).

- **`edit-commands.ts`** — pure, unit-tested `StateCommand`s: sort asc/desc,
  reverse, remove duplicate/empty lines, join, case conversion (UPPER/lower/
  Proper/Sentence/iNVERT), trim trailing/leading, tabs↔spaces.
- **CodeMirror built-ins** wired for duplicate / move / delete line, toggle
  comment, indent more/less.
- **Reusable `DropdownMenuComponent`** hosts the Edit menu (ready for future
  View/Encoding menus).
- **Keybindings** (Notepad++ parity): Ctrl+D, Ctrl+Shift+K, Ctrl+/, Alt+↑/↓.
- **EOL conversion** to LF/CRLF/CR (applied on save).
- **Tests:** 14 Jasmine cases; Karma switched to zoneless — the project's first
  frontend unit tests.

### Increment 5 — Find & Replace (Phase 4, Notepad++ Search menu)

Adds client-side Find & Replace for editable documents. Full details:
[`features/05-find-replace.md`](features/05-find-replace.md).

- **`ReplacePanelComponent`** — presentational find/replace bar (find + replace
  rows, Match Case / Whole Word / Regex toggles, live match count).
- **`TextEditorComponent`** find/replace surface over `@codemirror/search`:
  `setSearch`, `findNext/Previous`, `replaceNext`, `replaceAll`, `countMatches`.
- **Entry points:** `Ctrl+H` and `Ctrl+F` (edit mode) + a toolbar **Replace**
  button; viewer mode still routes `Ctrl+F` to the backend search panel.
- **Replace All** runs in a single transaction (one undo step).
- **Manual coverage:** [`MANUAL_TESTING.md`](MANUAL_TESTING.md) §2.6; fixtures via
  `npm run fixtures`.

### Increment 6 — Advanced line operations & insertions (Phase 3, Notepad++ Edit menu)

Completes the Notepad++ **Edit** menu's Sort / Line / Insert submenus. Full
details: [`features/06-advanced-line-operations.md`](features/06-advanced-line-operations.md).

- **`edit-commands.ts`** gains numeric / length / case-insensitive sorts,
  `removeConsecutiveDuplicateLines`, `randomizeLines(rng)` (deterministic in
  tests), `insertBlankLineAbove/Below`, and an `insertText(text)` factory.
- **App-level insertions:** Insert Date/Time (short/long) and Copy file
  path / name / directory to clipboard.
- **Tests:** +11 Jasmine cases (**25 total**); numeric sort pushes non-numeric
  lines last, matching Notepad++.
- **Manual coverage:** [`MANUAL_TESTING.md`](MANUAL_TESTING.md) §2.10; new
  `numbers.txt` fixture.

### Increment 7 — View rendering options (Phase 2/9, Notepad++ View menu)

Adds a checkable **View** dropdown for display toggles. Full details:
[`features/07-view-rendering-options.md`](features/07-view-rendering-options.md).

- **`SettingsService`** gains persisted `showWhitespace`, `highlightActiveLine`,
  `highlightTrailingWhitespace` signals + toggles.
- **`TextEditorComponent`** maps a `ViewRenderOptions` to a CodeMirror
  compartment (`highlightWhitespace`/`highlightTrailingWhitespace`; active-line
  disabled via a transparent theme override since `basicSetup` bakes it in).
- **`DropdownMenuComponent`** gains a `checked` field rendering a ✓ column; the
  View menu also hosts Word Wrap, Zoom, and Theme for discoverability.
- **Manual coverage:** [`MANUAL_TESTING.md`](MANUAL_TESTING.md) §2.11.

### Increment 8 — Bookmarks (Phase 4, Notepad++ Search → Bookmark)

Line bookmarks for editable documents. Full details:
[`features/08-bookmarks.md`](features/08-bookmarks.md).

- **`editor/bookmarks.ts`** — RangeSet-backed `StateField`s (gutter `◆` + line
  tint) that map through edits, `StateEffect`s to toggle/clear, and pure
  `nextBookmarkLine`/`prevBookmarkLine` helpers with wrap-around.
- **`TextEditorComponent`** — `toggleBookmark`/`nextBookmark`/`previousBookmark`/
  `clearBookmarks`; Notepad++ shortcuts Ctrl+F2 / F2 / Shift+F2.
- **Bookmarks toolbar dropdown** (edit mode only).
- **Tests:** +6 Jasmine cases (**31 total**).
- **Manual coverage:** [`MANUAL_TESTING.md`](MANUAL_TESTING.md) §2.12.

### Increment 9 — Mark (Phase 4, Notepad++ Search → Mark)

Persistent styled highlighting of all occurrences of a term. Full details:
[`features/09-mark.md`](features/09-mark.md).

- **`editor/mark.ts`** — pure, unit-tested `findMatches` (escape/whole-word/
  regex/invalid-regex/zero-width) + a `StateField` that recomputes decorations
  only on term change or doc edit.
- **`TextEditorComponent`** — `setMark`/`markSelection`/`clearMark`.
- **Replace bar** gains ⭐ Mark / Clear buttons reusing the find term + options.
- **Tests:** +8 Jasmine cases (**39 total**).
- **Test scripts:** `npm run test:run` / `test:watch` / `test:rust` for manual runs.

### Increment 10 — Brace matching (Phase 4, Notepad++ Search → Matching Brace)

Go-to and select-to matching brace. Full details:
[`features/10-brace-matching.md`](features/10-brace-matching.md).

- **`editor/brace-match.ts`** — pure `findMatchingBracket` wrapping
  `@codemirror/language` `matchBrackets`, multi-probing both sides of the caret.
- **`TextEditorComponent`** — `goToMatchingBrace` / `selectToMatchingBrace`;
  Notepad++ shortcuts Ctrl+B / Ctrl+Shift+B; Search dropdown items.
- **Tests:** +5 Jasmine cases (**44 total**).
- **One-click run:** `run.cmd` / `run.sh` / `npm run app` (see §4).

### Increment 11 — Bookmark line operations (Phase 4, Notepad++ Search → Bookmark)

Copy / cut / remove bookmarked lines, remove unbookmarked lines, inverse
bookmarks. Full details:
[`features/11-bookmark-line-operations.md`](features/11-bookmark-line-operations.md).

- **`editor/bookmarks.ts`** — pure `partitionByBookmarks` / `invertBookmarks` +
  `setBookmarksEffect`.
- **`TextEditorComponent`** — `copy/cut/removeBookmarkedLines`,
  `removeNonBookmarkedLines`, `inverseBookmarks`; Search dropdown items.
- **Tests:** +4 Jasmine cases (**48 total**).
- **Cross-platform one-click launchers:** added `run.command` (macOS),
  `Acuvio.desktop` + `scripts/install-linux-launcher.sh` (Linux).

### Increment 12 — Multi-color mark styles (Phase 4, Notepad++ Search → Mark)

Five independent mark highlight colors + clear-all. Full details:
[`features/12-mark-styles.md`](features/12-mark-styles.md).

- **`editor/mark.ts`** — `markField` now holds five `MarkSlot`s; `setMarkEffect`
  carries a `styleIndex`; `clearAllMarksEffect`; five decoration facet entries.
- **`TextEditorComponent`** — `setMark`/`markSelection`/`clearMark` gain a
  `styleIndex`; new `clearAllMarks`. Search dropdown exposes Style 1–5.
- **Tests:** +6 Jasmine cases (**54 total**).

### Increment 13 — Find / Replace / Mark dialog (Phase 4, Notepad++ Ctrl+F)

Full Notepad++ Find dialog for editable documents. Full details:
[`features/13-find-dialog.md`](features/13-find-dialog.md).

- **`editor/find-engine.ts`** — pure engine: `compileQuery`, `findAllMatches`,
  `nextMatchIndex`, `buildReplacement`, `unescapeExtended/Replacement`. Modes
  Normal / Extended / Regex (+ dotAll), case/word/wrap/backward/in-selection.
- **`find-dialog.component.ts`** — tabbed Find / Replace / Mark dialog with
  Count, Find All results list, history, and a status line.
- **`TextEditorComponent`** — `findStep`/`countWith`/`findAllWith`/
  `replaceCurrent`/`replaceAllWith`/`bookmarkMatchingLines` + scope helpers.
- **Keys:** Ctrl+F (Find), Ctrl+H (Replace), F3 / Shift+F3, Enter / Shift+Enter,
  Esc. Removed the obsolete `ReplacePanelComponent`.
- **Tests:** +27 engine cases (**79 total**). Verified in-browser end to end.

---

## 7. Notepad++ Parity Matrix

Derived from Notepad++'s own menu command IDs (`PowerEditor/src/menuCmdID.h`,
`Notepad_plus.rc`). Tracks coverage of Notepad++'s user-facing menus so features
aren't missed. The **full per-feature catalog** (every menu, with status) lives in
[`notepad-plus-plus-features.md`](notepad-plus-plus-features.md). Legend: ✅ Done · 🟡 Partial · ⬜ Not started.

| Notepad++ Menu | Representative commands | Status | Notes |
| --- | --- | --- | --- |
| **File** | New, Open, Save, Save As, Close, Recent, Session, Print | 🟡 | New/Open/Save/Save As/Close done; recent/session/print/rename pending. |
| **Edit** | Undo/redo, line ops, case, blank ops, comment, EOL, column mode, clipboard history | 🟡 | Line/case/blank/comment/indent/EOL + numeric/length/case sort, randomize, blank-line insert, insert date/time, copy-path done; column editor, clipboard history pending. |
| **Search** | Find, Replace, Find in Files, Mark, Incremental, Go to line, Bookmarks, Brace match | 🟡 | Find/Replace (edit, +case/word/regex), filter/regex/go-to-line, bookmarks, Mark, brace-match (go-to/select) done; Find-in-Files, multi-color mark, bookmark line-ops pending. |
| **View** | Word wrap, zoom, folding, document map, function list, full screen, split, show symbols | 🟡 | Wrap/zoom/folding + show-whitespace, trailing-whitespace, active-line toggles (persisted View menu) done; minimap, outline, split, full-screen, EOL symbols pending. |
| **Encoding** | UTF-8/16, ANSI, convert-to, BOM | 🟡 | Detection + status display done; interactive convert/reload-as pending. |
| **Language** | 80+ syntaxes, User Defined Language | 🟡 | 18 languages + pluggable registry; UDL system pending. |
| **Settings** | Preferences, Style Configurator, Shortcut Mapper | 🟡 | Theme/font/wrap settings persisted; full preferences + shortcut mapper pending. |
| **Tools** | MD5/SHA hashing | ⬜ | Not started. |
| **Macro** | Record, Playback, Save, Run-multiple | ⬜ | Not started (Phase 10). |
| **Run** | Run external command with `$(VARS)` | ⬜ | Not started. |
| **Window** | Tab list, sort tabs, windows dialog | 🟡 | Basic tabs done; sorting/window manager pending. |
| **Misc** | Live tail (Monitoring), large-file performance, multi-cursor, column select | ✅ | Live tail + GB performance are Acuvio's core strengths; multi-cursor/column via CodeMirror. |

