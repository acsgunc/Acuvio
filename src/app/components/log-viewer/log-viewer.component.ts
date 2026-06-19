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
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { LogService } from '../../services/log.service';
import { logHighlighter } from './log-highlight';
import { searchHighlightField, setSearchHighlights, type HighlightRange } from './search-highlight';

/**
 * Virtualized log viewer.
 *
 * Strategy: the backend holds the GB-scale file. This component keeps only a
 * sliding *window* of lines (a few thousand) in the CodeMirror document, and
 * CodeMirror virtualizes the rendering of that window. As the user scrolls near
 * a window edge, the next/previous chunk is fetched from Rust and the window
 * shifts — so memory stays bounded regardless of file size.
 */
@Component({
  selector: 'app-log-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div #editor class="log-viewer-host"></div>',
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }
      .log-viewer-host {
        height: 100%;
      }
    `,
  ],
})
export class LogViewerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editor', { static: true }) editorRef!: ElementRef<HTMLDivElement>;

  @Input({ required: true }) fileId!: string;
  /** Total line count in the file (provided by parent; may grow over time). */
  @Input() set totalLines(value: number) {
    this._totalLines = value;
    if (this.follow) {
      void this.scrollToEnd();
    }
  }
  get totalLines(): number {
    return this._totalLines;
  }

  /** When true, viewport sticks to the end of the file (live tail). */
  @Input() follow = false;

  /** Soft-wrap long lines instead of horizontal scrolling. */
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

  /** Editor font size in pixels (zoom). */
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

  @Output() topLineChange = new EventEmitter<number>();

  private readonly log = inject(LogService);
  private readonly zone = inject(NgZone);

  private view!: EditorView;
  private readonly gutterCompartment = new Compartment();
  private readonly wrapCompartment = new Compartment();
  private readonly fontCompartment = new Compartment();
  private _wordWrap = false;
  private _fontSize = 13;

  private _totalLines = 0;
  /** Absolute (0-based) index of the first line currently held in the doc. */
  private windowStart = 0;
  /** Number of lines currently held in the doc window. */
  private windowLines = 0;

  private readonly CHUNK = 1000;
  private readonly MAX_WINDOW = 6000;
  private readonly EDGE = 300; // refill when within this many lines of an edge.

  private loading = false;
  private destroyed = false;

  ngAfterViewInit(): void {
    // Build CM outside Angular's change detection — it manages its own DOM.
    this.zone.runOutsideAngular(() => {
      this.view = new EditorView({
        parent: this.editorRef.nativeElement,
        state: EditorState.create({
          doc: '',
          extensions: [
            this.gutterCompartment.of(this.makeGutter()),
            this.wrapCompartment.of(this._wordWrap ? EditorView.lineWrapping : []),
            this.fontCompartment.of(this.makeFontTheme(this._fontSize)),
            highlightActiveLine(),
            drawSelection(),
            EditorView.editable.of(false),
            EditorState.readOnly.of(true),
            EditorView.theme({
              '&': { height: '100%' },
              '.cm-scroller': { overflow: 'auto' },
            }),
            logHighlighter,
            searchHighlightField,
            EditorView.domEventHandlers({
              scroll: () => {
                this.onScroll();
                return false;
              },
            }),
          ],
        }),
      });
    });

    void this.reload(0);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.view?.destroy();
  }

  /** Line-number gutter that maps doc lines back to absolute file lines. */
  private makeGutter() {
    return lineNumbers({
      formatNumber: (n) => (this.windowStart + n).toString(),
    });
  }

  private refreshGutter(): void {
    this.view.dispatch({
      effects: this.gutterCompartment.reconfigure(this.makeGutter()),
    });
  }

  /** Theme extension that controls only the editor font size (zoom). */
  private makeFontTheme(px: number) {
    return EditorView.theme({ '.cm-scroller': { fontSize: `${px}px` } });
  }

  /** Replace the whole window with lines centered around `centerLine`. */
  async reload(centerLine: number): Promise<void> {
    if (this.destroyed) return;
    const half = Math.floor(this.MAX_WINDOW / 2);
    const start = Math.max(0, Math.min(centerLine - half, Math.max(0, this.totalLines - this.MAX_WINDOW)));
    const count = Math.min(this.MAX_WINDOW, Math.max(this.CHUNK, this.totalLines - start));

    this.loading = true;
    try {
      const lines = await this.log.readLines(this.fileId, start, count);
      if (this.destroyed) return;
      this.windowStart = start;
      this.windowLines = lines.length;
      const doc = lines.join('\n');
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: doc },
      });
      this.refreshGutter();
    } finally {
      this.loading = false;
    }
  }

  /** Jump to a 1-based absolute line and place it near the top of the viewport. */
  async goToLine(absoluteLine: number): Promise<void> {
    const target = Math.max(1, Math.min(absoluteLine, this.totalLines));
    const zeroBased = target - 1;
    if (zeroBased < this.windowStart || zeroBased >= this.windowStart + this.windowLines) {
      await this.reload(zeroBased);
    }
    const docLine = zeroBased - this.windowStart + 1;
    if (docLine >= 1 && docLine <= this.view.state.doc.lines) {
      const pos = this.view.state.doc.line(docLine).from;
      this.view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'start' }),
      });
    }
    this.emitTopLine();
  }

  /** Scroll to the very end of the file (used by Follow mode). */
  async scrollToEnd(): Promise<void> {
    if (this.totalLines === 0) return;
    const lastInWindow = this.windowStart + this.windowLines;
    if (lastInWindow < this.totalLines) {
      await this.reload(this.totalLines - 1);
    }
    const end = this.view.state.doc.length;
    this.view.dispatch({ effects: EditorView.scrollIntoView(end, { y: 'end' }) });
  }

  /**
   * Append newly tailed lines. If the window already reaches the old EOF we can
   * append directly; otherwise we just bump the total and let scroll/refill
   * handle it lazily.
   */
  appendTailLines(newLines: string[], newTotal: number): void {
    const reachedEof = this.windowStart + this.windowLines >= this.totalLines;
    this._totalLines = newTotal;

    if (reachedEof && newLines.length > 0) {
      const insertText = (this.windowLines > 0 ? '\n' : '') + newLines.join('\n');
      this.view.dispatch({
        changes: { from: this.view.state.doc.length, insert: insertText },
      });
      this.windowLines += newLines.length;
      this.trimTopIfNeeded();
      if (this.follow) {
        const end = this.view.state.doc.length;
        this.view.dispatch({ effects: EditorView.scrollIntoView(end, { y: 'end' }) });
      }
    } else if (this.follow) {
      void this.scrollToEnd();
    }
  }

  /** Apply search-match highlights, given absolute line numbers + byte ranges. */
  setHighlights(ranges: { line: number; start: number; end: number; active: boolean }[]): void {
    const hl: HighlightRange[] = [];
    for (const r of ranges) {
      const docLine = r.line - this.windowStart;
      if (docLine < 1 || docLine > this.view.state.doc.lines) continue;
      const lineInfo = this.view.state.doc.line(docLine);
      const from = lineInfo.from + Math.min(r.start, lineInfo.length);
      const to = lineInfo.from + Math.min(r.end, lineInfo.length);
      hl.push({ from, to, active: r.active });
    }
    this.view.dispatch({ effects: setSearchHighlights.of(hl) });
  }

  clearHighlights(): void {
    this.view.dispatch({ effects: setSearchHighlights.of([]) });
  }

  // ---- internal scrolling / windowing ----

  private onScroll(): void {
    this.emitTopLine();
    if (this.loading) return;

    const topDocLine = this.topDocLine();
    const bottomDocLine = this.bottomDocLine();

    // Need earlier lines?
    if (this.windowStart > 0 && topDocLine <= this.EDGE) {
      void this.prependChunk();
      return;
    }
    // Need later lines?
    const windowEndAbsolute = this.windowStart + this.windowLines;
    if (windowEndAbsolute < this.totalLines && bottomDocLine >= this.windowLines - this.EDGE) {
      void this.appendChunk();
    }
  }

  private async prependChunk(): Promise<void> {
    if (this.loading || this.windowStart === 0) return;
    this.loading = true;
    try {
      const count = Math.min(this.CHUNK, this.windowStart);
      const newStart = this.windowStart - count;
      const lines = await this.log.readLines(this.fileId, newStart, count);
      if (this.destroyed || lines.length === 0) return;

      // Anchor: remember absolute line currently at viewport top.
      const anchorAbsolute = this.windowStart + this.topDocLine();
      const insertText = lines.join('\n') + '\n';
      this.view.dispatch({ changes: { from: 0, insert: insertText } });
      this.windowStart = newStart;
      this.windowLines += lines.length;
      this.refreshGutter();
      this.trimBottomIfNeeded();
      this.scrollToAbsolute(anchorAbsolute);
    } finally {
      this.loading = false;
    }
  }

  private async appendChunk(): Promise<void> {
    if (this.loading) return;
    const windowEndAbsolute = this.windowStart + this.windowLines;
    if (windowEndAbsolute >= this.totalLines) return;
    this.loading = true;
    try {
      const count = Math.min(this.CHUNK, this.totalLines - windowEndAbsolute);
      const lines = await this.log.readLines(this.fileId, windowEndAbsolute, count);
      if (this.destroyed || lines.length === 0) return;
      const insertText = (this.windowLines > 0 ? '\n' : '') + lines.join('\n');
      this.view.dispatch({ changes: { from: this.view.state.doc.length, insert: insertText } });
      this.windowLines += lines.length;
      this.trimTopIfNeeded();
    } finally {
      this.loading = false;
    }
  }

  private trimTopIfNeeded(): void {
    const overflow = this.windowLines - this.MAX_WINDOW;
    if (overflow <= 0) return;
    const anchorAbsolute = this.windowStart + this.topDocLine();
    const removeLines = Math.min(overflow, this.topDocLine() - this.EDGE);
    if (removeLines <= 0) return;
    const cutTo = this.view.state.doc.line(removeLines + 1).from;
    this.view.dispatch({ changes: { from: 0, to: cutTo } });
    this.windowStart += removeLines;
    this.windowLines -= removeLines;
    this.refreshGutter();
    this.scrollToAbsolute(anchorAbsolute);
  }

  private trimBottomIfNeeded(): void {
    const overflow = this.windowLines - this.MAX_WINDOW;
    if (overflow <= 0) return;
    const keepLines = this.windowLines - overflow;
    if (keepLines < 1) return;
    const cutFrom = this.view.state.doc.line(keepLines + 1).from - 1;
    if (cutFrom <= 0) return;
    this.view.dispatch({ changes: { from: cutFrom, to: this.view.state.doc.length } });
    this.windowLines = keepLines;
  }

  private scrollToAbsolute(absoluteLine: number): void {
    const docLine = absoluteLine - this.windowStart;
    if (docLine < 1 || docLine > this.view.state.doc.lines) return;
    const pos = this.view.state.doc.line(docLine).from;
    this.view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) });
  }

  private topDocLine(): number {
    const top = this.view.scrollDOM.scrollTop;
    return this.view.state.doc.lineAt(this.view.lineBlockAtHeight(top).from).number;
  }

  private bottomDocLine(): number {
    const bottom = this.view.scrollDOM.scrollTop + this.view.scrollDOM.clientHeight;
    return this.view.state.doc.lineAt(this.view.lineBlockAtHeight(bottom).from).number;
  }

  private emitTopLine(): void {
    const abs = this.windowStart + this.topDocLine();
    this.zone.run(() => this.topLineChange.emit(abs));
  }
}
