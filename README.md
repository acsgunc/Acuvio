# Acuvio

**Acuvio** — sharp clarity of vision for massive logs. A native, Notepad++‑style
log analyzer built for **multi‑gigabyte** log files with **live tailing**, fast
search, filtering, and severity highlighting — all without ever freezing the UI.

Built with **Tauri 2.0** (Rust backend) + **Angular** (standalone components,
Signals, zoneless) + **CodeMirror 6** (virtualized text rendering).

---

## Why it's fast

| Concern | Approach |
| --- | --- |
| Opening GB files | **Memory‑mapped** I/O via `memmap2` — the OS pages content in on demand; the whole file is never copied into RAM. |
| Jump anywhere instantly | A **byte‑offset line index** built on a background thread enables O(1) seeks to any line, including end‑of‑file. |
| Rendering huge content | The frontend never binds GB‑scale text. **CodeMirror 6** virtualizes a sliding **window** of a few thousand lines; only the visible viewport is in the DOM. |
| Search across everything | The **ripgrep** engine (`grep-searcher` + `grep-regex`) runs multi‑pattern regex/literal search over the mmap on a worker thread. |
| Live tailing | `notify` watches the file; only the **newly appended bytes** are read and emitted via Tauri events — no re‑reads. |
| Responsive UI | All heavy work happens in **Rust off the main thread**; the frontend requests only the chunks it needs. |

---

## Features

- Open very large log files (multiple GB) with low memory footprint.
- Instant scrolling / go‑to‑line / jump‑to‑end.
- Live **Follow** mode that appends new lines in real time.
- Fast **search**: literal & **regex**, case‑sensitive toggle, match highlighting, next/previous navigation.
- **Filter** lines (include / exclude, literal or regex).
- **Severity highlighting**: `ERROR`/`WARN`/`INFO`/`DEBUG`/`TRACE`, timestamps, IPs, numbers.
- Line numbers, status bar (size, line count, position, encoding, indexing/live indicators).
- **Multiple files in tabs.**

---

## Prerequisites

- **Node.js 22.22+ / 24.15+ / 26+** and npm (required by Angular 22)
- **Rust** (stable, 1.85+ for edition 2024) via [rustup](https://rustup.rs)
- Platform build dependencies for Tauri 2 — see the
  [Tauri prerequisites guide](https://tauri.app/start/prerequisites/):
  - **Windows:** Microsoft C++ Build Tools + WebView2 (preinstalled on Win 11).
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`).
  - **Linux:** `webkit2gtk`, `libappindicator`, `librsvg`, `patchelf`, etc.
    (e.g. on Debian/Ubuntu install `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`).

---

## Setup

```bash
npm install
```

Generate the app icons (once):

```bash
node scripts/generate-icon.mjs
npx @tauri-apps/cli icon src-tauri/icons/icon.png
```

---

## Run (development)

Launches the Angular dev server and the Tauri window with hot reload:

```bash
npm run dev          # == tauri dev
```

> The Angular dev server runs on `http://localhost:4200`; Tauri loads it
> automatically (`devUrl` in `src-tauri/tauri.conf.json`).

To run only the web UI in a browser (backend commands are unavailable):

```bash
npm start            # ng serve
```

---

## Build (production)

```bash
npm run app:build    # == tauri build
```

Bundles per platform:

- **Windows:** `.msi` / `.exe` (NSIS) under `src-tauri/target/release/bundle/`
- **macOS:** `.app` / `.dmg`
- **Linux:** `.deb` / `.AppImage` / `.rpm`

> Angular 17+ outputs to `dist/acuvio/browser/`, which is why
> `frontendDist` is set to `../dist/acuvio/browser`. If that path is wrong,
> Tauri shows a blank window.

---

## Tests

Rust unit tests cover the indexing and search logic:

```bash
cd src-tauri
cargo test
```

A helper to create a large sample log for manual performance testing:

```bash
# Generate a ~1 GB sample log at sample.log
node scripts/generate-sample-log.mjs 1000

# Then open it from the app, or append to it live to try Follow mode:
node scripts/generate-sample-log.mjs --follow sample.log
```

---

## Updating dependencies

Use the bundled cross-platform updater (Windows, macOS, Linux):

```bash
npm run update:check     # preview what's outdated
npm run update           # safe minor/patch updates + verify
npm run update:latest    # bump to newest majors
```

See [docs/UPDATING.md](docs/UPDATING.md) for full options, OS-specific
launchers (`scripts/update.sh`, `update.ps1`, `update.cmd`), and guidance on
major upgrades.

---

## Project structure

```
acuvio/
├── src-tauri/                 # Rust backend
│   ├── src/
│   │   ├── main.rs            # thin entry -> acuvio_lib::run()
│   │   ├── lib.rs             # Tauri builder, command/plugin registration
│   │   ├── commands.rs        # #[tauri::command] handlers
│   │   ├── log_file.rs        # memmap2 file handling + line-offset index
│   │   ├── indexer.rs         # background line-offset indexing + progress
│   │   ├── search.rs          # grep-searcher/grep-regex search + filtering
│   │   ├── tailer.rs          # notify-based live tailing -> events
│   │   └── state.rs           # open files + active tailers
│   ├── capabilities/default.json
│   ├── Cargo.toml
│   └── tauri.conf.json        # frontendDist = "../dist/acuvio/browser"
├── src/                       # Angular frontend
│   ├── app/
│   │   ├── components/
│   │   │   ├── log-viewer/    # CodeMirror 6 windowed viewer + highlighting
│   │   │   ├── toolbar/
│   │   │   ├── search-panel/
│   │   │   ├── filter-panel/
│   │   │   └── status-bar/
│   │   ├── services/          # log / tail / search Tauri bridges
│   │   ├── app.component.*    # tabbed shell
│   │   └── models.ts
│   └── styles.scss
├── scripts/                   # icon + sample-log generators
└── package.json
```

---

## Architecture notes

- **Virtualized viewer.** `LogViewerComponent` holds a sliding window
  (`MAX_WINDOW` lines) in the CodeMirror document. As you scroll near an edge,
  the next/previous chunk is fetched from Rust (`read_lines`) and the window
  shifts; the gutter maps doc lines back to absolute file line numbers.
- **Backend ownership.** Rust owns the mmap, the line index, search, and
  tailing. The frontend only requests the chunks it needs to display.
- **Events.** `index-progress` reports background indexing; `log-appended`
  streams newly tailed lines. The Angular services expose these as RxJS
  `Observable`s.

---

## License

MIT. All dependencies are MIT/Apache‑2.0 compatible.
