import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';

/** A single entry in a {@link DropdownMenuComponent}. */
export interface MenuItem {
  /** Action id emitted on click. Omit for a separator. */
  action?: string;
  /** Visible label. */
  label?: string;
  /** Optional keyboard hint shown right-aligned, e.g. `"Ctrl+D"`. */
  shortcut?: string;
  /** When true, render a divider instead of a clickable item. */
  separator?: boolean;
  /** When true, the item is shown disabled. */
  disabled?: boolean;
  /** When defined, render a checkbox-style toggle with this checked state. */
  checked?: boolean;
}

/**
 * Lightweight, reusable dropdown menu (e.g. the Edit / View menus).
 *
 * The component is presentation-only: it renders a labelled trigger button and,
 * when open, a list of {@link MenuItem}s. Selecting an item emits its `action`;
 * the parent decides what each action does. This keeps menu wiring declarative
 * and lets new menus be added without bespoke components.
 */
@Component({
  selector: 'app-dropdown-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="menu" [class.open]="open()">
      <button class="trigger" [disabled]="disabled" (click)="toggle()" [title]="label">
        {{ label }} ▾
      </button>
      @if (open()) {
        <div class="dropdown" role="menu">
          @for (item of items; track $index) {
            @if (item.separator) {
              <div class="divider"></div>
            } @else {
              <button
                class="entry"
                role="menuitem"
                [disabled]="item.disabled"
                (click)="select(item)"
              >
                <span class="entry-check">{{ item.checked === undefined ? '' : (item.checked ? '✓' : '') }}</span>
                <span class="entry-label">{{ item.label }}</span>
                @if (item.shortcut) {
                  <span class="entry-shortcut">{{ item.shortcut }}</span>
                }
              </button>
            }
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .menu {
        position: relative;
        display: inline-block;
      }
      .trigger {
        background: transparent;
        border: 1px solid transparent;
      }
      .menu.open .trigger {
        background: var(--bg-input);
        border-color: var(--border);
      }
      .dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        z-index: 200;
        min-width: 220px;
        margin-top: 2px;
        padding: 4px;
        background: var(--bg-panel);
        border: 1px solid var(--border-strong);
        border-radius: 4px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
      }
      .entry {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        width: 100%;
        padding: 5px 10px;
        background: transparent;
        border: none;
        border-radius: 3px;
        text-align: left;
        white-space: nowrap;
      }
      .entry:hover:not(:disabled) {
        background: var(--accent);
        color: #fff;
      }
      .entry-check {
        flex: 0 0 14px;
        width: 14px;
        text-align: center;
        opacity: 0.9;
      }
      .entry-label {
        flex: 1 1 auto;
      }
      .entry-shortcut {
        opacity: 0.6;
        font-size: 11px;
      }
      .divider {
        height: 1px;
        margin: 4px 6px;
        background: var(--border);
      }
    `,
  ],
})
export class DropdownMenuComponent {
  @Input({ required: true }) label!: string;
  @Input() items: MenuItem[] = [];
  @Input() disabled = false;

  @Output() action = new EventEmitter<string>();

  readonly open = signal(false);
  private readonly host = inject(ElementRef<HTMLElement>);

  toggle(): void {
    this.open.update((v) => !v);
  }

  select(item: MenuItem): void {
    if (item.disabled || !item.action) return;
    this.action.emit(item.action);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }
}
