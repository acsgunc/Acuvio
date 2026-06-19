# Feature 01 — View Preferences

**Phases:** 2 (Core Editor), 9 (UI), 12 (Configuration)
**Status:** ✅ Delivered

Word wrap, zoom, light/dark theme, go-to-line, and a persisted settings store.

---

## 1. Overview

This increment adds user-controllable view preferences that apply to the
read-only log viewer (and later the editable document view), plus the first
slice of the Phase 12 configuration system to persist them.

| Capability | Behavior |
| --- | --- |
| **Word Wrap** | Toggle soft-wrapping of long lines instead of horizontal scroll. |
| **Zoom** | Increase / decrease / reset the editor font size (8–32 px). |
| **Theme** | Switch between a dark and a light palette. |
| **Go to Line** | Jump to a 1-based absolute line via a toolbar input. |
| **Persistence** | All preferences survive reloads via `localStorage`. |

---

## 2. Architecture

```
Toolbar ──(events)──> AppComponent ──> SettingsService (signals + localStorage)
                                   │                  │
                                   │                  └─ applies data-theme on <html>
                                   └──> LogViewer (Compartment reconfigure: wrap, font)
```

- **`SettingsService`** is the single source of truth. It exposes reactive
  signals (`theme`, `wordWrap`, `fontSize`) consumed directly by templates and
  persists to `localStorage` on every change.
- The **theme** is applied by setting `data-theme="light|dark"` on the document
  root; CSS variables in `styles.scss` define both palettes. No component needs
  theme-specific code.
- **Word wrap** and **font size** are applied to CodeMirror via dedicated
  `Compartment`s so they can be reconfigured at runtime without rebuilding the
  editor state.

---

## 3. Files

| File | Role |
| --- | --- |
| [`src/app/services/settings.service.ts`](../../src/app/services/settings.service.ts) | Reactive settings store + `localStorage` persistence; applies theme. |
| [`src/app/components/toolbar/toolbar.component.ts`](../../src/app/components/toolbar/toolbar.component.ts) | Wrap / zoom / theme / go-to-line controls and outputs. |
| [`src/app/components/log-viewer/log-viewer.component.ts`](../../src/app/components/log-viewer/log-viewer.component.ts) | `wordWrap` / `fontSize` inputs → CodeMirror compartments. |
| [`src/app/app.component.ts`](../../src/app/app.component.ts) | `onGotoLine`, injects `SettingsService`. |
| [`src/app/app.component.html`](../../src/app/app.component.html) | Wires toolbar ↔ settings ↔ viewer. |
| [`src/styles.scss`](../../src/styles.scss) | Dark + light CSS-variable palettes; theme-aware syntax colors. |

---

## 4. Public API

### `SettingsService`

```ts
readonly theme:    Signal<'dark' | 'light'>;
readonly wordWrap: Signal<boolean>;
readonly fontSize: Signal<number>;   // clamped 8..32

toggleTheme(): void;
toggleWordWrap(): void;
zoomIn(): void;
zoomOut(): void;
resetZoom(): void;
```

### Persistence format (`localStorage` key `acuvio.settings.v1`)

```json
{ "theme": "dark", "wordWrap": false, "fontSize": 13 }
```

Corrupt or missing values fall back to defaults; out-of-range font sizes are
clamped on load.

---

## 5. Key Decisions & Trade-offs

- **CSS variables + `data-theme`** over per-component theme logic: a single
  attribute flips the whole UI, and the CodeMirror highlight colors reference
  the same variables so they adapt automatically.
- **`localStorage` over a backend config file** for this slice: view
  preferences are frontend-only and must apply instantly without a Tauri
  round-trip. Migrating to an app-config-dir JSON file is planned for the full
  Phase 12 settings system; the `v1` key suffix leaves room for migration.
- **Compartments** for wrap/font so toggling never discards editor state
  (scroll position, selection, highlights).

---

## 6. Testing

- `npm run build` — type-checks and AOT-compiles all bindings.
- Manual: toggle each control and reload to confirm persistence; verify light
  theme recolors severity highlighting.

---

## 7. Future Work

- Move persistence to a JSON file under the OS app-config directory (Phase 12).
- Import / export settings.
- Minimap and per-document (rather than global) wrap/zoom overrides.
