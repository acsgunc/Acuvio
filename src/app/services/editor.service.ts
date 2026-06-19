import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import type { Eol, TextFile } from '../models';

/**
 * Backend bridge for editable (normal-sized) files.
 *
 * Huge logs use {@link LogService} + the read-only memory-mapped viewer; this
 * service handles the separate editable path: whole-file read and write-back.
 */
@Injectable({ providedIn: 'root' })
export class EditorService {
  /** Largest file size (bytes) the backend will open in editable mode. */
  maxEditBytes(): Promise<number> {
    return invoke<number>('max_edit_bytes');
  }

  /** Load a file into memory for editing. Rejects if it is too large. */
  openText(path: string): Promise<TextFile> {
    return invoke<TextFile>('open_text', { path });
  }

  /** Write edited content back to disk with the given line ending. */
  saveText(path: string, content: string, eol: Eol): Promise<number> {
    return invoke<number>('save_text', { path, content, eol });
  }
}
