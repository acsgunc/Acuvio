import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { DropdownMenuComponent, type MenuItem } from '../dropdown-menu/dropdown-menu.component';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [DropdownMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button (click)="newFile.emit()" title="New file (Ctrl+N)">📄 New</button>
      <button (click)="openFile.emit()" title="Open a file (Ctrl+O)">📂 Open</button>
      <button [disabled]="!isEdit" (click)="save.emit()" title="Save (Ctrl+S)">
        💾 Save{{ isEdit && dirty ? ' *' : '' }}
      </button>
      <button [disabled]="!isEdit" (click)="saveAs.emit()" title="Save As (Ctrl+Shift+S)">Save As…</button>
      <span class="sep"></span>
      <app-dropdown-menu
        label="Edit"
        [disabled]="!isEdit"
        [items]="editMenuItems"
        (action)="editAction.emit($event)"
      ></app-dropdown-menu>
      <app-dropdown-menu
        label="View"
        [items]="viewMenuItems"
        (action)="viewAction.emit($event)"
      ></app-dropdown-menu>
      <span class="sep"></span>
      <button
        [class.active]="follow"
        [disabled]="!hasFile || isEdit"
        (click)="toggleFollow.emit()"
        title="Follow / live-tail the file"
      >
        {{ follow ? '⏸ Following' : '▶ Follow' }}
      </button>
      <span class="sep"></span>
      <button
        [disabled]="!hasFile || isEdit"
        [class.active]="searchOpen"
        (click)="toggleSearch.emit()"
        title="Search (Ctrl+F)"
      >
        🔍 Search
      </button>
      <button
        [disabled]="!hasFile || isEdit"
        [class.active]="filterOpen"
        (click)="toggleFilter.emit()"
        title="Filter lines"
      >
        ⚗ Filter
      </button>
      <button [disabled]="!isEdit" (click)="toggleReplace.emit()" title="Find & Replace (Ctrl+H)">
        🔁 Replace
      </button>
      <span class="sep"></span>
      <button [disabled]="!hasFile" (click)="goToTop.emit()" title="Go to start">⤒ Top</button>
      <button [disabled]="!hasFile" (click)="goToEnd.emit()" title="Go to end">⤓ End</button>
      <form class="goto" (submit)="onGoto($event)">
        <input
          #gotoInput
          type="number"
          min="1"
          [disabled]="!hasFile"
          placeholder="Line"
          title="Go to line (Enter)"
        />
        <button type="submit" [disabled]="!hasFile" title="Go to line">↪</button>
      </form>
      <span class="sep"></span>
      <button
        [disabled]="!hasFile"
        [class.active]="wordWrap"
        (click)="toggleWrap.emit()"
        title="Toggle word wrap"
      >
        ↩ Wrap
      </button>
      <button [disabled]="!hasFile" (click)="zoomOut.emit()" title="Zoom out">A−</button>
      <button [disabled]="!hasFile" (click)="zoomReset.emit()" title="Reset zoom">{{ fontSize }}px</button>
      <button [disabled]="!hasFile" (click)="zoomIn.emit()" title="Zoom in">A+</button>
      <span class="sep"></span>
      <button (click)="toggleTheme.emit()" [title]="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'">
        {{ theme === 'dark' ? '🌙' : '☀️' }}
      </button>
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
      .goto {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .goto input {
        width: 64px;
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
  @Input() wordWrap = false;
  @Input() fontSize = 13;
  @Input() theme: 'dark' | 'light' = 'dark';
  /** True when the active tab is an editable document. */
  @Input() isEdit = false;
  /** True when the active editable document has unsaved changes. */
  @Input() dirty = false;
  /** View → render-option toggle states (drive the checkmarks). */
  @Input() showWhitespace = false;
  @Input() highlightActiveLine = true;
  @Input() highlightTrailingWhitespace = false;

  @Output() openFile = new EventEmitter<void>();
  @Output() newFile = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() saveAs = new EventEmitter<void>();
  @Output() editAction = new EventEmitter<string>();
  @Output() viewAction = new EventEmitter<string>();
  @Output() toggleFollow = new EventEmitter<void>();
  @Output() toggleSearch = new EventEmitter<void>();
  @Output() toggleFilter = new EventEmitter<void>();
  @Output() toggleReplace = new EventEmitter<void>();
  @Output() goToTop = new EventEmitter<void>();
  @Output() goToEnd = new EventEmitter<void>();
  @Output() gotoLine = new EventEmitter<number>();
  @Output() toggleWrap = new EventEmitter<void>();
  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();
  @Output() zoomReset = new EventEmitter<void>();
  @Output() toggleTheme = new EventEmitter<void>();

  /** Notepad++-style Edit menu (enabled only for editable documents). */
  readonly editMenuItems: MenuItem[] = [
    { action: 'duplicateLine', label: 'Duplicate Line', shortcut: 'Ctrl+D' },
    { action: 'moveLineUp', label: 'Move Line Up', shortcut: 'Alt+↑' },
    { action: 'moveLineDown', label: 'Move Line Down', shortcut: 'Alt+↓' },
    { action: 'deleteLine', label: 'Delete Line', shortcut: 'Ctrl+Shift+K' },
    { action: 'joinLines', label: 'Join Lines' },
    { action: 'insertBlankLineAbove', label: 'Insert Blank Line Above' },
    { action: 'insertBlankLineBelow', label: 'Insert Blank Line Below' },
    { separator: true },
    { action: 'sortAscending', label: 'Sort Lines Ascending' },
    { action: 'sortDescending', label: 'Sort Lines Descending' },
    { action: 'sortCaseInsensitive', label: 'Sort Lines (Ignore Case)' },
    { action: 'sortNumericAscending', label: 'Sort Lines as Integers ↑' },
    { action: 'sortNumericDescending', label: 'Sort Lines as Integers ↓' },
    { action: 'sortLengthAscending', label: 'Sort Lines by Length ↑' },
    { action: 'sortLengthDescending', label: 'Sort Lines by Length ↓' },
    { action: 'reverseLines', label: 'Reverse Line Order' },
    { action: 'randomizeLines', label: 'Randomize Line Order' },
    { action: 'removeDuplicateLines', label: 'Remove Duplicate Lines' },
    { action: 'removeConsecutiveDuplicateLines', label: 'Remove Consecutive Duplicates' },
    { action: 'removeEmptyLines', label: 'Remove Empty Lines' },
    { separator: true },
    { action: 'insertDateTimeShort', label: 'Insert Date/Time (Short)' },
    { action: 'insertDateTimeLong', label: 'Insert Date/Time (Long)' },
    { action: 'copyFilePath', label: 'Copy Full File Path' },
    { action: 'copyFileName', label: 'Copy File Name' },
    { action: 'copyFileDir', label: 'Copy Directory Path' },
    { separator: true },
    { action: 'upperCase', label: 'UPPERCASE' },
    { action: 'lowerCase', label: 'lowercase' },
    { action: 'properCase', label: 'Proper Case' },
    { action: 'sentenceCase', label: 'Sentence case' },
    { action: 'invertCase', label: 'iNVERT cASE' },
    { separator: true },
    { action: 'trimTrailing', label: 'Trim Trailing Whitespace' },
    { action: 'trimLeading', label: 'Trim Leading Whitespace' },
    { action: 'tabsToSpaces', label: 'Tabs → Spaces' },
    { action: 'spacesToTabs', label: 'Spaces → Tabs' },
    { separator: true },
    { action: 'toggleComment', label: 'Toggle Comment', shortcut: 'Ctrl+/' },
    { action: 'indentMore', label: 'Increase Indent', shortcut: 'Tab' },
    { action: 'indentLess', label: 'Decrease Indent', shortcut: 'Shift+Tab' },
    { separator: true },
    { action: 'eolLf', label: 'EOL → Unix (LF)' },
    { action: 'eolCrlf', label: 'EOL → Windows (CRLF)' },
    { action: 'eolCr', label: 'EOL → Mac (CR)' },
  ];

  /** Notepad++-style View menu with checkable render options. */
  get viewMenuItems(): MenuItem[] {
    return [
      { action: 'toggleWrap', label: 'Word Wrap', checked: this.wordWrap },
      { action: 'toggleWhitespace', label: 'Show Whitespace', checked: this.showWhitespace },
      {
        action: 'toggleTrailingWhitespace',
        label: 'Highlight Trailing Whitespace',
        checked: this.highlightTrailingWhitespace,
      },
      {
        action: 'toggleActiveLine',
        label: 'Highlight Active Line',
        checked: this.highlightActiveLine,
      },
      { separator: true },
      { action: 'zoomIn', label: 'Zoom In', shortcut: 'Ctrl++' },
      { action: 'zoomOut', label: 'Zoom Out', shortcut: 'Ctrl+−' },
      { action: 'zoomReset', label: 'Restore Default Zoom' },
      { separator: true },
      { action: 'toggleTheme', label: 'Dark Theme', checked: this.theme === 'dark' },
    ];
  }

  onGoto(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const input = form.querySelector('input') as HTMLInputElement | null;
    const line = Number(input?.value);
    if (Number.isFinite(line) && line >= 1) {
      this.gotoLine.emit(Math.floor(line));
    }
  }
}
