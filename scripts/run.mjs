// Acuvio one-click launcher.
//
// A single entry point that gets a fresh checkout running with no prior
// knowledge: it verifies the toolchain, installs npm dependencies on first run,
// then launches the desktop app (`tauri dev`). Double-click `run.cmd` (Windows),
// `run.sh` (macOS/Linux), or invoke `npm run app` / `node scripts/run.mjs`.
//
// Flags:
//   --build   Build a production desktop bundle instead of launching dev mode.
//   --web     Serve the Angular UI only (no Rust backend), e.g. for quick UI work.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const mode = args.includes('--build') ? 'build' : args.includes('--web') ? 'web' : 'dev';
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

function log(msg) {
  console.log(`\x1b[36m[acuvio]\x1b[0m ${msg}`);
}
function fail(msg) {
  console.error(`\x1b[31m[acuvio] ${msg}\x1b[0m`);
  process.exit(1);
}

/**
 * Run a command inheriting stdio; returns the exit status.
 *
 * On Windows, npm/cargo are `.cmd`/`.bat` shims. Since a recent Node.js security
 * change, `spawnSync` refuses to execute these without a shell (it returns
 * immediately with no output), so we run through a shell on Windows.
 */
function run(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: isWin, ...opts });
  if (res.error) fail(`failed to start "${cmd}": ${res.error.message}`);
  return res.status ?? 1;
}

/** Check a tool is on PATH by running `<tool> --version`. */
function has(tool) {
  const res = spawnSync(tool, ['--version'], { stdio: 'ignore', shell: isWin });
  return res.status === 0;
}

// --- 1. Toolchain checks -------------------------------------------------
log(`mode: ${mode}`);

if (!has('node')) fail('Node.js is required. Install: https://nodejs.org');

if (mode !== 'web' && !has('cargo')) {
  fail('Rust/Cargo is required for the desktop app. Install: https://rustup.rs (or use --web for UI only).');
}

// --- 2. First-run dependency install -------------------------------------
if (!existsSync(join(root, 'node_modules'))) {
  log('Installing npm dependencies (first run)…');
  if (run(npm, ['install']) !== 0) fail('npm install failed.');
} else {
  log('Dependencies present — skipping install.');
}

// --- 3. Launch -----------------------------------------------------------
let status;
switch (mode) {
  case 'build':
    log('Building production desktop bundle (this can take a while)…');
    status = run(npm, ['run', 'app:build']);
    if (status === 0) log('Build complete — see src-tauri/target/release/bundle/.');
    break;
  case 'web':
    log('Starting the Angular dev server (UI only). Press Ctrl+C to stop.');
    status = run(npm, ['start']);
    break;
  default:
    log('Launching Acuvio (tauri dev). The desktop window will open shortly. Ctrl+C to stop.');
    status = run(npm, ['run', 'dev']);
}

process.exit(status);
