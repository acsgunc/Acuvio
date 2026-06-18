import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import type { SearchMatch } from '../models';

export interface SearchOptions {
  isRegex: boolean;
  caseSensitive: boolean;
  /** Optional cap to keep result sets bounded for the UI. */
  maxResults?: number;
}

/**
 * Search bridge. The ripgrep engine (grep-searcher + grep-regex) runs on a
 * background thread in Rust over the memory-mapped file.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  search(fileId: string, query: string, opts: SearchOptions): Promise<SearchMatch[]> {
    return invoke<SearchMatch[]>('search', {
      fileId,
      query,
      isRegex: opts.isRegex,
      caseSensitive: opts.caseSensitive,
      maxResults: opts.maxResults ?? 100_000,
    });
  }

  /**
   * Filter the file to only lines matching (include) / not matching (exclude)
   * a pattern. Returns the line numbers that pass, computed in Rust.
   */
  filter(
    fileId: string,
    query: string,
    opts: SearchOptions & { exclude: boolean },
  ): Promise<number[]> {
    return invoke<number[]>('filter_lines', {
      fileId,
      query,
      isRegex: opts.isRegex,
      caseSensitive: opts.caseSensitive,
      exclude: opts.exclude,
      maxResults: opts.maxResults ?? 1_000_000,
    });
  }
}
