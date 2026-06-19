import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  ViewChild,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';

import { LogService } from './services/log.service';
import { TailService } from './services/tail.service';
import { SearchService } from './services/search.service';
import { SettingsService } from './services/settings.service';
import { EditorService } from './services/editor.service';
import { LanguageRegistry, type LanguageDefinition } from './services/language-registry.service';
import type { Eol, LogMeta, SearchMatch } from './models';

import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { SearchPanelComponent, type SearchRequest } from './components/search-panel/search-panel.component';
import { FilterPanelComponent, type FilterRequest } from './components/filter-panel/filter-panel.component';
import { StatusBarComponent } from './components/status-bar/status-bar.component';
import { LogViewerComponent } from './components/log-viewer/log-viewer.component';
import { TextEditorComponent } from './components/text-editor/text-editor.component';

/** Per-tab UI + backend state. */
interface Tab {
  meta: LogMeta;
  /** `view` = read-only mmap log viewer; `edit` = in-memory editable buffer. */
  mode: 'view' | 'edit';
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
  // edit mode
  content: string;
  eol: Eol;
  dirty: boolean;
  /** Language id for syntax highlighting (edit mode); '' = plain text. */
  languageId: string;
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
    TextEditorComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly log = inject(LogService);
  private readonly tail = inject(TailService);
  private readonly searchSvc = inject(SearchService);
  private readonly editorSvc = inject(EditorService);
  private readonly languages = inject(LanguageRegistry);
  readonly settings = inject(SettingsService);

  @ViewChild('viewer') viewer?: LogViewerComponent;
  @ViewChild('editor') editor?: TextEditorComponent;

  readonly tabs = signal<Tab[]>([]);
  readonly activeIndex = signal(0);
  readonly searchOpen = signal(false);
  readonly filterOpen = signal(false);
  readonly errorMsg = signal<string | null>(null);

  /** Monotonic id source for in-memory (unsaved) editable tabs. */
  private nextEditId = 1;

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
    // Prefer editable mode for normal-sized files; fall back to the read-only
    // memory-mapped viewer when the file is too large to load into memory.
    try {
      const tf = await this.editorSvc.openText(path);
      this.addEditTab(path, tf.content, tf.eol, tf.encoding, tf.size);
      return;
    } catch (err) {
      if (!this.isTooLargeError(err)) {
        this.fail('Failed to open file', err);
        return;
      }
      // Too large to edit — open it in the viewer instead.
    }
    await this.openAsViewer(path);
  }

  private isTooLargeError(err: unknown): boolean {
    const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : '';
    return msg.includes('too large');
  }

  private async openAsViewer(path: string): Promise<void> {
    try {
      const meta = await this.log.openLog(path);
      const tab: Tab = {
        meta,
        mode: 'view',
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
        content: '',
        eol: 'lf',
        dirty: false,
        languageId: '',
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

  /** Create an editable tab from already-loaded text. */
  private addEditTab(path: string, content: string, eol: Eol, encoding: string, size: number): void {
    const fileId = `edit-${this.nextEditId++}`;
    const lineCount = content.length === 0 ? 1 : content.split('\n').length;
    const tab: Tab = {
      meta: { fileId, path, size, lineCount, encoding },
      mode: 'edit',
      lineCount,
      currentLine: 1,
      follow: false,
      tailing: false,
      indexing: false,
      indexedLines: lineCount,
      matches: [],
      matchIndex: -1,
      searchBusy: false,
      filterActive: false,
      filterBusy: false,
      filterMatched: 0,
      content,
      eol,
      dirty: false,
      languageId: path ? (this.languages.detect(path)?.id ?? '') : '',
      subs: [],
    };
    this.tabs.update((arr) => [...arr, tab]);
    this.activeIndex.set(this.tabs().length - 1);
  }

  /** Open a fresh, empty, unsaved editable document. */
  newFile(): void {
    this.addEditTab('', '', 'lf', 'UTF-8', 0);
  }

  async closeTab(index: number, event?: Event): Promise<void> {
    event?.stopPropagation();
    const tab = this.tabs()[index];
    if (!tab) return;
    if (tab.mode === 'edit' && tab.dirty) {
      const name = this.tabName(tab);
      const ok = confirm(`"${name}" has unsaved changes. Close without saving?`);
      if (!ok) return;
    }
    tab.subs.forEach((s) => s.unsubscribe());
    if (tab.mode === 'view') {
      try {
        await this.log.closeLog(tab.meta.fileId);
      } catch {
        /* ignore */
      }
    }
    this.tabs.update((arr) => arr.filter((_, i) => i !== index));
    this.activeIndex.set(Math.max(0, Math.min(this.activeIndex(), this.tabs().length - 1)));
  }

  /** Display name for a tab (file name, or "Untitled" for new buffers). */
  tabName(tab: Tab): string {
    if (!tab.meta.path) return 'Untitled';
    return tab.meta.path.split('/').pop()?.split('\\').pop() ?? tab.meta.path;
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
    const tab = this.activeTab();
    if (tab?.mode === 'edit') {
      this.editor?.goToLine(1);
      return;
    }
    void this.viewer?.goToLine(1);
  }

  goToEnd(): void {
    const tab = this.activeTab();
    if (!tab) return;
    if (tab.mode === 'edit') {
      this.editor?.goToLine(tab.lineCount);
      return;
    }
    void this.viewer?.goToLine(tab.lineCount);
  }

  onGotoLine(line: number): void {
    const tab = this.activeTab();
    if (!tab) return;
    const clamped = Math.max(1, Math.min(line, tab.lineCount));
    if (tab.mode === 'edit') {
      this.editor?.goToLine(clamped);
      return;
    }
    void this.viewer?.goToLine(clamped);
  }

  onTopLineChange(line: number): void {
    this.patchActive((t) => (t.currentLine = line));
  }

  // ---- edit mode: save / dirty tracking ----

  onDirtyChange(dirty: boolean): void {
    this.patchActive((t) => (t.dirty = dirty));
  }

  onEditorCursor(line: number): void {
    this.patchActive((t) => {
      t.currentLine = line;
      t.lineCount = this.editor?.getLineCount() ?? t.lineCount;
    });
  }

  // ---- language selection ----

  /** All registered languages, for the status-bar picker. */
  languageList(): LanguageDefinition[] {
    return this.languages.list();
  }

  /** Label of the active tab's language (or "Plain Text"). */
  activeLanguageLabel(): string {
    const id = this.activeTab()?.languageId ?? '';
    return id ? (this.languages.getById(id)?.label ?? 'Plain Text') : 'Plain Text';
  }

  /** Manually set the active editable tab's language. */
  setLanguage(id: string): void {
    this.patchActive((t) => (t.languageId = id));
  }

  /** Save the active editable tab (prompts for a path if it is untitled). */
  async save(): Promise<void> {
    const tab = this.activeTab();
    if (!tab || tab.mode !== 'edit' || !this.editor) return;
    if (!tab.meta.path) {
      await this.saveAs();
      return;
    }
    await this.writeActive(tab.meta.path);
  }

  /** Save the active editable tab to a newly chosen path. */
  async saveAs(): Promise<void> {
    const tab = this.activeTab();
    if (!tab || tab.mode !== 'edit') return;
    try {
      const target = await saveDialog({
        title: 'Save As',
        defaultPath: tab.meta.path || 'untitled.txt',
      });
      if (typeof target !== 'string') return;
      await this.writeActive(target);
      this.patchActive((t) => {
        t.meta = { ...t.meta, path: target };
        // Re-detect language only if the user hadn't set one explicitly.
        if (!t.languageId) t.languageId = this.languages.detect(target)?.id ?? '';
      });
    } catch (err) {
      this.fail('Save As failed', err);
    }
  }

  private async writeActive(path: string): Promise<void> {
    const tab = this.activeTab();
    if (!tab || !this.editor) return;
    try {
      const content = this.editor.getContent();
      const size = await this.editorSvc.saveText(path, content, tab.eol);
      this.editor.markSaved();
      this.patchActive((t) => {
        t.dirty = false;
        t.meta = { ...t.meta, size };
      });
    } catch (err) {
      this.fail('Save failed', err);
    }
  }

  // ---- keyboard shortcuts ----

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      if (event.shiftKey) void this.saveAs();
      else void this.save();
    } else if (key === 'n') {
      event.preventDefault();
      this.newFile();
    } else if (key === 'o') {
      event.preventDefault();
      void this.onOpenFile();
    }
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
