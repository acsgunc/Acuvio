// Generates a 1024x1024 PNG app icon for Acuvio (a stylized magnifier "eye").
// No third-party deps — uses Node's built-in zlib for PNG encoding.
// After running this, expand into all platform icons with:
//   npx @tauri-apps/cli icon src-tauri/icons/icon.png

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SIZE = 1024;
const buf = Buffer.alloc(SIZE * SIZE * 4);

function setPx(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

// Background: rounded square with a dark base and accent gradient.
const radius = 180;
function inRounded(x, y) {
  const minX = 0, minY = 0, maxX = SIZE - 1, maxY = SIZE - 1;
  const cxs = [minX + radius, maxX - radius];
  const cys = [minY + radius, maxY - radius];
  if (x < cxs[0] && y < cys[0]) return (x - cxs[0]) ** 2 + (y - cys[0]) ** 2 <= radius ** 2;
  if (x > cxs[1] && y < cys[0]) return (x - cxs[1]) ** 2 + (y - cys[0]) ** 2 <= radius ** 2;
  if (x < cxs[0] && y > cys[1]) return (x - cxs[0]) ** 2 + (y - cys[1]) ** 2 <= radius ** 2;
  if (x > cxs[1] && y > cys[1]) return (x - cxs[1]) ** 2 + (y - cys[1]) ** 2 <= radius ** 2;
  return true;
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRounded(x, y)) {
      setPx(x, y, 0, 0, 0, 0);
      continue;
    }
    const t = y / SIZE;
    const r = Math.round(25 + t * 10);
    const g = Math.round(28 + t * 20);
    const b = Math.round(34 + t * 60);
    setPx(x, y, r, g, b, 255);
  }
}

// Magnifier ring (accent blue) centered slightly up-left.
const ringCx = 440, ringCy = 440, ringOuter = 230, ringInner = 165;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const d = Math.hypot(x - ringCx, y - ringCy);
    if (d <= ringOuter && d >= ringInner) {
      setPx(x, y, 43, 136, 216, 255);
    } else if (d < ringInner) {
      // Lens tint.
      setPx(x, y, 30, 60, 90, 200);
    }
  }
}

// Magnifier handle.
for (let s = 0; s < 320; s++) {
  const px = ringCx + Math.cos(Math.PI / 4) * (ringOuter - 20) + Math.cos(Math.PI / 4) * s;
  const py = ringCy + Math.sin(Math.PI / 4) * (ringOuter - 20) + Math.sin(Math.PI / 4) * s;
  for (let w = -45; w <= 45; w++) {
    const nx = px + Math.cos(Math.PI / 4 + Math.PI / 2) * w;
    const ny = py + Math.sin(Math.PI / 4 + Math.PI / 2) * w;
    setPx(Math.round(nx), Math.round(ny), 58, 152, 232, 255);
  }
}

// Three "log line" marks inside the lens.
const lineColor = [78, 201, 176];
for (let li = 0; li < 3; li++) {
  const ly = ringCy - 40 + li * 45;
  const lw = 150 - li * 25;
  for (let dx = -lw / 2; dx <= lw / 2; dx++) {
    for (let dy = -8; dy <= 8; dy++) {
      const d = Math.hypot(ringCx + dx - ringCx, ly + dy - ringCy);
      if (d < ringInner - 12) {
        setPx(Math.round(ringCx + dx), Math.round(ly + dy), ...lineColor, 255);
      }
    }
  }
}

// ---- PNG encoding ----
function crc32(data) {
  let c = ~0;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

// Add filter byte (0) per scanline.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  buf.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const idat = deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = 'src-tauri/icons/icon.png';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes)`);
