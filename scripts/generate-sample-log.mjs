// Generates / appends to a sample log file for manual performance testing.
//
// Usage:
//   node scripts/generate-sample-log.mjs <approxMB> [outPath]
//       Create a file of roughly <approxMB> megabytes (default 100MB).
//   node scripts/generate-sample-log.mjs --follow [outPath]
//       Continuously append lines (for testing live "Follow" mode). Ctrl+C to stop.

import { createWriteStream, existsSync } from 'node:fs';

const LEVELS = ['INFO', 'INFO', 'INFO', 'DEBUG', 'WARN', 'ERROR', 'TRACE'];
const SERVICES = ['auth', 'api', 'db', 'cache', 'worker', 'gateway', 'scheduler'];
const MSGS = [
  'request completed',
  'connection established to 10.0.0.42:5432',
  'cache miss for key user:8842',
  'failed to parse payload',
  'retrying operation, attempt 3',
  'user 192.168.1.10 authenticated',
  'slow query detected (1423 ms)',
  'disk usage at 87 percent',
  'token refreshed for session 4f9a2b',
  'unhandled exception in handler',
];

function line(i) {
  const ts = new Date(Date.now() + i * 7).toISOString();
  const lvl = LEVELS[i % LEVELS.length];
  const svc = SERVICES[i % SERVICES.length];
  const msg = MSGS[i % MSGS.length];
  return `${ts} ${lvl} [${svc}] (req=${i}) ${msg}\n`;
}

const args = process.argv.slice(2);

if (args[0] === '--follow') {
  const out = args[1] ?? 'sample.log';
  const stream = createWriteStream(out, { flags: 'a' });
  console.log(`Appending to ${out} every 500ms — Ctrl+C to stop.`);
  let i = existsSync(out) ? 1_000_000 : 0;
  setInterval(() => {
    const batch = Math.ceil(Math.random() * 5);
    for (let k = 0; k < batch; k++) stream.write(line(i++));
  }, 500);
} else {
  const approxMB = Number(args[0] ?? 100);
  const out = args[1] ?? 'sample.log';
  const targetBytes = approxMB * 1024 * 1024;
  const stream = createWriteStream(out);
  let bytes = 0;
  let i = 0;

  function pump() {
    let ok = true;
    while (ok && bytes < targetBytes) {
      const s = line(i++);
      bytes += Buffer.byteLength(s);
      ok = stream.write(s);
    }
    if (bytes < targetBytes) {
      stream.once('drain', pump);
    } else {
      stream.end(() => console.log(`Wrote ${out}: ${(bytes / 1024 / 1024).toFixed(1)} MB, ${i} lines`));
    }
  }
  pump();
}
