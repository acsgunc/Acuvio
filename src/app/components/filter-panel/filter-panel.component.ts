import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface FilterRequest {
  query: string;
  isRegex: boolean;
  caseSensitive: boolean;
  exclude: boolean;
}

@Component({
  selector: 'app-filter-panel',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filter-panel">
      <span class="label">Filter:</span>
      <input
        type="search"
        class="query"
        placeholder="Pattern (Enter to apply)"
        [(ngModel)]="query"
        (keydown.enter)="apply()"
        (keydown.escape)="close.emit()"
      />
      <button [class.active]="isRegex()" (click)="isRegex.set(!isRegex())" title="Regular expression">.*</button>
      <button [class.active]="caseSensitive()" (click)="caseSensitive.set(!caseSensitive())" title="Match case">
        Aa
      </button>
      <button [class.active]="exclude()" (click)="exclude.set(!exclude())" title="Exclude matching lines">
        {{ exclude() ? 'Exclude' : 'Include' }}
      </button>
      <button (click)="apply()" [disabled]="busy">Apply</button>
      <button (click)="clear.emit()" [disabled]="!active">Clear</button>
      <span class="status">
        @if (busy) {
          filtering…
        } @else if (active) {
          {{ matched }} lines
        }
      </span>
      <span class="grow"></span>
      <button class="x" (click)="close.emit()" title="Close">✕</button>
    </div>
  `,
  styles: [
    `
      .filter-panel {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        background: var(--bg-elevated);
        border-bottom: 1px solid var(--border);
      }
      .label {
        color: var(--fg-dim);
      }
      .query {
        width: 260px;
      }
      .status {
        color: var(--fg-dim);
        font-variant-numeric: tabular-nums;
        min-width: 70px;
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
export class FilterPanelComponent {
  @Input() busy = false;
  @Input() active = false;
  @Input() matched = 0;

  @Output() filter = new EventEmitter<FilterRequest>();
  @Output() clear = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  query = '';
  readonly isRegex = signal(false);
  readonly caseSensitive = signal(false);
  readonly exclude = signal(false);

  apply(): void {
    const q = this.query.trim();
    if (!q) return;
    this.filter.emit({
      query: q,
      isRegex: this.isRegex(),
      caseSensitive: this.caseSensitive(),
      exclude: this.exclude(),
    });
  }
}
