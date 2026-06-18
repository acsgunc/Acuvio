/**
 * Shared data models. Field names use camelCase to match the Rust backend,
 * whose serde structs are annotated with `#[serde(rename_all = "camelCase")]`.
 */

/** Metadata returned when a log file is opened. */
export interface LogMeta {
  fileId: string;
  path: string;
  size: number;
  /** Best-effort line count at open time (refined as indexing completes). */
  lineCount: number;
  encoding: string;
}

/** A single search hit. `start`/`end` are byte offsets within the line. */
export interface SearchMatch {
  line: number;
  start: number;
  end: number;
  preview: string;
}

/** Progress event emitted while the background indexer scans the file. */
export interface IndexProgress {
  fileId: string;
  linesIndexed: number;
  done: boolean;
}

/** Event emitted when a tailed file grows. */
export interface LogAppended {
  fileId: string;
  newLines: string[];
  totalLines: number;
}
