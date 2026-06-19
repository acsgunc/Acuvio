# Feature 14 — Large-File Open Performance (instant open for 100 MB – 4 GB logs)

**Phase:** 1 (Core Viewer / GB-scale handling)
**Status:** ✅ Delivered

Opening large logs now feels instant: the first screen paints within
milliseconds and the full line index for a multi-gigabyte file completes in the
background in roughly 1–2 seconds. This closes a regression where a 100 MB file
appeared to "hang" before showing any content.

---

## 1. Problem

Two independent issues made large files slow to open:

1. **Non-vectorized newline scan.** The background indexer found line
   boundaries with `bytes.iter().position(|&b| b == b'\n')` — a byte-by-byte
   loop with no SIMD. In a dev/debug build this was dramatically slow, and even
   in release it scaled poorly toward the 4 GB target.
2. **Blank viewer until first progress event.** The viewer requested its first
   window (`reload(0)`) at init while the line count was still `0` (the index
   had only the line-0 sentinel). `read_lines` returned an empty slice, and the
   `totalLines` setter did not refill the window when lines later became
   available — so the editor stayed blank until the user scrolled. The first
   index-progress event was also only emitted after a full 50 000-line batch.

## 2. Fix

### Backend (`src-tauri`)

- **SIMD newline scanning.** Added the [`memchr`](https://crates.io/crates/memchr)
  crate and replaced the naive scan with `memchr::memchr_iter(b'\n', bytes)`.
  Measured ~**44 ms to index a real 100 MB / 1.46 M-line log** (~2.2 GB/s),
  extrapolating to **~1.8 s for 4 GB** of pure scanning — and the file is
  memory-mapped, so pages fault in lazily during the scan with no upfront copy.
  - `src-tauri/src/indexer.rs` — `find_newline` removed; scan now uses
    `memchr_iter`.
- **Pre-sized index.** `LogFile::reserve_index(lines)` pre-allocates the
  `starts` vector from an average-line-length estimate (sampled from the first
  64 KiB) so the index doesn't repeatedly reallocate while scanning a 4 GB file.
  - `src-tauri/src/log_file.rs` — new `reserve_index`.
  - `src-tauri/src/indexer.rs` — `estimate_line_count` helper.
- **Early first flush + early emit.** The first batch flushes after only
  `FIRST_FLUSH_LINES = 2 000` lines (instead of waiting for a full
  `FLUSH_BATCH`), and an `index-progress` event is emitted immediately after
  that first flush. Subsequent flushes/emits use the larger
  `FLUSH_BATCH = EMIT_EVERY_LINES = 250 000` cadence to keep IPC light on huge
  files.
- **Optimized dependencies in dev builds.** Added
  `[profile.dev.package."*"] opt-level = 3` so third-party crates (`memchr`,
  `memmap2`, `grep-*`) run at full speed even under `npm run dev`, while the app
  crate stays unoptimized for fast incremental rebuilds.
  - `src-tauri/Cargo.toml`.

### Frontend (`src`)

- **Refill the first window when lines arrive.** The log viewer's `totalLines`
  setter now calls `reload(0)` when the window is still empty and the line count
  first becomes positive, so content appears the moment the background index has
  its first lines — no scroll required.
  - `src/app/components/log-viewer/log-viewer.component.ts`.

## 3. Open path (unchanged routing, now fast)

```
openPath(path)
  → open_text(path)          // metadata-only size check; rejects > 50 MiB instantly
  → (too large) openAsViewer // open_log mmaps the file (instant)
        → spawn_indexer      // background memchr scan
        → first flush @2k lines → emit index-progress
        → viewer.totalLines setter → reload(0) → first screen paints
        → full index completes (~1–2 s for 4 GB) in the background
```

The `open_text` editable path is still chosen for files ≤ `MAX_EDIT_BYTES`
(50 MiB); larger files always use the read-only memory-mapped viewer.

## 4. Files changed

| File | Change |
| --- | --- |
| `src-tauri/Cargo.toml` | add `memchr`; `[profile.dev.package."*"]` opt-level 3 |
| `src-tauri/src/indexer.rs` | memchr scan, estimate + reserve, early flush/emit |
| `src-tauri/src/log_file.rs` | `reserve_index` |
| `src/app/components/log-viewer/log-viewer.component.ts` | refill first window on line-count growth |

## 5. Testing

- **Rust:** `estimate_line_count` covered by 3 unit tests (typical buffer,
  empty buffer, no-newline buffer). Existing `log_file` index tests unchanged
  and green (20 Rust tests total).
- **Benchmark (throwaway, not committed):** memchr indexed the real
  `BuffersCPP_Legacy_*.log` (100 MB, 1 465 058 lines) in **44.5 ms**.
- **Frontend:** 79 tests green; the viewer refill path is exercised manually
  (see `../MANUAL_TESTING.md`).

## 6. Future work

- Parallel/chunked indexing across threads if single-thread memchr ever becomes
  the bottleneck beyond 4 GB.
- Persist the line index to a sidecar cache so re-opening the same file skips
  re-indexing entirely.
