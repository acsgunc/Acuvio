#!/usr/bin/env node
/**
 * Acuvio dependency updater — cross-platform (Windows, macOS, Linux).
 *
 * Updates the npm (Angular / CodeMirror / Tauri JS) and Cargo (Rust) dependency
 * sets, then verifies the project still builds and passes tests.
 *
 * Because Node.js is already required to build Acuvio, this single script works
 * identically on every OS. The .sh / .ps1 launchers in this folder are thin
 * wrappers that just locate Node and call this file.
 *
 * Usage:
 *   node scripts/update-deps.mjs [options]
 *
 * Options:
 *   --check            Dry run: only report outdated deps, change nothing.
 *   --latest           Bump npm deps to the newest version (allows majors).
 *                      Without this, only safe minor/patch updates are applied.
 *   --npm-only         Update only the npm dependencies.
 *   --cargo-only       Update only the Rust/Cargo dependencies.
 *   --no-verify        Skip the build + test verification step.
 *   --yes, -y          Do not pause for confirmation before applying majors.
 *   --help, -h         Show this help.
 *
 * Examples:
 *   node scripts/update-deps.mjs --check          # see what's outdated
 *   node scripts/update-deps.mjs                  # safe minor/patch updates
 *   node scripts/update-deps.mjs --latest         # jump to newest majors
 *   node scripts/update-deps.mjs --cargo-only     # only Rust crates
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, platform } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC_TAURI = join(ROOT, 'src-tauri');
const IS_WINDOWS = platform === 'win32';

// ---- CLI args ----
const args = new Set(process.argv.slice(2));
const opt = {
  check: args.has('--check'),
  latest: args.has('--latest'),
  npmOnly: args.has('--npm-only'),
  cargoOnly: args.has('--cargo-only'),
  noVerify: args.has('--no-verify'),
  yes: args.has('--yes') || args.has('-y'),
  help: args.has('--help') || args.has('-h'),
};

// ---- tiny ANSI helpers (no deps) ----
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};
const log = (msg = '') => console.log(msg);
const heading = (msg) => log(`\n${c.bold}${c.cyan}=== ${msg} ===${c.reset}`);
const ok = (msg) => log(`${c.green}✓${c.reset} ${msg}`);
const warn = (msg) => log(`${c.yellow}!${c.reset} ${msg}`);
const fail = (msg) => log(`${c.red}✗${c.reset} ${msg}`);
const info = (msg) => log(`${c.dim}${msg}${c.reset}`);

if (opt.help) {
  // Print the leading block comment as help text.
  const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const block = self
    .slice(self.indexOf('/**'))
    .split('*/')[0]
    .replace(/^\/\*\*?/, '')
    .replace(/^ \* ?/gm, '');
  log(block.trim());
  process.exit(0);
}

/**
 * Commands that are .cmd/.bat shims on Windows (npm, npx). These cannot be
 * launched directly without a shell, so we invoke them through cmd.exe with
 * `shell: false` (avoids the DEP0190 shell-injection footgun entirely).
 * Real executables (cargo.exe, where.exe) run directly.
 */
const WIN_SHIMS = new Set(['npm', 'npx']);

/** npm package-name grammar, used to validate any dynamically-built args. */
const NPM_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * Run a command, streaming output. Cross-platform and shell-free: on Windows,
 * npm/npx shims are invoked via `cmd /c` without enabling the shell option.
 * @returns {{ status: number, stdout: string }}
 */
function run(cmd, cmdArgs, { cwd = ROOT, capture = false, allowFail = false } = {}) {
  const display = `${cmd} ${cmdArgs.join(' ')}`;
  info(`$ ${display}`);

  let exec = cmd;
  let execArgs = cmdArgs;
  if (IS_WINDOWS && WIN_SHIMS.has(cmd)) {
    exec = process.env.ComSpec || 'cmd.exe';
    execArgs = ['/d', '/s', '/c', cmd, ...cmdArgs];
  }

  const result = spawnSync(exec, execArgs, {
    cwd,
    shell: false,
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) {
    if (allowFail) return { status: 1, stdout: '' };
    fail(`Failed to launch: ${display}\n${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0 && !allowFail) {
    fail(`Command failed (exit ${result.status}): ${display}`);
    if (capture && result.stderr) log(result.stderr);
    process.exit(result.status ?? 1);
  }
  return { status: result.status ?? 0, stdout: result.stdout ?? '' };
}

/** Check whether an executable is available on PATH. */
function has(cmd) {
  const probe = IS_WINDOWS ? 'where' : 'which';
  const r = spawnSync(probe, [cmd], { shell: false, encoding: 'utf8' });
  return r.status === 0;
}

async function confirm(question) {
  if (opt.yes || opt.check) return true;
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(`${c.yellow}?${c.reset} ${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

// ---- Node.js version guard (Angular 22 needs >= 22.22 / 24.15 / 26) ----
function checkNodeVersion() {
  heading('Environment');
  const [maj, min] = process.versions.node.split('.').map(Number);
  ok(`Node.js ${process.versions.node}`);
  const okNode =
    (maj === 22 && min >= 22) || (maj === 24 && min >= 15) || maj >= 26 || (maj === 23);
  if (!okNode) {
    warn(
      `Angular 22 requires Node >= 22.22, 24.15, or 26. You have ${process.versions.node}.\n` +
        `  Update Node first (see docs/UPDATING.md), then re-run this script.`,
    );
  }
  ok(`npm ${run('npm', ['--version'], { capture: true }).stdout.trim()}`);
}

// ---- npm updates ----
function updateNpm() {
  heading('npm dependencies');

  if (!existsSync(join(ROOT, 'package.json'))) {
    warn('No package.json found, skipping npm.');
    return;
  }

  log('Outdated npm packages:');
  const outdated = run('npm', ['outdated'], { capture: true, allowFail: true });
  log(outdated.stdout.trim() || `${c.green}(everything up to date)${c.reset}`);

  if (opt.check) return;

  if (opt.latest) {
    // Bump every dependency/devDependency to its newest version.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ].filter((n) => {
      // Defense in depth: never forward anything that isn't a valid npm name.
      if (NPM_NAME_RE.test(n)) return true;
      warn(`Skipping suspicious package name in package.json: ${JSON.stringify(n)}`);
      return false;
    });
    info(`Installing @latest for ${names.length} packages…`);
    run('npm', ['install', ...names.map((n) => `${n}@latest`)]);
    ok('npm packages bumped to latest.');
  } else {
    // Safe path: honour semver ranges in package.json.
    run('npm', ['update']);
    ok('npm packages updated within their semver ranges.');
  }

  // Surface (do not auto-fix) known vulnerabilities.
  run('npm', ['audit'], { allowFail: true });
}

// ---- Cargo updates ----
function updateCargo() {
  heading('Cargo / Rust dependencies');

  if (!existsSync(join(SRC_TAURI, 'Cargo.toml'))) {
    warn('No src-tauri/Cargo.toml found, skipping Cargo.');
    return;
  }
  if (!has('cargo')) {
    warn('cargo not found on PATH. Install Rust (https://rustup.rs) and re-run with --cargo-only.');
    return;
  }

  if (opt.check) {
    // `cargo update --dry-run` lists what *would* change within semver.
    run('cargo', ['update', '--dry-run'], { cwd: SRC_TAURI, allowFail: true });
    if (has('cargo-upgrade')) {
      info('Major-version candidates (cargo-edit):');
      run('cargo', ['upgrade', '--dry-run', '--incompatible'], { cwd: SRC_TAURI, allowFail: true });
    }
    return;
  }

  if (opt.latest && has('cargo-upgrade')) {
    // cargo-edit's `upgrade` rewrites Cargo.toml to newest compatible majors.
    info('Upgrading crate version requirements (cargo-edit)…');
    run('cargo', ['upgrade', '--incompatible'], { cwd: SRC_TAURI, allowFail: true });
  } else if (opt.latest) {
    warn(
      'cargo-edit not installed; cannot bump major crate versions automatically.\n' +
        '  Install it with: cargo install cargo-edit\n' +
        '  Falling back to in-range `cargo update`.',
    );
  }

  // Update Cargo.lock to newest versions allowed by Cargo.toml.
  run('cargo', ['update'], { cwd: SRC_TAURI });
  ok('Cargo dependencies updated.');
}

// ---- Verification ----
function verify() {
  if (opt.noVerify || opt.check) return;
  heading('Verification');

  if (!opt.cargoOnly) {
    info('Building Angular frontend…');
    run('npm', ['run', 'build']);
    ok('Angular build succeeded.');
  }

  if (!opt.npmOnly && has('cargo') && existsSync(join(SRC_TAURI, 'Cargo.toml'))) {
    info('Running Rust tests…');
    run('cargo', ['test'], { cwd: SRC_TAURI });
    ok('Rust tests passed.');

    info('Checking Rust build…');
    run('cargo', ['check'], { cwd: SRC_TAURI });
    ok('Rust check clean.');
  }
}

// ---- main ----
async function main() {
  log(`${c.bold}${c.blue}Acuvio dependency updater${c.reset}`);
  log(
    opt.check
      ? c.dim + 'Mode: CHECK (dry run — nothing will be modified)' + c.reset
      : opt.latest
        ? c.yellow + 'Mode: LATEST (may introduce breaking major upgrades)' + c.reset
        : c.dim + 'Mode: SAFE (minor/patch updates within semver ranges)' + c.reset,
  );

  checkNodeVersion();

  if (opt.latest && !opt.check) {
    const proceed = await confirm(
      'Bump to newest MAJOR versions? This can introduce breaking changes.',
    );
    if (!proceed) {
      warn('Aborted by user. Re-run without --latest for safe updates, or with --check to preview.');
      process.exit(0);
    }
  }

  if (!opt.cargoOnly) updateNpm();
  if (!opt.npmOnly) updateCargo();
  verify();

  heading('Done');
  if (opt.check) {
    ok('Check complete. Re-run without --check to apply updates.');
  } else {
    ok('Update complete.');
    info('Next steps:');
    info('  • Review changes: git diff package.json src-tauri/Cargo.toml');
    info('  • Run the app:    npm run dev');
    info('  • Commit:         git commit -am "chore: update dependencies"');
  }
}

main().catch((err) => {
  fail(err?.stack || String(err));
  process.exit(1);
});
