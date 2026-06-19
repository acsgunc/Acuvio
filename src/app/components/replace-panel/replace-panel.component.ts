import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Output,
  ViewChild,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

/** A find/replace query emitted to the host editor. */
export interface ReplaceQuery {
  search: string;
  replace: string;
  caseSensitive: boolean;
  regexp: boolean;
  wholeWord: boolean;
}

/**
 * Find & Replace bar for **editable documents**.
 *
 * This is distinct from {@link SearchPanelComponent}, which drives the Rust
 * backend search over GB-scale logs. Here the work is delegated to
 * `@codemirror/search` inside the in-memory editor, so it supports live
 * highlight, replace-one, and replace-all.
 */
@Component({
  selector: 'app-replace-panel',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="replace-panel">
      <div class="row">
        <input
          #findBox
          type="search"
          class="query"
          placeholder="Find… (Enter)"
          [(ngModel)]="search"
          (ngModelChange)="emitQuery()"
          (keydown.enter)="findNext.emit()"
          (keydown.shift.enter)="findPrevious.emit()"
          (keydown.escape)="close.emit()"
        />
        <button [class.active]="caseSensitive()" (click)="toggle('case')" title="Match case">Aa</button>
        <button [class.active]="wholeWord()" (click)="toggle('word')" title="Whole word">W</button>
        <button [class.active]="regexp()" (click)="toggle('regex')" title="Regular expression">.*</button>
        <button (click)="findPrevious.emit()" title="Previous (Shift+Enter)">↑</button>
        <button (click)="findNext.emit()" title="Next (Enter)">↓</button>
        <span class="count">{{ matchCount }} {{ matchCount === 1 ? 'match' : 'matches' }}</span>
        <span class="grow"></span>
        <button class="x" (click)="close.emit()" title="Close (Esc)">✕</button>
      </div>
      <div class="row">
        <input
          type="search"
          class="query"
          placeholder="Replace with…"
          [(ngModel)]="replace"
          (ngModelChange)="emitQuery()"
          (keydown.enter)="replaceNext.emit()"
          (keydown.escape)="close.emit()"
        />
        <button (click)="replaceNext.emit()" title="Replace next">Replace</button>
        <button (click)="replaceAll.emit()" title="Replace all">Replace All</button>
        <span class="grow"></span>
      </div>
    </div>
  `,
  styles: [
    `
      .replace-panel {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 6px 8px;
        background: var(--bg-elevated);
        border-bottom: 1px solid var(--border);
      }
      .row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .query {
        width: 260px;
      }
      .count {
        min-width: 80px;
        color: var(--fg-dim);
        font-variant-numeric: tabular-nums;
      }
      .grow {
        flex: 1;
      }
      .x {
        padding: 4px 8px;
      }
    `,
  ],
})
export class ReplacePanelComponent implements AfterViewInit {
  @ViewChild('findBox') findBox?: ElementRef<HTMLInputElement>;

  /** Number of matches for the current query (provided by the host). */
  matchCount = 0;

  @Output() query = new EventEmitter<ReplaceQuery>();
  @Output() findNext = new EventEmitter<void>();
  @Output() findPrevious = new EventEmitter<void>();
  @Output() replaceNext = new EventEmitter<void>();
  @Output() replaceAll = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  search = '';
  replace = '';
  readonly caseSensitive = signal(false);
  readonly wholeWord = signal(false);
  readonly regexp = signal(false);

  ngAfterViewInit(): void {
    this.findBox?.nativeElement.focus();
  }

  toggle(which: 'case' | 'word' | 'regex'): void {
    if (which === 'case') this.caseSensitive.update((v) => !v);
    else if (which === 'word') this.wholeWord.update((v) => !v);
    else this.regexp.update((v) => !v);
    this.emitQuery();
  }

  emitQuery(): void {
    this.query.emit({
      search: this.search,
      replace: this.replace,
      caseSensitive: this.caseSensitive(),
      regexp: this.regexp(),
      wholeWord: this.wholeWord(),
    });
  }
}
