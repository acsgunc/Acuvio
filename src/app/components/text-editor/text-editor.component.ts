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
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { LanguageRegistry } from '../../services/language-registry.service';

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
  private _wordWrap = false;
  private _fontSize = 13;
  private _languageId = '';
  private _dirty = false;
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
            this.languageCompartment.of(this.pendingLanguage),
            this.wrapCompartment.of(this._wordWrap ? EditorView.lineWrapping : []),
            this.fontCompartment.of(this.makeFontTheme(this._fontSize)),
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
}
