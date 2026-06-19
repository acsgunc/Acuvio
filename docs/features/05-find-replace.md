# Feature 05 — Find & Replace (Notepad++ "Search" menu)

**Phase:** 4 (Search & Navigation) — parity with Notepad++'s **Search → Replace**
**Status:** ✅ Delivered

In-editor Find & Replace for editable documents: find next/previous, replace,
replace-all, with Match Case / Whole Word / Regular Expression options and a
live match count.

---

## 1. Overview

The GB-scale **log viewer** already had backend-powered search/filter (memory
mapped, regex over the whole file). That path is read-only and optimized for
huge files. Editable documents need a different model: the buffer lives entirely
in CodeMirror, so Find & Replace is implemented client-side with
`@codemirror/search` operating on the in-memory document.

| Capability | Notepad++ equivalent |
| --- | --- |
| Find Next / Previous (wrapping) | `IDM_SEARCH_FINDNEXT` / `IDM_SEARCH_FINDPREV` |
| Replace current match | `IDM_SEARCH_REPLACE` |
| Replace All | `IDM_SEARCH_REPLACEALL` |
| Match Case | "Match case" checkbox |
| Whole Word | "Match whole word only" |
| Regular Expression | "Regular expression" search mode |
| Live match count | Notepad++ "Count" |

---

## 2. Architecture

```
 Toolbar "Replace" button / Ctrl+H / Ctrl+F (edit mode)
        │
        ▼
 AppComponent.replaceOpen (signal) ──> renders <app-replace-panel>
        │                                        │ emits ReplaceQuery + actions
        │                                        ▼
        └──────────────► AppComponent handlers ──► TextEditorComponent
                                                     setSearch / findNext /
                                                     findPrevious / replaceNext /
                                                     replaceAll / countMatches
                                                          │
                                                  @codemirror/search
                                              (SearchQuery, setSearchQuery,
                                               findNext, findPrevious,
                                               replaceNext, replaceAll)
```

Three layers, each with a single responsibility:

1. **`ReplacePanelComponent`** — presentational. Renders the find row, the
   replace row, the option toggles, and the navigation/replace buttons. Emits a
   `ReplaceQuery` whenever the inputs change and discrete events for each action.
   It holds no editor state.
2. **`AppComponent`** — orchestration. Owns the `replaceOpen` signal, the
   keyboard shortcuts, and routes panel events to the active editor. It also
   pushes the current match count back into the panel.
3. **`TextEditorComponent`** — editor adapter. Translates a `ReplaceQuery` into a
   CodeMirror `SearchQuery` and drives `@codemirror/search`.

### Why `@codemirror/search` instead of the backend search

| | Viewer search (Rust) | Editor Find/Replace (CM) |
| --- | --- | --- |
| Data location | memory-mapped file on disk | in-memory CM document |
| Mutability | read-only | editable (replace must mutate) |
| File size | up to many GB | ≤ 50 MiB (edit cap) |
| Replace support | n/a | required |

Replacing text requires mutating the live, possibly-unsaved buffer, so the
backend (which only sees the on-disk file) is the wrong tool. `@codemirror/search`
operates directly on the editor state and integrates with undo/redo.

---

## 3. Files

| File | Role |
| --- | --- |
| `src/app/components/replace-panel/replace-panel.component.ts` | Presentational Find & Replace bar; defines `ReplaceQuery` |
| `src/app/components/text-editor/text-editor.component.ts` | `setSearch`, `findNext`, `findPrevious`, `replaceNext`, `replaceAll`, `countMatches` |
| `src/app/components/toolbar/toolbar.component.ts` | "Replace" button + `toggleReplace` output |
| `src/app/app.component.ts` | `replaceOpen` signal, Ctrl+H/Ctrl+F shortcuts, panel event handlers |
| `src/app/app.component.html` | Conditional `<app-replace-panel>` + toolbar binding |

---

## 4. Public API

### `ReplaceQuery` (replace-panel.component.ts)

```ts
interface ReplaceQuery {
  search: string;
  replace: string;
  caseSensitive: boolean;
  regexp: boolean;
  wholeWord: boolean;
}
```

### `ReplacePanelComponent`

| Member | Kind | Description |
| --- | --- | --- |
| `matchCount` | `@Input()` | Number shown in the panel ("N matches") |
| `query` | `@Output<ReplaceQuery>` | Fires when any field/toggle changes |
| `findNext` / `findPrevious` | `@Output<void>` | Navigation requests |
| `replaceNext` / `replaceAll` | `@Output<void>` | Replace requests |
| `close` | `@Output<void>` | Close the bar |
| `focusFind()` | method | Focus the find input (called on open) |

### `TextEditorComponent` (find/replace surface)

| Method | Description |
| --- | --- |
| `setSearch(opts: ReplaceQuery)` | Builds a CM `SearchQuery` and applies it via `setSearchQuery` |
| `findNext()` / `findPrevious()` | Move selection to the next/previous match (wraps) |
| `replaceNext()` | Replace the current match and advance |
| `replaceAll()` | Replace every match in one transaction (single undo step) |
| `countMatches(): number` | Count matches for the current query (drives the panel badge) |

---

## 5. Key decisions

- **Whole-word** is implemented by wrapping the search term in `\b…\b` when the
  regex option is off, and is honored by CM's own `wholeWord` flag when regex is
  on — matching Notepad++'s behavior where "whole word" composes with the mode.
- **Replace All is one transaction**, so a single Ctrl+Z reverts the whole
  operation, consistent with the edit-operations increment.
- **Two entry points**: `Ctrl+H` (replace) and `Ctrl+F` (find) both open the same
  bar in edit mode; in viewer mode `Ctrl+F`/search routes to the backend search
  panel instead. The handler checks `activeTab().mode` to disambiguate.
- **Presentational/orchestration split** keeps the panel reusable and unit-test
  friendly (no editor coupling).

---

## 6. Testing

- **Build:** `npm run build` — compiles clean; `@codemirror/search` resolves
  (transitive dep of `codemirror`/`basicSetup`, already installed).
- **Manual:** see [../MANUAL_TESTING.md](../MANUAL_TESTING.md) §2.6 — covers find,
  navigation, case/word/regex toggles, replace, replace-all, and close.
- Fixtures: any editable `sample.*` file from `npm run fixtures`.

---

## 7. Future work

- Incremental "search as you type" highlight of all matches in the editor.
- "Find in Files" across an opened folder/workspace (Notepad++ `Find in Files`).
- Persistent "Mark" highlighting and bookmark integration (Search menu).
- Count dialog / "Replace in selection only" scope.
- Shared regex semantics between viewer (Rust regex) and editor (JS regex).
