# Feature 09 — Mark (Notepad++ "Search → Mark")

**Phase:** 4 (Search & Navigation) — parity with Notepad++'s **Search → Mark**
**Status:** ✅ Delivered

Persistent styled highlighting of **every** occurrence of a term, independent of
the transient find selection. Driven from the Find & Replace bar with the same
Match Case / Whole Word / Regex options.

---

## 1. Overview

Notepad++'s **Mark** highlights all matches of a term and keeps them highlighted
until cleared — useful for visually tracking an identifier while editing. This
differs from **Find**, whose highlight follows the active query and clears when
you search for something else.

| Capability | Notepad++ equivalent |
| --- | --- |
| Mark all occurrences of the find term | Search → Mark (Mark All) |
| Mark the word at the caret / selection | Mark (from selection) |
| Clear marks | "Clear all marks" |
| Match Case / Whole Word / Regex | Mark dialog options |

Surfaced as **⭐ Mark** and **Clear** buttons on the find row of the Replace bar.

---

## 2. Architecture

```
 Replace bar  ── (mark) / (clearMark) ──►  AppComponent.onMark / onClearMark
        │  uses the last ReplaceQuery (term + options)
        ▼
 TextEditorComponent.setMark(term, options) / clearMark()
        │  effects: setMarkEffect
        ▼
 editor/mark.ts:  findMatches(text, term, options)   ← pure, unit-tested
                  markField (StateField<MarkState>)   → DecorationSet
                  markHighlighter() extension + theme
```

### Pure match finder

`findMatches(text, term, options)` builds a single `RegExp` (escaping literals,
wrapping with `(?<!\w)…(?!\w)` for whole-word, honoring case/regex) and returns
all non-overlapping spans. It guards against invalid regexes (returns `[]`) and
zero-width matches (advances `lastIndex` to avoid infinite loops). Being pure, it
is fully unit-tested without a DOM.

### StateField + recompute policy

`markField` holds the active term, its options, and the computed
`DecorationSet`. It recomputes only when:

1. a `setMarkEffect` sets/replaces/clears the term, or
2. the document changes **and** a term is active.

Otherwise the existing decorations are returned unchanged — cheap on every
keystroke. The field is surfaced to the view with
`provide: EditorView.decorations.from(field, s => s.decorations)`.

### Why not reuse `@codemirror/search`'s highlight

The find highlight (`highlightSelectionMatches` / search query) is tied to the
active query and styling, and clears when the query changes. Mark must persist
independently, so it owns its own field, decoration class, and theme.

---

## 3. Files

| File | Role |
| --- | --- |
| `src/app/editor/mark.ts` | `findMatches`, `markField`, `markHighlighter()`, `setMarkEffect`, `markCount`, types |
| `src/app/editor/mark.spec.ts` | 8 unit tests for `findMatches` |
| `src/app/components/text-editor/text-editor.component.ts` | `setMark`, `markSelection`, `clearMark`; registers `markHighlighter()` |
| `src/app/components/replace-panel/replace-panel.component.ts` | ⭐ Mark / Clear buttons + `mark`/`clearMark` outputs |
| `src/app/app.component.ts` | `onMark` / `onClearMark`; tracks `lastReplaceQuery` |
| `src/app/app.component.html` | Wires the new outputs |

---

## 4. Public API (mark.ts)

| Export | Kind | Description |
| --- | --- | --- |
| `findMatches(text, term, options?)` | pure | All match spans (`{from,to}[]`) |
| `markHighlighter()` | `() => Extension` | The mark extension bundle |
| `setMarkEffect` | `StateEffect<{term,options}\|null>` | Set/replace/clear the mark |
| `markCount(state)` | function | Number of marked occurrences |
| `MatchSpan`, `MarkOptions` | types | Span and option shapes |

### `TextEditorComponent`

| Method | Description |
| --- | --- |
| `setMark(term, options?)` | Mark all occurrences; returns the count |
| `markSelection(options?)` | Mark the selection (or word at caret) |
| `clearMark()` | Remove all mark highlighting |

---

## 5. Key decisions

- **Pure `findMatches`** keeps the matching semantics (escape, whole-word,
  regex, invalid-regex, zero-width) verifiable in isolation.
- **Recompute only on term change or doc edit** avoids per-keystroke rescans
  when nothing relevant changed.
- **Separate field/decoration/theme** so Mark persists independently of Find.
- **Reused the Replace bar** (term + options already there) instead of a new
  dialog.

---

## 6. Testing

- **Unit:** 8 Jasmine cases (empty, case-insensitive/-sensitive, whole-word,
  literal vs regex, invalid regex, zero-width). Total suite: **39 passing**.
- **Build:** `npm run build` clean.
- **Manual:** [../MANUAL_TESTING.md](../MANUAL_TESTING.md) §2.13.

Run the unit tests manually:

```bash
npm run test:run     # single headless run (Angular/Jasmine)
npm run test:watch   # interactive watch mode
npm run test:rust    # Rust backend unit tests
```

---

## 7. Future work

- 1st–5th mark styles (Notepad++ multi-color marking) with jump-up/down.
- "Copy styled text" of marked occurrences.
- Mark in the GB-log viewer (backend-driven) for read-only files.
