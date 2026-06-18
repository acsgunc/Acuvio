import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Observable } from 'rxjs';
import type { IndexProgress, LogMeta } from '../models';

/**
 * Bridge to the Rust backend for file open / read / metadata.
 * All heavy work happens in Rust; this service only marshals requests.
 */
@Injectable({ providedIn: 'root' })
export class LogService {
  /** Open a log file: mmaps it in Rust and kicks off background indexing. */
  openLog(path: string): Promise<LogMeta> {
    return invoke<LogMeta>('open_log', { path });
  }

  /** Close a file and release its resources in the backend. */
  closeLog(fileId: string): Promise<void> {
    return invoke<void>('close_log', { fileId });
  }

  /** Current known line count (grows as indexing/tailing proceeds). */
  getLineCount(fileId: string): Promise<number> {
    return invoke<number>('get_line_count', { fileId });
  }

  /**
   * Read a contiguous slice of lines using the byte-offset index.
   * Only the visible viewport (plus a small overscan) should be requested.
   */
  readLines(fileId: string, startLine: number, count: number): Promise<string[]> {
    return invoke<string[]>('read_lines', { fileId, startLine, count });
  }

  /**
   * Stream index-progress events for a given file as an Observable.
   * Completes (does not error) when the consumer unsubscribes.
   */
  indexProgress(fileId: string): Observable<IndexProgress> {
    return new Observable<IndexProgress>((subscriber) => {
      let unlisten: UnlistenFn | undefined;
      let closed = false;

      listen<IndexProgress>('index-progress', (event) => {
        if (event.payload.fileId === fileId) {
          subscriber.next(event.payload);
          if (event.payload.done) {
            subscriber.complete();
          }
        }
      }).then((fn) => {
        if (closed) {
          fn();
        } else {
          unlisten = fn;
        }
      });

      return () => {
        closed = true;
        unlisten?.();
      };
    });
  }
}
