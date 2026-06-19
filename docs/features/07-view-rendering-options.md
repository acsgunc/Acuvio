# Feature 07 — View Rendering Options (Notepad++ "View" menu)

**Phase:** 2 / 9 (Display & UX) — parity with Notepad++'s **View → Show Symbol**
and zoom/wrap/theme controls
**Status:** ✅ Delivered

A **View** dropdown menu with checkable rendering options: Word Wrap, Show
Whitespace, Highlight Trailing Whitespace, Highlight Active Line, plus zoom and
theme — all persisted across sessions.

---

## 1. Overview

Notepad++'s **View** menu exposes display toggles that don't change file content.
This increment surfaces a coherent subset through a checkable dropdown and wires
them to the editor's live reconfiguration.

| View item | Notepad++ equivalent | Persisted |
| --- | --- | --- |
| Word Wrap | View → Word wrap | ✅ |
| Show Whitespace | View → Show Symbol → Show White Space and TAB | ✅ |
| Highlight Trailing Whitespace | (related to Show Symbol) | ✅ |
| Highlight Active Line | active-line highlight | ✅ |
| Zoom In / Out / Restore | View → Zoom | ✅ |
| Dark Theme | global styler / dark mode | ✅ |

---

## 2. Architecture

```
 Toolbar "View" dropdown (checkable MenuItems)
        │  emits action id (e.g. "toggleWhitespace")
        ▼
 AppComponent.onViewAction(id) ──► SettingsService.toggle*()  (persists)
        │                                   │ signals update
        ▼                                   ▼
 editorViewOptions (computed) ─────► <app-text-editor [viewOptions]>
                                              │
                                  viewOptionsCompartment.reconfigure()
                                              │
                              @codemirror/view highlightWhitespace /
                              highlightTrailingWhitespace + theme override
```

Three layers, consistent with prior increments:

1. **`SettingsService`** owns the booleans as signals, persists them to
   `localStorage` (key `acuvio.settings.v1`), and is the single source of truth.
2. **`AppComponent`** exposes a `computed` `editorViewOptions` (a
   `ViewRenderOptions`) and routes menu actions to the settings toggles.
3. **`TextEditorComponent`** maps `ViewRenderOptions` to CodeMirror extensions in
   a dedicated `Compartment` so changes apply live without rebuilding the view.

### Disabling the active-line highlight

`basicSetup` always includes `highlightActiveLine()`/`highlightActiveLineGutter()`,
and a `Compartment` can only *add* extensions, not remove ones baked into
`basicSetup`. So "Highlight Active Line = off" is implemented with a **theme
override** that makes `.cm-activeLine` / `.cm-activeLineGutter` transparent —
reliable and version-independent. Show Whitespace and Trailing Whitespace are
genuinely additive (`highlightWhitespace()`, `highlightTrailingWhitespace()`).

### Checkable menu items

`MenuItem` gained an optional `checked?: boolean`. When defined, the dropdown
renders a ✓ column; `undefined` keeps plain action items unaffected. The View
menu rebuilds its items from the current settings via a getter, so checkmarks
always reflect live state.

---

## 3. Files

| File | Change |
| --- | --- |
| `src/app/services/settings.service.ts` | + `showWhitespace`, `highlightActiveLine`, `highlightTrailingWhitespace` signals, toggles, load/save |
| `src/app/components/text-editor/text-editor.component.ts` | + `viewOptions` input, `viewOptionsCompartment`, `makeViewOptions`, `ViewRenderOptions` |
| `src/app/components/dropdown-menu/dropdown-menu.component.ts` | + `checked` MenuItem field + ✓ column |
| `src/app/components/toolbar/toolbar.component.ts` | + View dropdown, `viewMenuItems`, `viewAction`, toggle-state inputs |
| `src/app/app.component.ts` | + `editorViewOptions` computed, `onViewAction` |
| `src/app/app.component.html` | wire toolbar inputs/`viewAction` + editor `viewOptions` |

---

## 4. Public API

### `ViewRenderOptions` (text-editor.component.ts)

```ts
interface ViewRenderOptions {
  showWhitespace: boolean;
  highlightActiveLine: boolean;
  highlightTrailingWhitespace: boolean;
}
```

### `SettingsService` (new members)

| Member | Description |
| --- | --- |
| `showWhitespace` / `highlightActiveLine` / `highlightTrailingWhitespace` | `Signal<boolean>` state |
| `toggleShowWhitespace()` / `toggleHighlightActiveLine()` / `toggleHighlightTrailingWhitespace()` | Flip + persist |

---

## 5. Key decisions

- **Settings as source of truth** keeps view state persistent and lets both the
  menu (checkmarks) and the editor (extensions) derive from one place.
- **Theme override to disable active line** avoids restructuring `basicSetup`.
- **Compartment reconfiguration** means toggles are instant and allocation-light.
- **Reused `DropdownMenuComponent`** — only a `checked` field was added, no new
  component, keeping menus declarative.

---

## 6. Testing

- **Build:** `npm run build` clean; 25 existing unit tests still green.
- **Manual:** [../MANUAL_TESTING.md](../MANUAL_TESTING.md) §2.11 — toggle each
  option, confirm live effect and persistence across reload.

---

## 7. Future work

- Show EOL symbols (CR/LF glyphs) — needs a custom decoration; CM6 has no
  built-in.
- Indent guides (consider `@replit/codemirror-indentation-markers`).
- Full-screen / distraction-free modes, document map (minimap).
- Per-view (not just global) toggles when multi-view/split lands.
