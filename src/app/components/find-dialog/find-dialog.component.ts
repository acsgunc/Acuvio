import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { FindQuery, SearchMode } from '../../editor/find-engine';

/** Which dialog tab is active. */
export type FindTab = 'find' | 'replace' | 'mark';

/** The kind of action the host should perform. */
export type FindActionType =
  | 'findNext'
  | 'findPrev'
  | 'count'
  | 'findAll'
  | 'replace'
  | 'replaceAll'
  | 'markAll'
  | 'clearMarks';

/** A fully specified request emitted to the host (app) for execution. */
export interface FindRequest {
  type: FindActionType;
  query: FindQuery;
  replacement: string;
  /** Navigation / scope options (Notepad++ Find tab). */
  wrapAround: boolean;
  backward: boolean;
  inSelection: boolean;
  /** Mark tab: target style slot (0–4) and whether to bookmark matching lines. */
  markStyle: number;
  bookmarkLine: boolean;
  purge: boolean;
}

/** One Find-All result row shown in the dialog's results list. */
export interface FindResultRow {
  line: number;
  column: number;
  from: number;
  to: number;
  lineText: string;
}

/**
 * Full Notepad++-style **Find / Replace / Mark** dialog for editable documents
 * (Ctrl+F / Ctrl+H). Covers the entire Find-tab option matrix: search modes
 * (Normal / Extended / Regular expression with ". matches newline"), Match case,
 * Match whole word only, Wrap around, Backward direction and In selection, plus
 * Count and Find All in Current Document with a navigable results list.
 *
 * The component is presentation + state only; the host wires the emitted
 * {@link FindRequest}s to the editor engine and feeds back status text and
 * results.
 */
@Component({
  selector: 'app-find-dialog',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="find-dialog" role="dialog" aria-label="Find and Replace">
      <div class="tabs">
        <button [class.active]="tab() === 'find'" (click)="setTab('find')">Find</button>
        <button [class.active]="tab() === 'replace'" (click)="setTab('replace')">Replace</button>
        <button [class.active]="tab() === 'mark'" (click)="setTab('mark')">Mark</button>
        <span class="grow"></span>
        <button class="x" (click)="close.emit()" title="Close (Esc)">✕</button>
      </div>

      <div class="fields">
        <label class="field">
          <span class="label">Find what:</span>
          <input
            #findBox
            type="text"
            class="query"
            list="find-history"
            [(ngModel)]="term"
            (ngModelChange)="onTermChange()"
            (keydown.enter)="primaryAction()"
            (keydown.shift.enter)="run('findPrev')"
            (keydown.escape)="close.emit()"
          />
          <datalist id="find-history">
            @for (h of findHistory(); track h) {
              <option [value]="h"></option>
            }
          </datalist>
        </label>

        @if (tab() === 'replace') {
          <label class="field">
            <span class="label">Replace with:</span>
            <input
              type="text"
              class="query"
              list="replace-history"
              [(ngModel)]="replacement"
              (keydown.enter)="run('replace')"
              (keydown.escape)="close.emit()"
            />
            <datalist id="replace-history">
              @for (h of replaceHistory(); track h) {
                <option [value]="h"></option>
              }
            </datalist>
          </label>
        }

        @if (tab() === 'mark') {
          <label class="field">
            <span class="label">Style:</span>
            <select class="style" [(ngModel)]="markStyle">
              <option [ngValue]="0">1 — Yellow</option>
              <option [ngValue]="1">2 — Green</option>
              <option [ngValue]="2">3 — Cyan</option>
              <option [ngValue]="3">4 — Magenta</option>
              <option [ngValue]="4">5 — Orange</option>
            </select>
          </label>
        }
      </div>

      <div class="options">
        <div class="opt-col">
          <label><input type="checkbox" [(ngModel)]="wholeWord" (ngModelChange)="onTermChange()" [disabled]="mode() === 'regex'" /> Match whole word only</label>
          <label><input type="checkbox" [(ngModel)]="caseSensitive" (ngModelChange)="onTermChange()" /> Match case</label>
          <label><input type="checkbox" [(ngModel)]="wrapAround" /> Wrap around</label>
          @if (tab() === 'find') {
            <label><input type="checkbox" [(ngModel)]="backward" /> Backward direction</label>
          }
          <label><input type="checkbox" [(ngModel)]="inSelection" (ngModelChange)="inSelectionChange.emit(inSelection)" /> In selection</label>
          @if (tab() === 'mark') {
            <label><input type="checkbox" [(ngModel)]="bookmarkLine" /> Bookmark line</label>
            <label><input type="checkbox" [(ngModel)]="purge" /> Purge for each search</label>
          }
        </div>

        <fieldset class="modes">
          <legend>Search Mode</legend>
          <label><input type="radio" name="mode" value="normal" [(ngModel)]="modeValue" (ngModelChange)="onModeChange()" /> Normal</label>
          <label><input type="radio" name="mode" value="extended" [(ngModel)]="modeValue" (ngModelChange)="onModeChange()" /> Extended (\\n, \\r, \\t, \\0, \\x…)</label>
          <label><input type="radio" name="mode" value="regex" [(ngModel)]="modeValue" (ngModelChange)="onModeChange()" /> Regular expression</label>
          <label class="indent"><input type="checkbox" [(ngModel)]="dotMatchesNewline" [disabled]="mode() !== 'regex'" (ngModelChange)="onTermChange()" /> . matches newline</label>
        </fieldset>
      </div>

      <div class="actions">
        @if (tab() === 'find') {
          <button (click)="run('findNext')" [disabled]="!term">Find Next</button>
          <button (click)="run('findPrev')" [disabled]="!term">Find Previous</button>
          <button (click)="run('count')" [disabled]="!term">Count</button>
          <button (click)="run('findAll')" [disabled]="!term">Find All in Current Document</button>
        }
        @if (tab() === 'replace') {
          <button (click)="run('findNext')" [disabled]="!term">Find Next</button>
          <button (click)="run('replace')" [disabled]="!term">Replace</button>
          <button (click)="run('replaceAll')" [disabled]="!term">Replace All</button>
        }
        @if (tab() === 'mark') {
          <button (click)="run('markAll')" [disabled]="!term">Mark All</button>
          <button (click)="run('clearMarks')">Clear All Marks</button>
        }
      </div>

      @if (status) {
        <div class="status" [class.error]="statusError">{{ status }}</div>
      }

      @if (results().length) {
        <div class="results">
          <div class="results-head">
            <span>{{ results().length }} {{ results().length === 1 ? 'hit' : 'hits' }}</span>
            <span class="grow"></span>
            <button class="x" (click)="clearResults()" title="Hide results">✕</button>
          </div>
          <ul>
            @for (r of results(); track r.from) {
              <li (click)="jumpTo.emit(r)">
                <span class="loc">Ln {{ r.line }}, Col {{ r.column }}</span>
                <span class="text">{{ r.lineText.trim() }}</span>
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .find-dialog {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px 10px;
        background: var(--bg-elevated);
        border-bottom: 1px solid var(--border);
        font-size: 13px;
      }
      .tabs {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .tabs button {
        padding: 4px 12px;
        background: transparent;
        border: 1px solid transparent;
        border-bottom: none;
        border-radius: 4px 4px 0 0;
        color: var(--fg-dim);
        cursor: pointer;
      }
      .tabs button.active {
        background: var(--bg);
        border-color: var(--border);
        color: var(--fg);
      }
      .grow {
        flex: 1;
      }
      .fields {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .field {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .field .label {
        width: 86px;
        color: var(--fg-dim);
        text-align: right;
      }
      .query {
        flex: 1;
        max-width: 420px;
      }
      .style {
        padding: 3px 6px;
      }
      .options {
        display: flex;
        gap: 24px;
      }
      .opt-col {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .options label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
      }
      .modes {
        display: flex;
        flex-direction: column;
        gap: 4px;
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 4px 10px 8px;
        margin: 0;
      }
      .modes legend {
        color: var(--fg-dim);
        padding: 0 4px;
      }
      .modes .indent {
        margin-left: 20px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .actions button {
        padding: 4px 10px;
      }
      .status {
        color: var(--fg-dim);
        font-variant-numeric: tabular-nums;
      }
      .status.error {
        color: var(--danger, #e06c75);
      }
      .results {
        display: flex;
        flex-direction: column;
        max-height: 220px;
        border: 1px solid var(--border);
        border-radius: 4px;
        overflow: hidden;
      }
      .results-head {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 8px;
        background: var(--bg);
        border-bottom: 1px solid var(--border);
        color: var(--fg-dim);
      }
      .results ul {
        margin: 0;
        padding: 0;
        list-style: none;
        overflow: auto;
      }
      .results li {
        display: flex;
        gap: 10px;
        padding: 2px 8px;
        cursor: pointer;
        white-space: nowrap;
      }
      .results li:hover {
        background: var(--bg-hover, rgba(127, 127, 127, 0.15));
      }
      .results .loc {
        color: var(--fg-dim);
        min-width: 110px;
        font-variant-numeric: tabular-nums;
      }
      .results .text {
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: var(--mono, monospace);
      }
      .x {
        padding: 2px 8px;
      }
    `,
  ],
})
export class FindDialogComponent implements AfterViewInit, OnChanges {
  @ViewChild('findBox') findBox?: ElementRef<HTMLInputElement>;

  private readonly cdr = inject(ChangeDetectorRef);

  /** Status / feedback line set by the host (e.g. "12 matches", errors). */
  @Input() status = '';
  /** Render the status line as an error. */
  @Input() statusError = false;
  /** Tab to show; (re)applied whenever {@link openNonce} changes. */
  @Input() requestedTab: FindTab = 'find';
  /** Seed text for the Find-what field; applied with {@link openNonce}. */
  @Input() seed = '';
  /** Bump this to (re)apply {@link requestedTab} + {@link seed} and focus. */
  @Input() openNonce = 0;

  @Output() request = new EventEmitter<FindRequest>();
  @Output() jumpTo = new EventEmitter<FindResultRow>();
  @Output() inSelectionChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();

  readonly tab = signal<FindTab>('find');
  readonly mode = signal<SearchMode>('normal');
  readonly findHistory = signal<string[]>([]);
  readonly replaceHistory = signal<string[]>([]);
  readonly results = signal<FindResultRow[]>([]);

  term = '';
  replacement = '';
  modeValue: SearchMode = 'normal';
  caseSensitive = false;
  wholeWord = false;
  wrapAround = true;
  backward = false;
  inSelection = false;
  dotMatchesNewline = false;
  markStyle = 0;
  bookmarkLine = false;
  purge = true;

  ngAfterViewInit(): void {
    this.applyOpen();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['openNonce'] && !changes['openNonce'].firstChange) {
      this.applyOpen();
    }
  }

  /** Apply the requested tab + seed and focus the input. */
  private applyOpen(): void {
    this.tab.set(this.requestedTab);
    if (this.requestedTab !== 'find') this.backward = false;
    if (this.seed) {
      this.term = this.seed;
      this.onTermChange();
    }
    // `term` is a plain field bound via ngModel; under zoneless OnPush a
    // programmatic change won't reach the <input> without an explicit check.
    this.cdr.markForCheck();
    queueMicrotask(() => this.focusInput());
  }

  /** Focus and select the Find-what field (used when (re)opening). */
  focusInput(): void {
    const el = this.findBox?.nativeElement;
    el?.focus();
    el?.select();
  }

  /** Switch the active tab and refocus the search field. */
  setTab(tab: FindTab): void {
    this.tab.set(tab);
    if (tab !== 'find') this.backward = false;
    queueMicrotask(() => this.focusInput());
  }

  onModeChange(): void {
    this.mode.set(this.modeValue);
    if (this.modeValue !== 'regex') this.dotMatchesNewline = false;
    this.onTermChange();
  }

  /** Notify the host the query changed (so it can refresh highlight/count). */
  onTermChange(): void {
    this.request.emit(this.buildRequest('count'));
  }

  /** Set the results list (host feeds Find-All hits back here). */
  showResults(rows: FindResultRow[]): void {
    this.results.set(rows);
  }

  clearResults(): void {
    this.results.set([]);
  }

  /** The Enter-key default action depends on the active tab. */
  primaryAction(): void {
    if (this.tab() === 'replace') this.run('replace');
    else if (this.tab() === 'mark') this.run('markAll');
    else this.run('findNext');
  }

  run(type: FindActionType): void {
    if (type !== 'clearMarks' && !this.term) return;
    if (this.term) this.pushHistory(this.findHistory, this.term);
    if ((type === 'replace' || type === 'replaceAll') && this.replacement) {
      this.pushHistory(this.replaceHistory, this.replacement);
    }
    this.request.emit(this.buildRequest(type));
  }

  private buildRequest(type: FindActionType): FindRequest {
    const query: FindQuery = {
      term: this.term,
      mode: this.modeValue,
      caseSensitive: this.caseSensitive,
      wholeWord: this.wholeWord,
      dotMatchesNewline: this.dotMatchesNewline,
    };
    return {
      type,
      query,
      replacement: this.replacement,
      wrapAround: this.wrapAround,
      backward: type === 'findPrev' ? true : this.backward,
      inSelection: this.inSelection,
      markStyle: this.markStyle,
      bookmarkLine: this.bookmarkLine,
      purge: this.purge,
    };
  }

  private pushHistory(sig: ReturnType<typeof signal<string[]>>, value: string): void {
    sig.update((list) => [value, ...list.filter((v) => v !== value)].slice(0, 20));
  }
}
