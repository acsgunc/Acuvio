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

## Conventions

- **Frontend:** Angular 22 standalone components, Signals, zoneless change
  detection, `ChangeDetectionStrategy.OnPush`.
- **Editor:** CodeMirror 6 with `Compartment`-based reconfiguration for runtime
  state changes (theme, wrap, font, language).
- **Backend:** Rust + Tauri 2 commands; serde structs use
  `#[serde(rename_all = "camelCase")]` to match the TypeScript models.
- **Separation:** read-only memory-mapped viewer for GB-scale logs vs. an
  in-memory editable buffer for normal files, chosen automatically by size.
