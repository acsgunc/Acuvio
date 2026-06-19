# Feature 02 — Editable Document Model

**Phases:** 2 (Core Editor), 3 (Editing), 6 (Code Editing)
**Status:** ✅ Delivered

A true text-editing mode alongside the read-only GB-log viewer, selected
automatically by file size.

---

## 1. Overview

Acuvio's foundation is a **read-only** viewer that memory-maps multi-gigabyte
logs and renders a sliding window. That design is ideal for huge files but
cannot edit them: an active `mmap` locks the file on Windows, and editing in the
middle of a GB file would invalidate the byte-offset index.

This feature introduces a **second mode** for normal-sized files: the whole file
is read into memory, edited in a full CodeMirror editor, and written back.

| Mode | Backend | Use case |
| --- | --- | --- |
| `view` | `LogFile` (mmap + line index) | Huge logs, live tailing, search/filter. |
| `edit` | `TextFile` (in-memory String) | Normal files (≤ 50 MiB): full editing. |

The mode is chosen automatically: `open_text` is tried first; if the file
exceeds `MAX_EDIT_BYTES` (50 MiB) the app falls back to `open_log` + the viewer.

---

## 2. Architecture

```
                       openPath(path)
                            │
                ┌───────────┴────────────┐
        open_text (≤50MiB)        open_log (fallback, >50MiB)
                │                          │
          TextFile{content,         LogFile (mmap, index)
          encoding, eol, size}             │
                │                          │
        addEditTab → TextEditorComponent   openAsViewer → LogViewerComponent
                │ (CodeMirror basicSetup)
        edits → dirty flag
                │
         save / saveAs → save_text(path, content, eol)
```

### Line-ending handling

- On open, the dominant EOL (`lf` / `crlf` / `cr`) is detected, content is
  **normalized to `\n`** for editing, and the original EOL is stored per tab.
- On save, `\n` is expanded back to the document's EOL — the on-disk line
  endings are preserved.

---

## 3. Files

### Backend (Rust)

| File | Role |
| --- | --- |
| [`src-tauri/src/text_file.rs`](../../src-tauri/src/text_file.rs) | `open_text` / `save_text` logic, EOL detection, unit tests. |
| [`src-tauri/src/commands.rs`](../../src-tauri/src/commands.rs) | Tauri commands `open_text`, `save_text`, `max_edit_bytes`. |
| [`src-tauri/src/log_file.rs`](../../src-tauri/src/log_file.rs) | `detect_encoding` made `pub` for reuse. |
| [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs) | Registers the new module + commands. |

### Frontend (Angular)

| File | Role |
| --- | --- |
| [`src/app/components/text-editor/text-editor.component.ts`](../../src/app/components/text-editor/text-editor.component.ts) | Editable CodeMirror view (undo/redo, multi-cursor, folding…). |
| [`src/app/services/editor.service.ts`](../../src/app/services/editor.service.ts) | Bridge to `open_text` / `save_text` / `max_edit_bytes`. |
| [`src/app/app.component.ts`](../../src/app/app.component.ts) | Mode selection, tab `dirty` tracking, save/save-as, shortcuts. |
| [`src/app/components/toolbar/toolbar.component.ts`](../../src/app/components/toolbar/toolbar.component.ts) | New / Save / Save As buttons. |
| [`src/app/models.ts`](../../src/app/models.ts) | `Eol`, `TextFile` types. |

---

## 4. Public API

### Tauri commands

```rust
#[tauri::command] fn max_edit_bytes() -> u64;                 // 50 MiB
#[tauri::command] fn open_text(path: String) -> Result<TextFile, String>;
#[tauri::command] fn save_text(path: String, content: String, eol: String) -> Result<u64, String>;
```

```ts
interface TextFile { content: string; encoding: string; eol: 'lf'|'crlf'|'cr'; size: number; }
```

### `TextEditorComponent`

```ts
@Input() content: string;          // initial doc (\n separators)
@Input() wordWrap: boolean;
@Input() fontSize: number;
@Output() dirtyChange: EventEmitter<boolean>;
@Output() cursorLineChange: EventEmitter<number>;

getContent(): string;
getLineCount(): number;
markSaved(): void;                 // resets the dirty baseline
goToLine(line: number): void;
focus(): void;
```

### Keyboard shortcuts (AppComponent `window:keydown`)

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+N` | New empty document |
| `Ctrl/Cmd+O` | Open file |
| `Ctrl/Cmd+S` | Save (prompts if untitled) |
| `Ctrl/Cmd+Shift+S` | Save As |

CodeMirror `basicSetup` additionally provides undo/redo, multi-cursor,
rectangular selection (Alt+drag), bracket matching, auto-closing brackets, code
folding, and in-editor search.

---

## 5. Key Decisions & Trade-offs

- **Two distinct backends** rather than retrofitting editing onto the mmap
  viewer. Editing GB files in place is a fundamentally different problem
  (rope/piece-table + incremental reindex); the read-only fast path stays
  untouched and provably correct.
- **50 MiB edit cap**: keeps the whole document in the renderer, which bounds
  memory and keeps CodeMirror responsive. Larger files open in the viewer.
- **No mmap for editable files**: reading into a `String` avoids the Windows
  file-lock that would block save-over-self.
- **Cheap dirty check**: compare document length first, only stringify-compare
  when lengths match — avoids per-keystroke full-content comparison.

---

## 6. Testing

Rust unit tests in `text_file.rs` (run with `cargo test`):

| Test | Asserts |
| --- | --- |
| `detects_crlf` / `detects_lf` / `detects_cr` | EOL detection picks the dominant style. |
| `roundtrip_normalizes_and_restores_eol` | `open_text` normalizes to `\n`; `save_text` restores CRLF on disk. |

Full suite: **17 passing**. Frontend verified via `npm run build`.

---

## 7. Future Work

- Auto-save (debounced) and crash-recovery backups (Phase 11).
- External-change detection prompts for editable files.
- Encoding/EOL switcher in the UI (currently auto-detected and preserved).
- Replace / replace-all surfaced in the app search panel for edit mode.
