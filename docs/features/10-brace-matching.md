# Feature 10 — Brace Matching (Notepad++ "Search → Go to Matching Brace")

**Phase:** 4 (Search & Navigation) — parity with Notepad++'s **Search → Go to
Matching Brace / Select All between Matching Braces**
**Status:** ✅ Delivered

Jump the caret to the bracket matching the one beside the caret, or select the
whole bracket-enclosed range (inclusive of both brackets).

---

## 1. Overview

| Capability | Notepad++ equivalent | Shortcut |
| --- | --- | --- |
| Go to Matching Brace | `IDM_SEARCH_GOTOMATCHINGBRACE` | Ctrl+B |
| Select to Matching Brace | `IDM_SEARCH_SELECTMATCHINGBRACES` | Ctrl+Shift+B |

`basicSetup` already renders the live matched-bracket highlight; this increment
adds the **navigation** commands on top, surfaced in the **Search** dropdown.

---

## 2. Architecture

```
 Search menu / Ctrl+B / Ctrl+Shift+B
        │  action id
        ▼
 AppComponent.onEditAction ──► TextEditorComponent.goToMatchingBrace / selectToMatchingBrace
        │                                   │
        │                       editor/brace-match.ts: findMatchingBracket(state, pos)
        ▼                                   │  (wraps @codemirror/language matchBrackets)
   dispatch selection + scrollIntoView ◄────┘
```

### Pure resolver

`findMatchingBracket(state, pos)` is a thin, testable wrapper over CodeMirror's
`matchBrackets`. A caret can touch a bracket on either side, so it probes:

1. a bracket starting **at** `pos` scanning forward,
2. a bracket ending **at** `pos` scanning backward,
3. a bracket at `pos - 1` scanning forward (caret just past an opener).

It returns a `BracketPair` (`bracketFrom/To`, `matchFrom/To`) only when the
result is positively `matched` and has an `end`, so unbalanced brackets report
`null`. Keeping the resolver pure lets the wrap/probe logic be unit-tested with a
real `EditorState` but no DOM.

### Component commands

- `goToMatchingBrace()` moves the caret just inside the matching bracket (the
  Notepad++ landing spot) and scrolls it into view.
- `selectToMatchingBrace()` selects `[min(from), max(to)]` across the pair,
  i.e. both brackets and everything between.

Both return `false` (no-op) when there's no matching pair, so keybindings fall
through cleanly.

---

## 3. Files

| File | Role |
| --- | --- |
| `src/app/editor/brace-match.ts` | `findMatchingBracket`, `BracketPair` |
| `src/app/editor/brace-match.spec.ts` | 5 unit tests (open/close/nested/none/unbalanced) |
| `src/app/components/text-editor/text-editor.component.ts` | `goToMatchingBrace`, `selectToMatchingBrace`; Ctrl+B / Ctrl+Shift+B keymap |
| `src/app/components/toolbar/toolbar.component.ts` | Search dropdown items |
| `src/app/app.component.ts` | Routes the two actions |

---

## 4. Public API (brace-match.ts)

| Export | Kind | Description |
| --- | --- | --- |
| `findMatchingBracket(state, pos)` | function | Resolve the bracket pair around `pos`, or `null` |
| `BracketPair` | interface | `{ bracketFrom, bracketTo, matchFrom, matchTo }` |

### `TextEditorComponent`

| Method | Description |
| --- | --- |
| `goToMatchingBrace(): boolean` | Move caret to the matching bracket |
| `selectToMatchingBrace(): boolean` | Select the bracket-enclosed range |

---

## 5. Key decisions

- **Reused `matchBrackets`** from `@codemirror/language` rather than re-scanning
  text — it already understands the active language's bracket pairs.
- **Multi-probe** so the caret matches whether it's before or after a bracket,
  consistent with Notepad++ behavior.
- **Pure resolver + thin commands** keeps logic tested and the component minimal.

---

## 6. Testing

- **Unit:** 5 Jasmine cases. Total suite: **44 passing**.
- **Build:** `npm run build` clean.
- **Manual:** [../MANUAL_TESTING.md](../MANUAL_TESTING.md) §2.14.

---

## 7. Future work

- Highlight the enclosing scope (e.g. dim outside the braces) like some IDEs.
- "Select between braces" excluding the brackets themselves as a separate command.
