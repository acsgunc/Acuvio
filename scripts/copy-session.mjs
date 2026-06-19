#!/usr/bin/env node
// @ts-check
/**
 * Copy the latest GitHub Copilot Chat session transcript for THIS workspace
 * into `docs/copilot/copilot-session.jsonl` so the conversation history is
 * versioned alongside the code.
 *
 * Usage:
 *   node scripts/copy-session.mjs            # auto-discover newest transcript
 *   node scripts/copy-session.mjs <file>     # copy a specific .jsonl file
 *   npm run copy-session
 *
 * How discovery works: VS Code stores Copilot chat transcripts under
 *   <user-data>/User/workspaceStorage/<hash>/GitHub.copilot-chat/transcripts/*.jsonl
 * This script scans every workspace-storage folder, keeps only transcript
 * folders whose `workspace.json` points at this repository (falling back to all
 * transcripts if none match), and copies the most-recently-modified `.jsonl`.
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const destDir = join(repoRoot, 'docs', 'copilot');
const dest = join(destDir, 'copilot-session.jsonl');

/** Candidate VS Code "User" directories across editions and platforms. */
function userDataDirs() {
  const home = homedir();
  const editions = ['Code', 'Code - Insiders', 'VSCodium', 'Cursor'];
  const bases = [];
  if (platform() === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    for (const e of editions) bases.push(join(appData, e, 'User'));
  } else if (platform() === 'darwin') {
    for (const e of editions) bases.push(join(home, 'Library', 'Application Support', e, 'User'));
  } else {
    const config = process.env.XDG_CONFIG_HOME || join(home, '.config');
    for (const e of editions) bases.push(join(config, e, 'User'));
  }
  return bases.filter(existsSync);
}

/** Does this workspaceStorage folder belong to the Acuvio repo? */
function matchesRepo(storageDir) {
  try {
    const meta = JSON.parse(readFileSync(join(storageDir, 'workspace.json'), 'utf8'));
    const folder = (meta.folder || '').toLowerCase();
    return folder.includes('acuvio');
  } catch {
    return false;
  }
}

/** Collect transcript .jsonl files, preferring those tied to this repo. */
function findTranscripts() {
  /** @type {{file: string, mtime: number, repoMatch: boolean}[]} */
  const found = [];
  for (const userDir of userDataDirs()) {
    const wsRoot = join(userDir, 'workspaceStorage');
    if (!existsSync(wsRoot)) continue;
    for (const hash of readdirSync(wsRoot)) {
      const storageDir = join(wsRoot, hash);
      const tDir = join(storageDir, 'GitHub.copilot-chat', 'transcripts');
      if (!existsSync(tDir)) continue;
      const repoMatch = matchesRepo(storageDir);
      for (const name of readdirSync(tDir)) {
        if (!name.endsWith('.jsonl')) continue;
        const file = join(tDir, name);
        try {
          found.push({ file, mtime: statSync(file).mtimeMs, repoMatch });
        } catch {
          /* ignore unreadable files */
        }
      }
    }
  }
  return found;
}

function pickNewest() {
  const all = findTranscripts();
  if (all.length === 0) return null;
  const scoped = all.filter((t) => t.repoMatch);
  const pool = scoped.length ? scoped : all;
  pool.sort((a, b) => b.mtime - a.mtime);
  return pool[0].file;
}

function main() {
  const explicit = process.argv[2];
  const src = explicit ? resolve(explicit) : pickNewest();

  if (!src) {
    console.error(
      'No Copilot Chat transcript (.jsonl) found.\n' +
        'Pass one explicitly: node scripts/copy-session.mjs <path-to.jsonl>',
    );
    process.exit(1);
  }
  if (!existsSync(src)) {
    console.error(`Transcript not found: ${src}`);
    process.exit(1);
  }

  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
  console.log(`Copied session transcript:\n  from ${src}\n  to   ${dest}`);
}

main();
