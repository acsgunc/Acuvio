# Feature 13 — Find / Replace / Mark Dialog (Notepad++ "Search → Find", Ctrl+F)

**Phase:** 4 (Search & Navigation) — full parity with the Notepad++ **Find /
Replace / Mark** dialog opened by **Ctrl+F** (and **Ctrl+H** for Replace)
**Status:** ✅ Delivered

A complete, tabbed Find dialog for editable documents covering Notepad++'s
entire single-document option matrix: every search mode, every match option,
direction/scope, Count, Find All with a navigable results list, Replace /
Replace All, and a Mark tab.

---

## 1. Overview — feature checklist

Cross-referenced against Notepad++
`PowerEditor/src/ScintillaComponent/FindReplaceDlg.{h,cpp,rc}`.

### Tabs
| Tab | Status |
| --- | --- |
| **Find** | ✅ |
| **Replace** | ✅ |
| **Mark** | ✅ |
| Find in Files / Find in Projects | ➖ out of scope (no multi-file workspace yet) |

### Find-what / Replace-with
| Element | Status |
| --- | --- |
| Find what (combo with history) | ✅ history via `<datalist>` |
| Replace with (combo with history) | ✅ |
| Seed from current selection on open | ✅ |

### Match options
| Option | Status |
| --- | --- |
| Match whole word only | ✅ (literal modes; disabled for regex, as in N++) |
| Match case | ✅ |
| Wrap around | ✅ |
| Backward direction (Find tab) | ✅ |
| In selection | ✅ (scope captured from the editor selection) |

### Search mode (radio group)
| Mode | Status |
| --- | --- |
| Normal (literal) | ✅ |
| Extended (`\n \r \t \0 \a \b \f \v \xHH \uHHHH \oOOO \dDDD \\`) | ✅ |
| Regular expression | ✅ |
| `.` matches newline (regex sub-option) | ✅ (dotAll, disabled unless regex) |

### Find-tab buttons
| Button | Status |
| --- | --- |
| Find Next | ✅ |
| Find Previous (N++ "2 buttons mode") | ✅ (always shown) |
| Count | ✅ status line |
| Find All in Current Document | ✅ navigable results list |
| Find All in All Opened Documents | ➖ out of scope |

### Replace-tab buttons
| Button | Status |
| --- | --- |
| Find Next | ✅ |
| Replace | ✅ (replaces current match, then advances) |
| Replace All | ✅ single undoable change |
| Replace All in All Opened Documents | ➖ out of scope |

### Mark-tab
| Element | Status |
| --- | --- |
| Style selector (1–5 colors) | ✅ |
| Bookmark line | ✅ bookmarks every matching line |
| Purge for each search | ✅ clears marks before re-marking |
| Mark All | ✅ |
| Clear All Marks | ✅ |

### Feedback & keyboard
| Item | Status |
| --- | --- |
| "X matches" / "Replaced X occurrences" / "Marked X occurrences" | ✅ status line |
| "Can't find …" error styling | ✅ |
| "Match X of Y (wrapped)" navigation feedback | ✅ |
| Enter = default action (tab-aware) | ✅ |
| Shift+Enter = Find Previous | ✅ |
| Esc = Close | ✅ |
| F3 / Shift+F3 = repeat find next/previous | ✅ global (edit mode) |
| Ctrl+F = Find tab, Ctrl+H = Replace tab | ✅ |

---

## 2. Architecture

```
 Ctrl+F / Ctrl+H / Replace button
        │  openFind(tab)
        ▼
 AppComponent: findTab/findSeed signals + findNonce (bump to (re)apply)
        │  [requestedTab] [seed] [openNonce]
        ▼
 FindDialogComponent (presentation + option state)
        │  (request)=FindRequest          (jumpTo)=FindResultRow
        ▼                                        │
 AppComponent.onFindRequest ──► TextEditorComponent engine methods
        │                          findStep / countWith / findAllWith /
        │                          replaceCurrent / replaceAllWith /
        │                          setMark / bookmarkMatchingLines
        ▼                                        │
 status / results fed back to dialog ◄───────────┘
                       │
   editor/find-engine.ts (pure): compileQuery, findAllMatches,
       nextMatchIndex, buildReplacement, unescapeExtended/Replacement
```

### Pure engine (`editor/find-engine.ts`)

All matching/navigation/replacement logic is side-effect free and unit-tested:

- **`compileQuery(query)`** → a global `RegExp` (or `null`). Builds the pattern
  from the search mode, applies whole-word boundaries for literal modes, and
  sets flags (`g`, `m`, `i` for case-insensitive, `s` for ". matches newline").
- **`unescapeExtended(s)`** interprets the full Notepad++ extended escape set.
- **`unescapeReplacement(s)`** interprets only `\n \r \t \\` in replacements,
  leaving `$1`/`\1` group references intact.
- **`findAllMatches(text, query)`** → ordered, non-overlapping matches (skips
  zero-width).
- **`nextMatchIndex(matches, from, to, {backward, wrapAround})`** resolves the
  next/previous match and reports whether navigation wrapped.
- **`buildReplacement(query, replacement, matched)`** expands the replacement
  per mode (literal / extended / regex group references).

### Editor engine methods (`TextEditorComponent`)

Thin wrappers that apply the pure engine to the live document and an optional
**In selection** scope (`findScope`):

| Method | Role |
| --- | --- |
| `captureFindScope()` / `clearFindScope()` | Manage the "In selection" range |
| `findStep(query, opts)` | Select next/previous match; returns `{found,total,current,wrapped}` |
| `countWith(query)` | Count (scoped) matches |
| `findAllWith(query)` | Build the `FindHit[]` results list |
| `revealRange(from,to)` | Jump to a result row |
| `replaceCurrent(query, repl, wrap)` | Replace the selected match, then advance |
| `replaceAllWith(query, repl)` | Replace all in one undoable change |
| `bookmarkMatchingLines(query)` | Mark-tab "Bookmark line" |
| `selectedText()` / `isDirty()` | Seed text + dirty refresh |

CodeMirror's built-in match highlight is kept loosely in sync via
`pushHighlight`; the authoritative navigation/scope/extended logic lives in the
engine because CM's `SearchQuery` can't express extended/dotAll/scope exactly.

---

## 3. Files

| File | Role |
| --- | --- |
| `src/app/editor/find-engine.ts` | Pure search engine (modes, escapes, nav, replace) |
| `src/app/editor/find-engine.spec.ts` | 27 unit tests |
| `src/app/components/find-dialog/find-dialog.component.ts` | Tabbed Find/Replace/Mark dialog |
| `src/app/components/text-editor/text-editor.component.ts` | Engine methods + `FindHit`/`FindStepResult` types |
| `src/app/app.component.ts` | `openFind`, `onFindRequest`, status/results plumbing, Ctrl+F/H, F3 |
| `src/app/app.component.html` | Dialog wiring (`[requestedTab]`/`[seed]`/`[openNonce]`) |

The old single-row `ReplacePanelComponent` is **removed** — superseded by this
dialog.

---

## 4. Public types

| Type | Where | Description |
| --- | --- | --- |
| `FindQuery` | find-engine | `{ term, mode, caseSensitive, wholeWord, dotMatchesNewline }` |
| `SearchMode` | find-engine | `'normal' \| 'extended' \| 'regex'` |
| `FindMatch` | find-engine | `{ from, to }` |
| `FindRequest` | find-dialog | Action + query + options emitted to the host |
| `FindResultRow` | find-dialog | A Find-All hit row |
| `FindHit` / `FindStepResult` | text-editor | Engine results |

---

## 5. Key decisions

- **Pure engine over CodeMirror search.** N++ parity needs extended escapes,
  dotAll, scoped search and precise "match X of Y / wrapped" feedback that
  `@codemirror/search` doesn't model. The engine owns correctness; CM provides
  the visual highlight only.
- **Input-nonce open protocol.** The dialog lives behind `@if`, so a ViewChild
  method call on open races the render. Driving `requestedTab`/`seed` plus a
  bumped `openNonce` makes (re)opening deterministic via `ngOnChanges`.
- **Whole-word disabled for regex** — matches Notepad++ (users add `\b`).
- **Replace All = one transaction** for single-step undo and correct offset
  handling (built right-to-left implicitly by applying the original spans).

---

## 6. Testing

- **Unit:** 27 new engine cases (escapes, modes, navigation, replacement). Total
  suite: **79 passing**.
- **Build:** `npm run build` clean.
- **Browser smoke test:** verified Count ("5 matches"), Find All (5 hits with
  Ln/Col), tab persistence of the term, and Replace All ("Replaced 5
  occurrences", document rewritten) in the running app.
- **Manual:** [../MANUAL_TESTING.md](../MANUAL_TESTING.md) §2.17.

---

## 7. Future work

- Find in Files / Find in All Opened Documents once a multi-file workspace
  exists.
- Transparency slider and "2 buttons mode" toggle (cosmetic N++ options).
- Incremental highlight-as-you-type counts on every keystroke.
