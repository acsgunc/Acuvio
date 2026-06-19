// Generates fixture files for MANUAL testing of Acuvio features.
//
// Creates a folder of small sample files covering the feature surface:
//   - editable text files in several languages (syntax highlighting)
//   - files with CRLF / LF / CR line endings (EOL detection & conversion)
//   - a file with messy whitespace / duplicate / unsorted lines (Edit ops)
//   - a UTF-8 BOM file (encoding detection)
//   - a "large" file just over the 50 MiB edit cap (viewer-fallback path)
//   - a medium log file for search / filter / follow
//
// Usage:
//   node scripts/generate-test-fixtures.mjs [outDir]
//       Default outDir = ./test-fixtures
//
// See docs/MANUAL_TESTING.md for the step-by-step checklist that uses these.

import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'test-fixtures';
mkdirSync(outDir, { recursive: true });

const write = (name, content, encoding = 'utf8') => {
  const p = join(outDir, name);
  writeFileSync(p, content, encoding);
  console.log('  wrote', p);
};

console.log(`Generating manual-test fixtures in ${outDir}/`);

// ---- 1. Syntax-highlighting samples (one per language family) ------------
write(
  'sample.ts',
  `interface User { id: number; name: string; }\n` +
    `export function greet(u: User): string {\n` +
    `  // line comment\n` +
    `  return \`Hello, \${u.name}!\`;\n` +
    `}\n`,
);

write(
  'sample.py',
  `def fib(n: int) -> int:\n` +
    `    """Return the nth Fibonacci number."""\n` +
    `    a, b = 0, 1\n` +
    `    for _ in range(n):\n` +
    `        a, b = b, a + b\n` +
    `    return a\n`,
);

write(
  'sample.rs',
  `fn main() {\n` + `    let nums = vec![1, 2, 3];\n` + `    println!("sum = {}", nums.iter().sum::<i32>());\n` + `}\n`,
);

write('sample.json', `{\n  "name": "acuvio",\n  "nested": { "ok": true, "count": 42 }\n}\n`);

write(
  'sample.sql',
  `SELECT u.id, u.name\nFROM users u\nWHERE u.active = TRUE\nORDER BY u.name;\n`,
);

write(
  'sample.md',
  `# Title\n\nSome **bold** and _italic_ text.\n\n- item one\n- item two\n\n\`\`\`js\nconsole.log('hi');\n\`\`\`\n`,
);

// ---- 2. Line-ending fixtures --------------------------------------------
const threeLines = ['first line', 'second line', 'third line'];
write('eol-lf.txt', threeLines.join('\n') + '\n');
write('eol-crlf.txt', threeLines.join('\r\n') + '\r\n');
write('eol-cr.txt', threeLines.join('\r') + '\r');

// ---- 3. Edit-operations playground (messy on purpose) -------------------
write(
  'edit-ops.txt',
  [
    'banana',
    'apple',
    'cherry',
    'apple', // duplicate
    '', // empty line
    '   ', // whitespace-only line
    'Date  ', // trailing whitespace
    '\tTabIndented', // leading tab
    'MixedCase Text Here',
    'zebra',
  ].join('\n') + '\n',
);

// ---- 4. Encoding: UTF-8 with BOM ----------------------------------------
write('utf8-bom.txt', '\uFEFF' + 'This file starts with a UTF-8 BOM.\nSecond line.\n');

// ---- 5. Medium log file (search / filter / severity highlighting) -------
{
  const p = join(outDir, 'app.log');
  const stream = createWriteStream(p);
  const LEVELS = ['INFO', 'INFO', 'DEBUG', 'WARN', 'ERROR', 'TRACE'];
  for (let i = 0; i < 5000; i++) {
    const ts = new Date(Date.now() + i * 13).toISOString();
    const lvl = LEVELS[i % LEVELS.length];
    stream.write(`${ts} ${lvl} [svc-${i % 7}] (req=${i}) event from 10.0.0.${i % 255}\n`);
  }
  stream.end();
  console.log('  wrote', p, '(5000 lines)');
}

// ---- 6. Large file just over the 50 MiB editable cap --------------------
// Opening this should fall back to the read-only viewer instead of the editor.
if (process.argv.includes('--large')) {
  const p = join(outDir, 'large-over-50mb.log');
  const stream = createWriteStream(p);
  const line = 'x'.repeat(120) + '\n';
  const target = 52 * 1024 * 1024; // 52 MiB > 50 MiB cap
  let bytes = 0;
  while (bytes < target) {
    stream.write(line);
    bytes += line.length;
  }
  stream.end();
  console.log('  wrote', p, '(~52 MiB — viewer fallback)');
} else {
  console.log('  (skipped large file; pass --large to generate the 52 MiB viewer-fallback fixture)');
}

console.log('Done. See docs/MANUAL_TESTING.md for the checklist.');
