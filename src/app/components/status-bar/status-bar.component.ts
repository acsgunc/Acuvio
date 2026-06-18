import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';

@Component({
  selector: 'app-status-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="status-bar">
      <span class="item" title="File path">{{ path() || 'No file open' }}</span>
      <span class="grow"></span>
      @if (path()) {
        <span class="item">{{ humanSize() }}</span>
        <span class="item">{{ lineCount().toLocaleString() }} lines</span>
        <span class="item">Ln {{ currentLine().toLocaleString() }}</span>
        <span class="item">{{ encoding() }}</span>
        @if (indexing()) {
          <span class="item indexing">indexing… {{ indexedLines().toLocaleString() }}</span>
        }
        @if (tailing()) {
          <span class="item tail">● live</span>
        }
      }
    </div>
  `,
  styles: [
    `
      .status-bar {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 3px 10px;
        background: var(--accent);
        color: #fff;
        font-size: 11.5px;
        height: 22px;
      }
      .grow {
        flex: 1;
      }
      .item {
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .indexing {
        opacity: 0.9;
        font-style: italic;
      }
      .tail {
        font-weight: 700;
      }
    `,
  ],
})
export class StatusBarComponent {
  @Input() set filePath(v: string | null) {
    this.path.set(v);
  }
  @Input() set size(v: number) {
    this.bytes.set(v);
  }
  @Input() set lines(v: number) {
    this.lineCount.set(v);
  }
  @Input() set current(v: number) {
    this.currentLine.set(v);
  }
  @Input() set fileEncoding(v: string) {
    this.encoding.set(v);
  }
  @Input() set isIndexing(v: boolean) {
    this.indexing.set(v);
  }
  @Input() set indexed(v: number) {
    this.indexedLines.set(v);
  }
  @Input() set isTailing(v: boolean) {
    this.tailing.set(v);
  }

  readonly path = signal<string | null>(null);
  readonly bytes = signal(0);
  readonly lineCount = signal(0);
  readonly currentLine = signal(0);
  readonly encoding = signal('UTF-8');
  readonly indexing = signal(false);
  readonly indexedLines = signal(0);
  readonly tailing = signal(false);

  readonly humanSize = computed(() => {
    let n = this.bytes();
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do {
      n /= 1024;
      i++;
    } while (n >= 1024 && i < units.length - 1);
    return `${n.toFixed(1)} ${units[i]}`;
  });
}
