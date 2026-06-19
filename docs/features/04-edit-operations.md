# Feature 04 — Edit Operations (Notepad++ "Edit" menu)

**Phase:** 3 (Editing Features) — with parity to Notepad++'s **Edit** menu
**Status:** ✅ Delivered

Line operations, case conversion, blank/whitespace operations, comment toggle,
indentation, and EOL conversion for editable documents, surfaced through a
reusable dropdown **Edit** menu.

---

## 1. Overview

To reach Notepad++ parity for everyday editing, this increment adds the bulk of
the Notepad++ **Edit** menu, operating on the in-memory editable buffer.

| Group | Operations |
| --- | --- |
| **Line ops** | Duplicate, Move Up/Down, Delete, Join |
| **Line sorting/dedup** | Sort Ascending/Descending, Reverse, Remove Duplicate Lines, Remove Empty Lines |
| **Case** | UPPERCASE, lowercase, Proper Case, Sentence case, iNVERT cASE |
| **Blank ops** | Trim Trailing/Leading whitespace, Tabs→Spaces, Spaces→Tabs |
| **Code** | Toggle Comment, Increase/Decrease Indent |
| **EOL** | Convert to LF / CRLF / CR (applied on save) |

These map directly to Notepad++ commands found in `menuCmdID.h`
(`IDM_EDIT_*`, e.g. `IDM_EDIT_DUP_LINE`, `IDM_EDIT_SORTLINES_*`,
`IDM_EDIT_UPPERCASE`, `IDM_EDIT_TRIMTRAILING`, `IDM_EDIT_LINE_*`).

---

## 2. Architecture

```
 Toolbar (DropdownMenuComponent "Edit")
        │  emits action id (e.g. "sortAscending")
        ▼
 AppComponent.onEditAction(id)  ── routes ──┐
        │                                    │
        ├─ CodeMirror built-ins ──> TextEditorComponent.{duplicateLine,…}
        │                                    │
        └─ custom command module ──> TextEditorComponent.runCommand(cmd)
                                              │
                                  editor/edit-commands.ts (pure StateCommands)
```

Two sources of commands, behind one uniform `runCommand`/method surface:

1. **CodeMirror `@codemirror/commands`** for operations it already provides
   (`copyLineDown`, `moveLineUp/Down`, `deleteLine`, `toggleComment`,
   `indentMore/Less`).
2. **`editor/edit-commands.ts`** — a custom, dependency-light module of pure
   `StateCommand`s for operations CodeMirror lacks (sort, dedup, reverse, join,
   case conversion, trim, tab/space conversion).

### Why a separate command module

Each command is a pure `({state, dispatch}) => boolean`, identical to
CodeMirror's own command contract. This makes them:

- **Unit-testable** without a DOM or Angular (see §6),
- **Reusable** from menus, a future command palette, or keymaps,
- **Composable** with CodeMirror's transaction/selection system.

### Selection semantics

- Line-oriented commands act on the lines spanned by the selection, or the
  **whole document** when the selection is a single empty caret.
- Character-oriented (case) commands act on the **selected text** and are a
  no-op when nothing is selected — matching Notepad++ behavior.
- `replaceLines` reselects the rewritten block so repeated operations chain.

---

## 3. Files

| File | Role |
| --- | --- |
| [`src/app/editor/edit-commands.ts`](../../src/app/editor/edit-commands.ts) | Pure `StateCommand`s: sort, dedup, reverse, join, case, trim, tab/space. |
| [`src/app/editor/edit-commands.spec.ts`](../../src/app/editor/edit-commands.spec.ts) | Jasmine unit tests (14 cases). |
| [`src/app/components/dropdown-menu/dropdown-menu.component.ts`](../../src/app/components/dropdown-menu/dropdown-menu.component.ts) | Reusable dropdown menu (also for future View/etc. menus). |
| [`src/app/components/text-editor/text-editor.component.ts`](../../src/app/components/text-editor/text-editor.component.ts) | `runCommand` + built-in line ops + Notepad++ keybindings. |
| [`src/app/components/toolbar/toolbar.component.ts`](../../src/app/components/toolbar/toolbar.component.ts) | Edit menu item definitions + `editAction` output. |
| [`src/app/app.component.ts`](../../src/app/app.component.ts) | `onEditAction` dispatcher + EOL switch. |

---

## 4. Public API

### `editor/edit-commands.ts`

```ts
// Line operations
sortLinesAscending, sortLinesDescending, reverseLines,
removeDuplicateLines, removeEmptyLines, joinLines: StateCommand;
// Case conversion
toUpperCase, toLowerCase, toProperCase, toSentenceCase, invertCase: StateCommand;
// Blank operations
trimTrailingWhitespace, trimLeadingWhitespace: StateCommand;
tabsToSpaces(size = 4): StateCommand;
spacesToTabs(size = 4): StateCommand;
```

### `TextEditorComponent`

```ts
runCommand(command: Command): boolean;     // run any CM/custom command
duplicateLine(); moveLineUp(); moveLineDown(); deleteLine();
toggleComment(); indentMore(); indentLess();
```

### `DropdownMenuComponent`

```ts
@Input() label: string;
@Input() items: MenuItem[];     // { action?, label?, shortcut?, separator?, disabled? }
@Input() disabled: boolean;
@Output() action: EventEmitter<string>;
```

### Keyboard shortcuts (Notepad++ parity, bound at high precedence)

| Shortcut | Action |
| --- | --- |
| `Ctrl+D` | Duplicate line |
| `Ctrl+Shift+K` | Delete line |
| `Ctrl+/` | Toggle comment |
| `Alt+↑ / Alt+↓` | Move line up/down (CodeMirror default) |
| `Tab / Shift+Tab` | Increase/decrease indent |

---

## 5. Key Decisions & Trade-offs

- **`Ctrl+D` = Duplicate** (Notepad++) overrides CodeMirror's default
  `selectNextOccurrence`. Multi-cursor-by-word is still available via Ctrl+Click
  and Alt+drag; matching Notepad++ muscle memory was prioritized.
- **EOL conversion is deferred to save**: changing the EOL updates the tab's
  `eol` and marks it dirty; `save_text` then writes the chosen ending. This
  avoids rewriting the whole buffer in the editor just to change invisible
  characters.
- **Reusable dropdown** rather than a bespoke Edit component, so View / Encoding
  / other Notepad++ menus can be added declaratively later.
- **Whole-doc fallback** for line ops with no selection matches the common
  "sort the file" expectation while still honoring an explicit selection.

---

## 6. Testing

Jasmine unit tests in `edit-commands.spec.ts`, run with `npm test`
(zoneless Karma, ChromeHeadless): **14 passing**, covering sort asc/desc,
dedup, remove-empty, reverse, join, all case conversions, no-op-without-selection,
trim, and tab/space conversion.

> Test infra note: the Karma target was switched to zoneless
> (`polyfills: []` in `angular.json`) to match the application's zoneless
> runtime; this enabled the project's first unit tests.

---

## 7. Future Work

- Column/rectangular editor (insert sequences) — Notepad++ Column Editor.
- Sort by integer/decimal/length; sort ignoring case.
- Insert date/time, copy file path/name to clipboard (Edit ▸ Insert/Copy).
- Surface these in a command palette (Phase 9) reusing the same command module.
