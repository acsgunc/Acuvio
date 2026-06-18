# Updating Acuvio Dependencies

This guide explains how to keep Acuvio's dependencies current — both the **npm**
side (Angular, CodeMirror, Tauri JS) and the **Cargo/Rust** side (Tauri,
`memmap2`, `notify`, ripgrep crates) — using the bundled, cross-platform
updater.

The heavy lifting lives in a single Node.js script,
[`scripts/update-deps.mjs`](../scripts/update-deps.mjs), which runs identically
on **Windows, macOS, and Linux** (Node is already required to build Acuvio).
Thin OS-specific launchers are provided for convenience.

---

## TL;DR

```bash
# Preview what's outdated (changes nothing)
npm run update:check

# Apply safe minor/patch updates, then build + test to verify
npm run update

# Jump to the newest major versions (may include breaking changes)
npm run update:latest
```

---

## What the updater does

1. **Checks your environment** — confirms Node.js meets Angular's minimum
   (≥ 22.22 / 24.15 / 26) and reports the npm version.
2. **Updates npm dependencies**
   - *Safe mode* (default): `npm update` within the semver ranges in
     `package.json`.
   - *Latest mode* (`--latest`): reinstalls every dependency at `@latest`,
     allowing major bumps.
   - Runs `npm audit` afterward to surface (not auto-fix) vulnerabilities.
3. **Updates Cargo dependencies**
   - Always runs `cargo update` (newest versions allowed by `Cargo.toml`).
   - With `--latest` **and** [`cargo-edit`](https://github.com/killercup/cargo-edit)
     installed, also runs `cargo upgrade --incompatible` to bump major crate
     versions in `Cargo.toml`.
4. **Verifies** — builds the Angular frontend, runs `cargo test`, and runs
   `cargo check`. Skipped with `--no-verify` or `--check`.

---

## Running it

You can invoke the updater three equivalent ways. Pick whichever fits your
shell.

### 1. Via npm (works everywhere)

```bash
npm run update            # safe updates + verify
npm run update:check      # dry run
npm run update:latest     # newest majors + verify
```

To pass extra flags through npm, add `--`:

```bash
npm run update -- --cargo-only --no-verify
```

### 2. OS-specific launchers

These check for Node/Rust first and print install hints if missing, then forward
all arguments to the Node script.

| OS | Launcher | Example |
| --- | --- | --- |
| **macOS / Linux** | `scripts/update.sh` | `./scripts/update.sh --check` |
| **Windows (PowerShell)** | `scripts/update.ps1` | `.\scripts\update.ps1 --latest` |
| **Windows (cmd.exe)** | `scripts/update.cmd` | `scripts\update.cmd` |

On macOS/Linux, make the shell script executable once:

```bash
chmod +x scripts/update.sh
```

### 3. Directly with Node (most portable)

```bash
node scripts/update-deps.mjs --check
```

---

## Options

| Flag | Description |
| --- | --- |
| `--check` | Dry run. Report outdated deps; change nothing. |
| `--latest` | Bump npm deps to the newest version (allows major upgrades). |
| `--npm-only` | Update only npm dependencies. |
| `--cargo-only` | Update only Rust/Cargo dependencies. |
| `--no-verify` | Skip the build + test verification step. |
| `--yes`, `-y` | Don't prompt for confirmation before major upgrades. |
| `--help`, `-h` | Show usage. |

---

## Prerequisites

- **Node.js** ≥ 22.22 / 24.15 / 26 (required by Angular 22) and **npm**.
- **Rust** (stable, ≥ 1.85 for edition 2024) with **cargo** on `PATH`
  — only needed to update/verify the Tauri backend.
- *(Optional)* **cargo-edit** to enable major Rust crate bumps with `--latest`:

  ```bash
  cargo install cargo-edit
  ```

### Updating the toolchains themselves

The script updates *project dependencies*, not the toolchains. To update the
toolchains:

| Tool | Windows | macOS | Linux |
| --- | --- | --- | --- |
| **Node.js** | `winget install OpenJS.NodeJS.LTS` | `brew install node` | distro pkg / [`nvm`](https://github.com/nvm-sh/nvm) / [`fnm`](https://github.com/Schniz/fnm) |
| **Rust** | `winget install Rustlang.Rustup` then `rustup update` | `rustup update` | `rustup update` |

> If you bump Node across a major (e.g. 22 → 24) on Windows via winget, open a
> **new terminal** afterward so the updated `PATH` is picked up.

---

## Recommended workflow

```bash
# 1. Start from a clean git state so the update is easy to review/revert.
git status

# 2. Preview.
npm run update:check

# 3. Apply. Use the safe mode first; reach for --latest deliberately.
npm run update            # or: npm run update:latest

# 4. Review the changes.
git diff package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock

# 5. Smoke-test the app.
npm run dev

# 6. Commit.
git commit -am "chore: update dependencies"
```

---

## Notes, gotchas & troubleshooting

- **Major upgrades can break things.** `--latest` may pull breaking changes
  (e.g. an Angular major that changes builders, or a crate with a new API).
  After a major bump, read the relevant release notes and run `npm run dev`.
- **Angular major upgrades.** For Angular specifically, the official
  [`ng update`](https://angular.dev/update-guide) runs code migrations that the
  generic updater does not. For a major Angular jump, prefer:

  ```bash
  npx ng update @angular/core @angular/cli
  ```

  then run `npm run update` to catch the rest.
- **Pre-release crates.** `cargo update` / `cargo upgrade` stick to stable
  releases and won't pull `-rc`/`-beta` versions unless you pin them in
  `Cargo.toml`. (For example, Acuvio uses stable `notify 8`, not `notify 9.0-rc`.)
- **PowerShell execution policy.** If `update.ps1` is blocked, run once:

  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
  ```

- **`npm audit` shows vulnerabilities.** The updater reports them but never runs
  `npm audit fix --force` for you, since that can itself introduce breaking
  changes. Address them deliberately.
- **Windows `PATH` after a Node upgrade.** A running terminal keeps its old
  `PATH`; open a fresh shell so the new Node/npm is used.
