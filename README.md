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

**One click / one command** — installs dependencies on first run, then opens the
desktop window:

- **Windows:** double-click **`run.cmd`**
- **macOS:** double-click **`run.command`** in Finder (first time only: `chmod +x run.command`), or run **`./run.sh`**
- **Linux:** run **`./run.sh`**, or install a menu entry with **`./scripts/install-linux-launcher.sh`** (then launch *Acuvio* from your app menu)
- **Any OS:** **`npm run app`**

Optional flags: `--build` (production bundle) or `--web` (UI only).

Or run the underlying step directly with hot reload:

```bash
npm run dev          # == tauri dev
```

> The Angular dev server runs on `http://localhost:4200`; Tauri loads it
> automatically (`devUrl` in `src-tauri/tauri.conf.json`).

To run only the web UI in a browser (backend commands are unavailable):

```bash
npm start            # ng serve  (or: npm run app:web)
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

## Production installers

A cross-platform helper auto-detects the host OS and builds the right native
installers for it (Tauri cannot cross-compile installers, so run it on each
target OS or in CI):

```bash
npm run app:installer           # all installers for the current OS

# Per-OS shortcuts:
npm run app:installer:win       # NSIS (.exe) + MSI (.msi)
npm run app:installer:mac       # DMG (.dmg) + .app
npm run app:installer:linux     # .deb + .rpm + AppImage

# Or pick specific bundles / a quick debug build:
node scripts/build-installer.mjs --bundles nsis
node scripts/build-installer.mjs --debug
node scripts/build-installer.mjs --help
```

Output lands in `src-tauri/target/release/bundle/` (the script lists each
artifact and its size when the build finishes).

Installer metadata (publisher, copyright, license, per-OS settings) lives in
the `bundle` section of [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json).

### Windows context-menu integration

The Windows installer registers an **"Open with Acuvio"** entry on the
right-click context menu for common log/text file types
(`.log`, `.txt`, `.out`, `.err`, `.json`, `.ndjson`, `.csv`). Right-click any
such file and choose **Open with Acuvio** (under *Show more options* on
Windows 11) to open it directly — if Acuvio is already running it opens in a
new tab instead of launching a second window.

This is implemented without hijacking the default file association (it adds a
secondary verb under `SystemFileAssociations`), and is removed automatically on
uninstall. The registry logic lives in
[`src-tauri/installer-hooks.nsh`](src-tauri/installer-hooks.nsh), wired in via
`bundle.windows.nsis.installerHooks`. Command-line file opening is handled in
the Rust backend ([`src-tauri/src/lib.rs`](src-tauri/src/lib.rs)) using the
single-instance plugin.

> On macOS/Linux the same single-instance handling applies; associate file
> types through `bundle.fileAssociations` in `tauri.conf.json` if you want an
> equivalent "Open with" entry there.

### Runtime dependencies (what the installer checks & installs)

Acuvio ships as a self-contained executable, so end users normally need
**nothing extra**:

- **Microsoft Edge WebView2 Runtime** — the only external dependency (it renders
  the UI). It is preinstalled on Windows 11 and most up-to-date Windows 10
  machines. If it is missing, the installer:
  1. **Detects** it up-front and shows a prompt explaining what is missing;
  2. **Installs it automatically** by downloading Microsoft's official
     bootstrapper (configured via `webviewInstallMode` in
     [`tauri.conf.json`](src-tauri/tauri.conf.json)); and
  3. if the automatic install is declined or fails, opens the **manual download
     page** (<https://go.microsoft.com/fwlink/p/?LinkId=2124703>) so the user
     knows exactly how to install it.

  The detection/prompt logic lives in the `NSIS_HOOK_PREINSTALL` macro in
  [`src-tauri/installer-hooks.nsh`](src-tauri/installer-hooks.nsh).
- **Visual C++ Runtime** — *not required*. Acuvio statically links the MSVC CRT
  ([`src-tauri/.cargo/config.toml`](src-tauri/.cargo/config.toml)), so there is
  no dependency on the "VC++ 2015–2022 Redistributable".

**Per-OS prerequisites (for building installers)**

- **Windows:** WiX (for MSI) and NSIS are downloaded automatically by Tauri on
  the first build. For signed installers, set `WINDOWS_CERTIFICATE` /
  `WINDOWS_CERTIFICATE_PASSWORD` or configure `bundle.windows.signCommand`.
- **macOS:** Xcode command-line tools. For distribution, code-sign and notarize
  via `APPLE_SIGNING_IDENTITY` and the `bundle.macOS` signing settings.
- **Linux:** `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`,
  `libayatana-appindicator3-dev`, `librsvg2-dev` (AppImage downloads
  `linuxdeploy` on first run).


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
│   ├── installer-hooks.nsh    # NSIS hooks: WebView2 check + "Open with" menu
│   ├── .cargo/config.toml     # static CRT (no VC++ redist dependency)
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
├── scripts/                   # build/maintenance helpers (see below)
└── package.json
```

---

## Scripts

All project automation lives in `scripts/` and is kept under version control so
the same workflows are reproducible on any machine and OS:

| Script | Purpose | Run via |
| --- | --- | --- |
| [`build-installer.mjs`](scripts/build-installer.mjs) | Build native installers for the current OS (NSIS/MSI, DMG/.app, deb/rpm/AppImage) | `npm run app:installer` |
| [`update-deps.mjs`](scripts/update-deps.mjs) | Cross-platform npm + Cargo dependency updater with verify step | `npm run update[:check\|:latest]` |
| [`update.sh`](scripts/update.sh) / [`update.ps1`](scripts/update.ps1) / [`update.cmd`](scripts/update.cmd) | Per-OS launchers for the updater | `./scripts/update.sh` etc. |
| [`generate-icon.mjs`](scripts/generate-icon.mjs) | Generate the source app icon | `node scripts/generate-icon.mjs` |
| [`generate-sample-log.mjs`](scripts/generate-sample-log.mjs) | Create / append large sample logs for perf testing | `node scripts/generate-sample-log.mjs 1000` |

The Windows context-menu registration is **not** a script — it is baked into
the installer via [`src-tauri/installer-hooks.nsh`](src-tauri/installer-hooks.nsh),
so it applies automatically whenever an installer is built.

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
