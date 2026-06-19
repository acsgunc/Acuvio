import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewChild,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

import { LogService } from './services/log.service';
import { TailService } from './services/tail.service';
import { SearchService } from './services/search.service';
import { SettingsService } from './services/settings.service';
import type { LogMeta, SearchMatch } from './models';

import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { SearchPanelComponent, type SearchRequest } from './components/search-panel/search-panel.component';
import { FilterPanelComponent, type FilterRequest } from './components/filter-panel/filter-panel.component';
import { StatusBarComponent } from './components/status-bar/status-bar.component';
import { LogViewerComponent } from './components/log-viewer/log-viewer.component';

/** Per-tab UI + backend state. */
interface Tab {
  meta: LogMeta;
  lineCount: number;
  currentLine: number;
  follow: boolean;
  tailing: boolean;
  indexing: boolean;
  indexedLines: number;
  // search
  matches: SearchMatch[];
  matchIndex: number;
  searchBusy: boolean;
  // filter
  filterActive: boolean;
  filterBusy: boolean;
  filterMatched: number;
  // subscriptions to tear down on close
  subs: Subscription[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ToolbarComponent,
    SearchPanelComponent,
    FilterPanelComponent,
    StatusBarComponent,
    LogViewerComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly log = inject(LogService);
  private readonly tail = inject(TailService);
  private readonly searchSvc = inject(SearchService);
  readonly settings = inject(SettingsService);

  @ViewChild('viewer') viewer?: LogViewerComponent;

  readonly tabs = signal<Tab[]>([]);
  readonly activeIndex = signal(0);
  readonly searchOpen = signal(false);
  readonly filterOpen = signal(false);
  readonly errorMsg = signal<string | null>(null);

  readonly activeTab = computed<Tab | null>(() => this.tabs()[this.activeIndex()] ?? null);

  // ---- file open / close ----

  async ngOnInit(): Promise<void> {
    // Open files requested by the OS while Acuvio is already running
    // (Windows "Open with Acuvio" context-menu entry on a second launch).
    this.log.openFileRequests().subscribe((path) => void this.openPath(path));

    // Open a file passed on the command line at first launch.
    try {
      const startup = await this.log.getStartupFile();
      if (startup) await this.openPath(startup);
    } catch {
      /* no startup file or backend unavailable (web preview) */
    }
  }

  async onOpenFile(): Promise<void> {
    try {
      const selected = await openDialog({
        multiple: false,
        title: 'Open log file',
        filters: [
          { name: 'Log files', extensions: ['log', 'txt', 'out', 'err', 'json', 'ndjson'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (typeof selected !== 'string') return;
      await this.openPath(selected);
    } catch (err) {
      this.fail('Could not open file', err);
    }
  }

  private async openPath(path: string): Promise<void> {
    try {
      const meta = await this.log.openLog(path);
      const tab: Tab = {
        meta,
        lineCount: meta.lineCount,
        currentLine: 1,
        follow: false,
        tailing: false,
        indexing: true,
        indexedLines: meta.lineCount,
        matches: [],
        matchIndex: -1,
        searchBusy: false,
        filterActive: false,
        filterBusy: false,
        filterMatched: 0,
        subs: [],
      };

      // Track background indexing progress.
      const sub = this.log.indexProgress(meta.fileId).subscribe({
        next: (p) => {
          this.patchTab(meta.fileId, (t) => {
            t.indexedLines = p.linesIndexed;
            t.lineCount = Math.max(t.lineCount, p.linesIndexed);
            t.indexing = !p.done;
          });
        },
        complete: () => this.patchTab(meta.fileId, (t) => (t.indexing = false)),
      });
      tab.subs.push(sub);

      this.tabs.update((arr) => [...arr, tab]);
      this.activeIndex.set(this.tabs().length - 1);
    } catch (err) {
      this.fail('Failed to open log', err);
    }
  }

  async closeTab(index: number, event?: Event): Promise<void> {
    event?.stopPropagation();
    const tab = this.tabs()[index];
    if (!tab) return;
    tab.subs.forEach((s) => s.unsubscribe());
    try {
      await this.log.closeLog(tab.meta.fileId);
    } catch {
      /* ignore */
    }
    this.tabs.update((arr) => arr.filter((_, i) => i !== index));
    this.activeIndex.set(Math.max(0, Math.min(this.activeIndex(), this.tabs().length - 1)));
  }

  selectTab(index: number): void {
    this.activeIndex.set(index);
  }

  // ---- follow / navigation ----

  toggleFollow(): void {
    const tab = this.activeTab();
    if (!tab) return;
    const next = !tab.follow;
    this.patchActive((t) => (t.follow = next));

    if (next) {
      const sub = this.tail.tailLog(tab.meta.fileId).subscribe({
        next: (e) => {
          this.patchTab(tab.meta.fileId, (t) => {
            t.lineCount = e.totalLines;
            t.tailing = true;
          });
          if (this.activeTab()?.meta.fileId === tab.meta.fileId) {
            this.viewer?.appendTailLines(e.newLines, e.totalLines);
          }
        },
        error: (err) => this.fail('Tailing error', err),
      });
      this.patchActive((t) => t.subs.push(sub));
      void this.viewer?.scrollToEnd();
    } else {
      // Stop tailing: drop the tail subscription (keeps index-progress sub).
      this.patchActive((t) => {
        const tailSub = t.subs.pop();
        tailSub?.unsubscribe();
        t.tailing = false;
      });
    }
  }

  goToTop(): void {
    void this.viewer?.goToLine(1);
  }

  goToEnd(): void {
    const tab = this.activeTab();
    if (tab) void this.viewer?.goToLine(tab.lineCount);
  }

  onGotoLine(line: number): void {
    const tab = this.activeTab();
    if (!tab) return;
    void this.viewer?.goToLine(Math.max(1, Math.min(line, tab.lineCount)));
  }

  onTopLineChange(line: number): void {
    this.patchActive((t) => (t.currentLine = line));
  }

  // ---- search ----

  toggleSearch(): void {
    this.searchOpen.update((v) => !v);
  }

  async onSearch(req: SearchRequest): Promise<void> {
    const tab = this.activeTab();
    if (!tab) return;
    this.patchActive((t) => (t.searchBusy = true));
    try {
      const matches = await this.searchSvc.search(tab.meta.fileId, req.query, {
        isRegex: req.isRegex,
        caseSensitive: req.caseSensitive,
      });
      this.patchActive((t) => {
        t.matches = matches;
        t.matchIndex = matches.length ? 0 : -1;
        t.searchBusy = false;
      });
      if (matches.length) await this.gotoMatch(0);
    } catch (err) {
      this.patchActive((t) => (t.searchBusy = false));
      this.fail('Search failed', err);
    }
  }

  nextMatch(): void {
    const tab = this.activeTab();
    if (!tab || !tab.matches.length) return;
    void this.gotoMatch((tab.matchIndex + 1) % tab.matches.length);
  }

  prevMatch(): void {
    const tab = this.activeTab();
    if (!tab || !tab.matches.length) return;
    void this.gotoMatch((tab.matchIndex - 1 + tab.matches.length) % tab.matches.length);
  }

  private async gotoMatch(index: number): Promise<void> {
    const tab = this.activeTab();
    if (!tab || !tab.matches[index]) return;
    this.patchActive((t) => (t.matchIndex = index));
    const m = tab.matches[index];
    await this.viewer?.goToLine(m.line);
    // Highlight matches on the active line + neighbours that fall in the window.
    this.viewer?.setHighlights(
      tab.matches.map((mm, i) => ({
        line: mm.line,
        start: mm.start,
        end: mm.end,
        active: i === index,
      })),
    );
  }

  closeSearch(): void {
    this.searchOpen.set(false);
    this.viewer?.clearHighlights();
    this.patchActive((t) => {
      t.matches = [];
      t.matchIndex = -1;
    });
  }

  // ---- filter ----

  toggleFilter(): void {
    this.filterOpen.update((v) => !v);
  }

  async onFilter(req: FilterRequest): Promise<void> {
    const tab = this.activeTab();
    if (!tab) return;
    this.patchActive((t) => (t.filterBusy = true));
    try {
      const lines = await this.searchSvc.filter(tab.meta.fileId, req.query, {
        isRegex: req.isRegex,
        caseSensitive: req.caseSensitive,
        exclude: req.exclude,
      });
      this.patchActive((t) => {
        t.filterBusy = false;
        t.filterActive = true;
        t.filterMatched = lines.length;
      });
      // Jump to the first matching line for quick orientation.
      if (lines.length) await this.viewer?.goToLine(lines[0] + 1);
    } catch (err) {
      this.patchActive((t) => (t.filterBusy = false));
      this.fail('Filter failed', err);
    }
  }

  clearFilter(): void {
    this.patchActive((t) => {
      t.filterActive = false;
      t.filterMatched = 0;
    });
  }

  closeFilter(): void {
    this.filterOpen.set(false);
  }

  // ---- helpers ----

  private patchActive(fn: (t: Tab) => void): void {
    const i = this.activeIndex();
    this.tabs.update((arr) => {
      const copy = [...arr];
      const t = copy[i];
      if (t) {
        fn(t);
        copy[i] = { ...t };
      }
      return copy;
    });
  }

  private patchTab(fileId: string, fn: (t: Tab) => void): void {
    this.tabs.update((arr) =>
      arr.map((t) => {
        if (t.meta.fileId === fileId) {
          fn(t);
          return { ...t };
        }
        return t;
      }),
    );
  }

  private fail(context: string, err: unknown): void {
    const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : JSON.stringify(err);
    this.errorMsg.set(`${context}: ${msg}`);
    setTimeout(() => this.errorMsg.set(null), 6000);
  }
}
