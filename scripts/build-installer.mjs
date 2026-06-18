#!/usr/bin/env node
/**
 * Acuvio installer builder — cross-platform (Windows, macOS, Linux).
 *
 * Produces production-ready native installers using the Tauri bundler:
 *   - Windows : NSIS (.exe) + MSI (.msi)
 *   - macOS   : DMG (.dmg) + .app bundle
 *   - Linux   : .deb + .rpm + AppImage
 *
 * The script auto-detects the host OS and builds the installers that OS can
 * produce. (Tauri cannot cross-compile installers, so run this on each target
 * OS — or in CI — to produce that platform's artifacts.)
 *
 * Usage:
 *   node scripts/build-installer.mjs [options]
 *
 * Options:
 *   --bundles <list>   Comma-separated bundle list to override the OS default
 *                      (e.g. --bundles nsis  or  --bundles deb,appimage).
 *   --debug            Build a debug installer (faster, unoptimized).
 *   --no-verify        Skip the pre-build dependency / toolchain check.
 *   --help, -h         Show this help.
 *
 * Examples:
 *   node scripts/build-installer.mjs                 # all installers for this OS
 *   node scripts/build-installer.mjs --bundles nsis  # only the NSIS .exe
 *   node scripts/build-installer.mjs --debug         # quick debug build
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IS_WINDOWS = platform === 'win32';
const IS_MAC = platform === 'darwin';
const IS_LINUX = platform === 'linux';

// ---- CLI args ----
const argv = process.argv.slice(2);
const args = new Set(argv);
const getValue = (flag) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
};
const opt = {
  bundles: getValue('--bundles'),
  debug: args.has('--debug'),
  noVerify: args.has('--no-verify'),
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
  cyan: '\x1b[36m',
};
const log = (msg = '') => console.log(msg);
const heading = (msg) => log(`\n${c.bold}${c.cyan}=== ${msg} ===${c.reset}`);
const ok = (msg) => log(`${c.green}✓${c.reset} ${msg}`);
const warn = (msg) => log(`${c.yellow}!${c.reset} ${msg}`);
const fail = (msg) => log(`${c.red}✗${c.reset} ${msg}`);
const info = (msg) => log(`${c.dim}${msg}${c.reset}`);

if (opt.help) {
  const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const block = self
    .slice(self.indexOf('/**'))
    .split('*/')[0]
    .replace(/^\/\*\*?/, '')
    .replace(/^ \* ?/gm, '');
  log(block.trim());
  process.exit(0);
}

/** npm/npx are .cmd shims on Windows and must run through cmd.exe. */
const WIN_SHIMS = new Set(['npm', 'npx']);
/** Allowed bundle identifiers — validates any user-supplied --bundles value. */
const VALID_BUNDLES = new Set(['nsis', 'msi', 'dmg', 'app', 'deb', 'rpm', 'appimage']);

/** Run a command, streaming output. Shell-free and cross-platform. */
function run(cmd, cmdArgs, { cwd = ROOT, allowFail = false } = {}) {
  const display = `${cmd} ${cmdArgs.join(' ')}`;
  info(`$ ${display}`);

  let exec = cmd;
  let execArgs = cmdArgs;
  if (IS_WINDOWS && WIN_SHIMS.has(cmd)) {
    exec = process.env.ComSpec || 'cmd.exe';
    execArgs = ['/d', '/s', '/c', cmd, ...cmdArgs];
  }

  const result = spawnSync(exec, execArgs, { cwd, shell: false, stdio: 'inherit' });
  if (result.error) {
    if (allowFail) return 1;
    fail(`Failed to launch: ${display}\n${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0 && !allowFail) {
    fail(`Command failed (exit ${result.status}): ${display}`);
    process.exit(result.status ?? 1);
  }
  return result.status ?? 0;
}

/** Check whether an executable is available on PATH. */
function has(cmd) {
  const probe = IS_WINDOWS ? 'where' : 'which';
  return spawnSync(probe, [cmd], { shell: false }).status === 0;
}

/** The installer bundles this OS can produce by default. */
function defaultBundlesForOS() {
  if (IS_WINDOWS) return ['nsis', 'msi'];
  if (IS_MAC) return ['dmg', 'app'];
  if (IS_LINUX) return ['deb', 'rpm', 'appimage'];
  return [];
}

function resolveBundles() {
  if (opt.bundles) {
    const list = opt.bundles
      .split(',')
      .map((b) => b.trim().toLowerCase())
      .filter(Boolean);
    const invalid = list.filter((b) => !VALID_BUNDLES.has(b));
    if (invalid.length) {
      fail(`Unknown bundle(s): ${invalid.join(', ')}`);
      info(`Valid bundles: ${[...VALID_BUNDLES].join(', ')}`);
      process.exit(1);
    }
    return list;
  }
  return defaultBundlesForOS();
}

function preflight(bundles) {
  heading('Environment');
  ok(`OS: ${platform}`);
  ok(`Node.js ${process.versions.node}`);

  if (!has('npm')) {
    fail('npm not found on PATH. Install Node.js first.');
    process.exit(1);
  }
  if (!has('cargo')) {
    fail('cargo (Rust) not found on PATH. Install Rust from https://rustup.rs.');
    process.exit(1);
  }
  ok('npm and cargo found');

  if (IS_LINUX) {
    warn(
      'Linux installers need system libs: libwebkit2gtk-4.1-dev, build-essential,\n' +
        '  libssl-dev, libayatana-appindicator3-dev, librsvg2-dev. AppImage also needs\n' +
        '  `linuxdeploy` to be available (Tauri downloads it on first run).',
    );
  }
  if (IS_WINDOWS && bundles.includes('msi')) {
    info('MSI requires the WiX toolset (Tauri downloads it automatically on first build).');
  }
  log(`\nWill build: ${c.bold}${bundles.join(', ')}${c.reset}`);
}

/** Recursively list files under a directory (best-effort). */
function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Find and report the produced installer artifacts. */
function reportArtifacts() {
  heading('Artifacts');
  const profile = opt.debug ? 'debug' : 'release';
  const bundleDir = join(ROOT, 'src-tauri', 'target', profile, 'bundle');
  if (!existsSync(bundleDir)) {
    warn(`No bundle directory found at ${relative(ROOT, bundleDir)}`);
    return;
  }
  const wanted = /\.(exe|msi|dmg|app|deb|rpm|AppImage)$/i;
  const files = walk(bundleDir)
    .filter((f) => wanted.test(f) || f.endsWith('.app'))
    .sort();

  if (!files.length) {
    warn('Build finished but no installer files were found.');
    return;
  }
  for (const f of files) {
    let size = '';
    try {
      const bytes = statSync(f).size;
      size = `  ${c.dim}(${(bytes / 1024 / 1024).toFixed(1)} MB)${c.reset}`;
    } catch {
      /* ignore */
    }
    ok(`${relative(ROOT, f)}${size}`);
  }
  log(`\n${c.green}${c.bold}Done.${c.reset} Installers are in ${c.cyan}${relative(ROOT, bundleDir)}${c.reset}`);
}

// ---- main ----
function main() {
  heading('Acuvio installer builder');
  const bundles = resolveBundles();
  if (!bundles.length) {
    fail(`Unsupported OS for installer build: ${platform}`);
    process.exit(1);
  }

  if (!opt.noVerify) preflight(bundles);

  heading('Building');
  const buildArgs = ['run', 'tauri', '--', 'build', '--bundles', bundles.join(',')];
  if (opt.debug) buildArgs.push('--debug');
  run('npm', buildArgs);

  reportArtifacts();
}

main();
