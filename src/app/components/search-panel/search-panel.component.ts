import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface SearchRequest {
  query: string;
  isRegex: boolean;
  caseSensitive: boolean;
}

@Component({
  selector: 'app-search-panel',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="search-panel">
      <input
        #box
        type="search"
        class="query"
        placeholder="Search… (Enter to run)"
        [(ngModel)]="query"
        (keydown.enter)="run()"
        (keydown.escape)="close.emit()"
      />
      <button [class.active]="isRegex()" (click)="isRegex.set(!isRegex())" title="Regular expression">.*</button>
      <button [class.active]="caseSensitive()" (click)="caseSensitive.set(!caseSensitive())" title="Match case">
        Aa
      </button>
      <button (click)="run()" [disabled]="busy">Find</button>
      <span class="sep"></span>
      <button (click)="prev.emit()" [disabled]="total === 0" title="Previous match (Shift+Enter)">↑</button>
      <button (click)="next.emit()" [disabled]="total === 0" title="Next match (Enter)">↓</button>
      <span class="count" [class.empty]="total === 0">
        @if (busy) {
          searching…
        } @else if (total === 0) {
          no results
        } @else {
          {{ current + 1 }} / {{ total }}
        }
      </span>
      <span class="grow"></span>
      <button class="x" (click)="close.emit()" title="Close (Esc)">✕</button>
    </div>
  `,
  styles: [
    `
      .search-panel {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        background: var(--bg-elevated);
        border-bottom: 1px solid var(--border);
      }
      .query {
        width: 280px;
      }
      .sep {
        width: 1px;
        height: 18px;
        background: var(--border);
      }
      .count {
        min-width: 70px;
        color: var(--fg-dim);
        font-variant-numeric: tabular-nums;
      }
      .count.empty {
        opacity: 0.7;
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
export class SearchPanelComponent {
  @Input() busy = false;
  @Input() total = 0;
  @Input() current = 0;

  @Output() search = new EventEmitter<SearchRequest>();
  @Output() next = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  query = '';
  readonly isRegex = signal(false);
  readonly caseSensitive = signal(false);

  run(): void {
    const q = this.query.trim();
    if (!q) return;
    this.search.emit({ query: q, isRegex: this.isRegex(), caseSensitive: this.caseSensitive() });
  }
}
