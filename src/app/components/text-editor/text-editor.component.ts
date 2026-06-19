import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap, type Command } from '@codemirror/view';
import { highlightWhitespace, highlightTrailingWhitespace } from '@codemirror/view';
import {
  indentWithTab,
  copyLineDown,
  moveLineUp,
  moveLineDown,
  deleteLine,
  toggleComment,
  indentMore,
  indentLess,
} from '@codemirror/commands';
import { LanguageRegistry } from '../../services/language-registry.service';
import {
  bookmarks,
  toggleBookmarkEffect,
  clearBookmarksEffect,
  setBookmarksEffect,
  bookmarkedLines,
  nextBookmarkLine,
  prevBookmarkLine,
  partitionByBookmarks,
  invertBookmarks,
} from '../../editor/bookmarks';
import { markHighlighter, setMarkEffect, markCount, type MarkOptions } from '../../editor/mark';
import { findMatchingBracket } from '../../editor/brace-match';
import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  getSearchQuery,
} from '@codemirror/search';

/**
 * Editable document view for normal-sized files.
 *
 * Unlike {@link LogViewerComponent} (a windowed, read-only viewer over a GB
 * memory-mapped file), this component holds the whole file in a CodeMirror
 * document and is fully editable: undo/redo, multi-cursor, search/replace,
 * bracket matching and code folding all come from CodeMirror's `basicSetup`.
 */
@Component({
  selector: 'app-text-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div #editor class="text-editor-host"></div>',
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }
      .text-editor-host {
        height: 100%;
      }
    `,
  ],
})
export class TextEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editor', { static: true }) editorRef!: ElementRef<HTMLDivElement>;

  /** Initial document text (uses `\n` separators). Set once before init. */
  @Input() content = '';

  @Input() set wordWrap(value: boolean) {
    this._wordWrap = value;
    if (this.view) {
      this.view.dispatch({
        effects: this.wrapCompartment.reconfigure(value ? EditorView.lineWrapping : []),
      });
    }
  }
  get wordWrap(): boolean {
    return this._wordWrap;
  }

  @Input() set fontSize(value: number) {
    this._fontSize = value;
    if (this.view) {
      this.view.dispatch({
        effects: this.fontCompartment.reconfigure(this.makeFontTheme(value)),
      });
    }
  }
  get fontSize(): number {
    return this._fontSize;
  }

  /**
   * Language id (from {@link LanguageRegistry}) for syntax highlighting.
   * `null`/`''` means plain text. Resolved lazily; the grammar is downloaded on
   * first use only.
   */
  @Input() set languageId(value: string | null) {
    this._languageId = value ?? '';
    void this.applyLanguage(this._languageId);
  }
  get languageId(): string {
    return this._languageId;
  }

  /**
   * Editor rendering options (Notepad++ View → Show Symbol family). Applied
   * through a single compartment so they reconfigure live without rebuilding
   * the view.
   */
  @Input() set viewOptions(value: ViewRenderOptions) {
    this._viewOptions = value;
    if (this.view) {
      this.view.dispatch({
        effects: this.viewOptionsCompartment.reconfigure(this.makeViewOptions(value)),
      });
    }
  }
  get viewOptions(): ViewRenderOptions {
    return this._viewOptions;
  }

  /** Emits the document's dirty state whenever it changes. */
  @Output() dirtyChange = new EventEmitter<boolean>();
  /** Emits the 1-based cursor line as the selection moves. */
  @Output() cursorLineChange = new EventEmitter<number>();

  private readonly zone = inject(NgZone);
  private readonly languages = inject(LanguageRegistry);

  private view!: EditorView;
  private readonly wrapCompartment = new Compartment();
  private readonly fontCompartment = new Compartment();
  private readonly languageCompartment = new Compartment();
  private readonly viewOptionsCompartment = new Compartment();
  private _wordWrap = false;
  private _fontSize = 13;
  private _languageId = '';
  private _dirty = false;
  private _viewOptions: ViewRenderOptions = {
    showWhitespace: false,
    highlightActiveLine: true,
    highlightTrailingWhitespace: false,
  };
  /** Pending language extension applied once the view is created. */
  private pendingLanguage: Extension = [];
  /** Document length corresponding to the last saved state. */
  private savedDocLength = 0;
  private savedDoc = '';

  ngAfterViewInit(): void {
    this.savedDoc = this.content;
    this.savedDocLength = this.content.length;

    this.zone.runOutsideAngular(() => {
      this.view = new EditorView({
        parent: this.editorRef.nativeElement,
        state: EditorState.create({
          doc: this.content,
          extensions: [
            basicSetup,
            keymap.of([indentWithTab]),
            // Notepad++-style line-operation shortcuts (high precedence so they
            // win over CodeMirror defaults, e.g. Ctrl+D = duplicate, not select).
            Prec.high(
              keymap.of([
                { key: 'Mod-d', run: copyLineDown, preventDefault: true },
                { key: 'Mod-Shift-k', run: deleteLine, preventDefault: true },
                { key: 'Mod-/', run: toggleComment, preventDefault: true },
                // Bookmarks (Notepad++ parity): Ctrl+F2 toggle, F2 next, Shift+F2 prev.
                { key: 'Mod-F2', run: () => (this.toggleBookmark(), true), preventDefault: true },
                { key: 'F2', run: () => (this.nextBookmark(), true), preventDefault: true },
                { key: 'Shift-F2', run: () => (this.previousBookmark(), true), preventDefault: true },
                // Brace matching (Notepad++): Ctrl+B go to match, Ctrl+Shift+B select to match.
                { key: 'Mod-b', run: () => this.goToMatchingBrace(), preventDefault: true },
                { key: 'Mod-Shift-b', run: () => this.selectToMatchingBrace(), preventDefault: true },
              ]),
            ),
            this.languageCompartment.of(this.pendingLanguage),
            this.wrapCompartment.of(this._wordWrap ? EditorView.lineWrapping : []),
            this.fontCompartment.of(this.makeFontTheme(this._fontSize)),
            this.viewOptionsCompartment.of(this.makeViewOptions(this._viewOptions)),
            bookmarks(),
            markHighlighter(),
            EditorView.theme({
              '&': { height: '100%' },
              '.cm-scroller': { overflow: 'auto' },
            }),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) this.recomputeDirty();
              if (update.selectionSet || update.docChanged) this.emitCursorLine();
            }),
          ],
        }),
      });
    });
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  /** The current document text (uses `\n` separators). */
  getContent(): string {
    return this.view ? this.view.state.doc.toString() : this.content;
  }

  /** Number of lines currently in the document. */
  getLineCount(): number {
    return this.view ? this.view.state.doc.lines : 1;
  }

  /**
   * Resolve a language id through the registry and apply its grammar. An empty
   * id clears highlighting (plain text). Concurrency-safe: if the active id
   * changes while a grammar is loading, the stale result is discarded.
   */
  private async applyLanguage(id: string): Promise<void> {
    if (!id) {
      this.pendingLanguage = [];
      this.reconfigureLanguage([]);
      return;
    }
    const resolved = await this.languages.resolve(id);
    // Guard against races: only apply if this id is still the active one.
    if (this._languageId !== id) return;
    const extension = resolved?.extension ?? [];
    this.pendingLanguage = extension;
    this.reconfigureLanguage(extension);
  }

  private reconfigureLanguage(extension: Extension): void {
    if (this.view) {
      this.view.dispatch({
        effects: this.languageCompartment.reconfigure(extension),
      });
    }
  }

  /** Mark the current content as the saved baseline (clears the dirty flag). */
  markSaved(): void {
    this.savedDoc = this.getContent();
    this.savedDocLength = this.savedDoc.length;
    this.setDirty(false);
  }

  /** Move the caret to a 1-based line and scroll it into view. */
  goToLine(line: number): void {
    if (!this.view) return;
    const target = Math.max(1, Math.min(line, this.view.state.doc.lines));
    const pos = this.view.state.doc.line(target).from;
    this.view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      scrollIntoView: true,
    });
    this.view.focus();
  }

  focus(): void {
    this.view?.focus();
  }

  /** Run an arbitrary CodeMirror command against this editor. */
  runCommand(command: Command): boolean {
    if (!this.view) return false;
    const result = command(this.view);
    this.view.focus();
    return result;
  }

  // ---- built-in line operations (CodeMirror @codemirror/commands) ----
  duplicateLine(): void {
    this.runCommand(copyLineDown);
  }
  moveLineUp(): void {
    this.runCommand(moveLineUp);
  }
  moveLineDown(): void {
    this.runCommand(moveLineDown);
  }
  deleteLine(): void {
    this.runCommand(deleteLine);
  }
  toggleComment(): void {
    this.runCommand(toggleComment);
  }
  indentMore(): void {
    this.runCommand(indentMore);
  }
  indentLess(): void {
    this.runCommand(indentLess);
  }

  // ---- Find & Replace (driven by @codemirror/search) ----

  /**
   * Update the active search query. Highlights all matches in the document.
   * Call before {@link findNext} / {@link replaceAll} etc.
   */
  setSearch(opts: {
    search: string;
    replace?: string;
    caseSensitive?: boolean;
    regexp?: boolean;
    wholeWord?: boolean;
  }): void {
    if (!this.view) return;
    const query = new SearchQuery({
      search: opts.search,
      replace: opts.replace ?? '',
      caseSensitive: opts.caseSensitive ?? false,
      regexp: opts.regexp ?? false,
      wholeWord: opts.wholeWord ?? false,
    });
    this.view.dispatch({ effects: setSearchQuery.of(query) });
  }

  findNext(): void {
    if (this.view) {
      findNext(this.view);
      this.view.focus();
    }
  }

  findPrevious(): void {
    if (this.view) {
      findPrevious(this.view);
      this.view.focus();
    }
  }

  replaceNext(): void {
    if (this.view) {
      replaceNext(this.view);
      this.view.focus();
    }
  }

  replaceAll(): void {
    if (this.view) {
      replaceAll(this.view);
      this.view.focus();
    }
  }

  /** Count occurrences of the current query in the document. */
  countMatches(): number {
    if (!this.view) return 0;
    const query = getSearchQuery(this.view.state);
    if (!query.search) return 0;
    let count = 0;
    try {
      const cursor = query.getCursor(this.view.state);
      while (!cursor.next().done) count++;
    } catch {
      return 0; // invalid regex
    }
    return count;
  }

  // ---- Bookmarks (Notepad++ Search → Bookmark) ----

  /** Toggle a bookmark on the line containing the primary caret. */
  toggleBookmark(): void {
    if (!this.view) return;
    const pos = this.view.state.selection.main.head;
    this.view.dispatch({ effects: toggleBookmarkEffect.of(pos) });
    this.view.focus();
  }

  /** Move the caret to the next bookmarked line (wraps around). */
  nextBookmark(): void {
    if (!this.view) return;
    const lines = bookmarkedLines(this.view.state);
    const current = this.view.state.doc.lineAt(this.view.state.selection.main.head).number;
    const target = nextBookmarkLine(lines, current);
    if (target !== null) this.goToLine(target);
  }

  /** Move the caret to the previous bookmarked line (wraps around). */
  previousBookmark(): void {
    if (!this.view) return;
    const lines = bookmarkedLines(this.view.state);
    const current = this.view.state.doc.lineAt(this.view.state.selection.main.head).number;
    const target = prevBookmarkLine(lines, current);
    if (target !== null) this.goToLine(target);
  }

  /** Remove every bookmark in the document. */
  clearBookmarks(): void {
    if (!this.view) return;
    this.view.dispatch({ effects: clearBookmarksEffect.of(null) });
    this.view.focus();
  }

  /** Copy the text of all bookmarked lines to the clipboard. Returns the line count. */
  copyBookmarkedLines(): number {
    if (!this.view) return 0;
    const marked = this.collectBookmarkedLines();
    if (marked.length > 0) void navigator.clipboard?.writeText(marked.join('\n'));
    this.view.focus();
    return marked.length;
  }

  /** Copy the bookmarked lines to the clipboard, then delete them. Returns the line count. */
  cutBookmarkedLines(): number {
    if (!this.view) return 0;
    const marked = this.collectBookmarkedLines();
    if (marked.length > 0) void navigator.clipboard?.writeText(marked.join('\n'));
    this.removeBookmarkedLines();
    return marked.length;
  }

  /** Delete every bookmarked line from the document. */
  removeBookmarkedLines(): void {
    this.keepLines((all, marks) => partitionByBookmarks(all, marks).unmarked);
  }

  /** Delete every line that is NOT bookmarked, keeping only the bookmarked ones. */
  removeNonBookmarkedLines(): void {
    this.keepLines((all, marks) => partitionByBookmarks(all, marks).marked);
  }

  /** Bookmark every currently unbookmarked line and unbookmark the rest. */
  inverseBookmarks(): void {
    if (!this.view) return;
    const state = this.view.state;
    const inverted = invertBookmarks(state.doc.lines, bookmarkedLines(state));
    const positions = inverted.map((n) => state.doc.line(n).from);
    this.view.dispatch({ effects: setBookmarksEffect.of(positions) });
    this.view.focus();
  }

  /** Read the text of each bookmarked line, in document order. */
  private collectBookmarkedLines(): string[] {
    if (!this.view) return [];
    const state = this.view.state;
    const all = Array.from({ length: state.doc.lines }, (_, i) => state.doc.line(i + 1).text);
    return partitionByBookmarks(all, bookmarkedLines(state)).marked;
  }

  /**
   * Replace the whole document with the lines selected by `pick`, then drop all
   * bookmarks (their anchor lines may no longer exist).
   */
  private keepLines(pick: (all: string[], marks: number[]) => string[]): void {
    if (!this.view) return;
    const state = this.view.state;
    const marks = bookmarkedLines(state);
    if (marks.length === 0) return;
    const all = Array.from({ length: state.doc.lines }, (_, i) => state.doc.line(i + 1).text);
    const kept = pick(all, marks);
    this.view.dispatch({
      changes: { from: 0, to: state.doc.length, insert: kept.join('\n') },
      effects: clearBookmarksEffect.of(null),
      userEvent: 'delete.line',
    });
    this.view.focus();
  }

  // ---- Mark (Notepad++ Search → Mark) ----

  /**
   * Persistently highlight every occurrence of `term`. Pass an empty term to
   * clear. Returns the number of highlighted occurrences.
   */
  setMark(term: string, options?: Partial<MarkOptions>): number {
    if (!this.view) return 0;
    const opts: MarkOptions = {
      caseSensitive: options?.caseSensitive ?? false,
      wholeWord: options?.wholeWord ?? false,
      regexp: options?.regexp ?? false,
    };
    this.view.dispatch({ effects: setMarkEffect.of(term ? { term, options: opts } : null) });
    return markCount(this.view.state);
  }

  /** Mark the currently selected text (or the word at the caret). */
  markSelection(options?: Partial<MarkOptions>): number {
    if (!this.view) return 0;
    const sel = this.view.state.selection.main;
    const term = sel.empty ? this.wordAt(sel.head) : this.view.state.sliceDoc(sel.from, sel.to);
    return this.setMark(term, options);
  }

  /** Clear all mark highlighting. */
  clearMark(): void {
    if (!this.view) return;
    this.view.dispatch({ effects: setMarkEffect.of(null) });
    this.view.focus();
  }

  /** The word (identifier) surrounding a document position, or ''. */
  private wordAt(pos: number): string {
    const range = this.view.state.wordAt(pos);
    return range ? this.view.state.sliceDoc(range.from, range.to) : '';
  }

  // ---- Brace matching (Notepad++ Search → Go to / Select to Matching Brace) ----

  /**
   * Move the caret to the bracket matching the one adjacent to the caret.
   * Returns false (and does nothing) when the caret is not next to a bracket
   * with a partner.
   */
  goToMatchingBrace(): boolean {
    if (!this.view) return false;
    const pos = this.view.state.selection.main.head;
    const pair = findMatchingBracket(this.view.state, pos);
    if (!pair) return false;
    // Land just inside the matching bracket (Notepad++ places the caret there).
    const target = pair.matchFrom > pair.bracketFrom ? pair.matchTo : pair.matchFrom;
    this.view.dispatch({
      selection: { anchor: target },
      effects: EditorView.scrollIntoView(target, { y: 'center' }),
      scrollIntoView: true,
    });
    this.view.focus();
    return true;
  }

  /**
   * Select the text between the caret's bracket and its match (inclusive of both
   * brackets). Returns false when there is no matching pair.
   */
  selectToMatchingBrace(): boolean {
    if (!this.view) return false;
    const pos = this.view.state.selection.main.head;
    const pair = findMatchingBracket(this.view.state, pos);
    if (!pair) return false;
    const from = Math.min(pair.bracketFrom, pair.matchFrom);
    const to = Math.max(pair.bracketTo, pair.matchTo);
    this.view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(to, { y: 'center' }),
      scrollIntoView: true,
    });
    this.view.focus();
    return true;
  }

  private recomputeDirty(): void {
    // Cheap length check first; fall back to a content compare only when the
    // length matches the saved baseline (avoids stringifying on every keystroke).
    const len = this.view.state.doc.length;
    const dirty = len !== this.savedDocLength || this.getContent() !== this.savedDoc;
    this.setDirty(dirty);
  }

  private setDirty(dirty: boolean): void {
    if (dirty === this._dirty) return;
    this._dirty = dirty;
    this.zone.run(() => this.dirtyChange.emit(dirty));
  }

  private emitCursorLine(): void {
    const line = this.view.state.doc.lineAt(this.view.state.selection.main.head).number;
    this.zone.run(() => this.cursorLineChange.emit(line));
  }

  private makeFontTheme(px: number) {
    return EditorView.theme({ '.cm-scroller': { fontSize: `${px}px` } });
  }

  /**
   * Build the extension set for the current view-render options.
   *
   * `highlightWhitespace`/`highlightTrailingWhitespace` are additive. Active-line
   * highlighting is always present via `basicSetup`, so disabling it is done with
   * a theme override that makes the highlight transparent rather than by removing
   * the extension (which a compartment cannot do).
   */
  private makeViewOptions(opts: ViewRenderOptions): Extension {
    const extensions: Extension[] = [];
    if (opts.showWhitespace) extensions.push(highlightWhitespace());
    if (opts.highlightTrailingWhitespace) extensions.push(highlightTrailingWhitespace());
    if (!opts.highlightActiveLine) {
      extensions.push(
        EditorView.theme({
          '.cm-activeLine': { backgroundColor: 'transparent' },
          '.cm-activeLineGutter': { backgroundColor: 'transparent' },
        }),
      );
    }
    return extensions;
  }
}

/** Editor rendering toggles surfaced through the View menu. */
export interface ViewRenderOptions {
  /** Render spaces and tabs as visible glyphs. */
  showWhitespace: boolean;
  /** Highlight the line containing the primary caret. */
  highlightActiveLine: boolean;
  /** Tint trailing whitespace at line ends. */
  highlightTrailingWhitespace: boolean;
}
