import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Observable } from 'rxjs';
import type { LogAppended } from '../models';

/**
 * Live-tailing bridge. Subscribing starts tailing in Rust (via `notify`);
 * unsubscribing stops it. New bytes are read incrementally and emitted
 * through the `log-appended` Tauri event.
 */
@Injectable({ providedIn: 'root' })
export class TailService {
  tailLog(fileId: string): Observable<LogAppended> {
    return new Observable<LogAppended>((subscriber) => {
      let unlisten: UnlistenFn | undefined;
      let closed = false;

      listen<LogAppended>('log-appended', (event) => {
        if (event.payload.fileId === fileId) {
          subscriber.next(event.payload);
        }
      }).then((fn) => {
        if (closed) {
          fn();
        } else {
          unlisten = fn;
          invoke('start_tailing', { fileId }).catch((err) => subscriber.error(err));
        }
      });

      return () => {
        closed = true;
        unlisten?.();
        invoke('stop_tailing', { fileId }).catch(() => void 0);
      };
    });
  }
}
