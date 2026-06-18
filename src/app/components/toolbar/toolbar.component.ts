import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button (click)="openFile.emit()" title="Open a log file (Ctrl+O)">📂 Open</button>
      <button
        [class.active]="follow"
        [disabled]="!hasFile"
        (click)="toggleFollow.emit()"
        title="Follow / live-tail the file"
      >
        {{ follow ? '⏸ Following' : '▶ Follow' }}
      </button>
      <span class="sep"></span>
      <button [disabled]="!hasFile" [class.active]="searchOpen" (click)="toggleSearch.emit()" title="Search (Ctrl+F)">
        🔍 Search
      </button>
      <button [disabled]="!hasFile" [class.active]="filterOpen" (click)="toggleFilter.emit()" title="Filter lines">
        ⚗ Filter
      </button>
      <span class="sep"></span>
      <button [disabled]="!hasFile" (click)="goToTop.emit()" title="Go to start">⤒ Top</button>
      <button [disabled]="!hasFile" (click)="goToEnd.emit()" title="Go to end">⤓ End</button>
      <span class="grow"></span>
      <span class="brand">Acuvio</span>
    </div>
  `,
  styles: [
    `
      .toolbar {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        background: var(--bg-panel);
        border-bottom: 1px solid var(--border);
      }
      .sep {
        width: 1px;
        height: 20px;
        background: var(--border);
        margin: 0 2px;
      }
      .grow {
        flex: 1;
      }
      .brand {
        font-weight: 700;
        letter-spacing: 0.5px;
        color: var(--accent);
        opacity: 0.85;
        padding-right: 6px;
      }
    `,
  ],
})
export class ToolbarComponent {
  @Input() hasFile = false;
  @Input() follow = false;
  @Input() searchOpen = false;
  @Input() filterOpen = false;

  @Output() openFile = new EventEmitter<void>();
  @Output() toggleFollow = new EventEmitter<void>();
  @Output() toggleSearch = new EventEmitter<void>();
  @Output() toggleFilter = new EventEmitter<void>();
  @Output() goToTop = new EventEmitter<void>();
  @Output() goToEnd = new EventEmitter<void>();
}
