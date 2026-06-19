# Acuvio Feature Documentation

Detailed technical documentation for each feature increment delivered on top of
the original Acuvio log-analyzer foundation. Each document covers the design,
architecture, files, data flow, public API, key decisions, testing, and future
work for that feature.

For the high-level roadmap and feature matrix, see
[`../DEVELOPMENT.md`](../DEVELOPMENT.md).

## Index

| # | Feature | Phase(s) | Document |
| --- | --- | --- | --- |
| 1 | View Preferences (word wrap, zoom, theme, go-to-line, settings) | 2, 9, 12 | [01-view-preferences.md](01-view-preferences.md) |
| 2 | Editable Document Model (open/save, undo, multi-cursor) | 2, 3, 6 | [02-editable-document-model.md](02-editable-document-model.md) |
| 3 | Syntax Highlighting & Language Registry | 5 | [03-syntax-highlighting.md](03-syntax-highlighting.md) |
| 4 | Edit Operations (line ops, case, blank ops, EOL) | 3 | [04-edit-operations.md](04-edit-operations.md) |
| 5 | Find & Replace (find/replace, case/word/regex, count) | 4 | [05-find-replace.md](05-find-replace.md) |
| 6 | Advanced Line Operations & Insertions (numeric/length sort, randomize, blank-line, date/time, copy path) | 3 | [06-advanced-line-operations.md](06-advanced-line-operations.md) |
| 7 | View Rendering Options (show whitespace, trailing whitespace, active line, zoom, theme) | 2, 9 | [07-view-rendering-options.md](07-view-rendering-options.md) |
| 8 | Bookmarks (toggle / next / previous / clear, gutter marker) | 4 | [08-bookmarks.md](08-bookmarks.md) |
| 9 | Mark (persistent highlight of all occurrences, case/word/regex) | 4 | [09-mark.md](09-mark.md) |
| 10 | Brace Matching (go to / select to matching brace) | 4 | [10-brace-matching.md](10-brace-matching.md) |
| 11 | Bookmark Line Operations (copy/cut/remove/keep/inverse) | 4 | [11-bookmark-line-operations.md](11-bookmark-line-operations.md) |

> Feature scope is guided by a catalog of Notepad++'s own menu commands, so we
> track parity rather than missing features. The full catalog with per-feature
> status lives in [`../notepad-plus-plus-features.md`](../notepad-plus-plus-features.md);
> the rolled-up parity matrix is at the bottom of
> [`../DEVELOPMENT.md`](../DEVELOPMENT.md). For manual verification steps, see
> [`../MANUAL_TESTING.md`](../MANUAL_TESTING.md).

## Conventions

- **Frontend:** Angular 22 standalone components, Signals, zoneless change
  detection, `ChangeDetectionStrategy.OnPush`.
- **Editor:** CodeMirror 6 with `Compartment`-based reconfiguration for runtime
  state changes (theme, wrap, font, language).
- **Backend:** Rust + Tauri 2 commands; serde structs use
  `#[serde(rename_all = "camelCase")]` to match the TypeScript models.
- **Separation:** read-only memory-mapped viewer for GB-scale logs vs. an
  in-memory editable buffer for normal files, chosen automatically by size.
