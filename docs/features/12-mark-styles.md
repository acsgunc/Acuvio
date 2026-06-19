# Feature 12 — Multi-Color Mark Styles (Notepad++ "Search → Mark", 5 styles)

**Phase:** 4 (Search & Navigation) — parity with Notepad++'s **Search → Mark**
five independent highlight styles
**Status:** ✅ Delivered

Extends the single-color Mark from [Feature 09](09-mark.md) to **five
independent style slots**, each with its own term, match options, and color —
so several different terms can stay highlighted at once in distinct colors.

---

## 1. Overview

| Capability | Notepad++ equivalent | Effect |
| --- | --- | --- |
| Mark Selection — Style 1 (yellow) | Mark dialog, 1st style | Highlight all matches in slot 0 |
| Mark Selection — Style 2 (green) | 2nd style | …slot 1 |
| Mark Selection — Style 3 (cyan) | 3rd style | …slot 2 |
| Mark Selection — Style 4 (magenta) | 4th style | …slot 3 |
| Mark Selection — Style 5 (orange) | 5th style | …slot 4 |
| Clear All Marks | `IDM_SEARCH_UNMARKALL` | Clear every style slot |

The Find & Replace bar's **⭐ Mark** button still marks the current find term —
now into **style 1** (slot 0); its **Clear** button clears *all* styles.

---

## 2. Architecture

```
 Replace bar ⭐ Mark / Clear        Search menu (Style 1..5 / Clear All)
        │                                   │  action id
        ▼                                   ▼
 AppComponent.onMark / onClearMark    AppComponent.onEditAction
        │                                   │
        ▼                                   ▼
 TextEditorComponent.setMark(term, opts, styleIndex) /
        markSelection(opts, styleIndex) / clearMark(i) / clearAllMarks()
        │
        ▼
 editor/mark.ts: setMarkEffect({ styleIndex, term, options }) | clearAllMarksEffect
        │
        ▼
 markField (5 MarkSlots) ─ provide ─► five EditorView.decorations facet entries
```

### State model (`editor/mark.ts`)

- `MARK_STYLE_COUNT = 5`.
- `markField` holds `{ slots: MarkSlot[5] }`, each slot `{ term, options,
  decorations }`.
- `setMarkEffect` now carries a `styleIndex`; an empty term clears just that
  slot. `clearAllMarksEffect` resets every slot.
- On `docChanged`, every active slot's decorations are recomputed against the
  new text.
- **`provide`** returns *five separate* `EditorView.decorations.compute` facet
  entries — one per slot. This lets marks in different styles overlap the same
  text (matches within a single style never overlap, so each slot stays a valid
  `RangeSet`).

The pure `findMatches` scanner is unchanged and still shared by all slots.

### Colors

| Slot | Color | RGBA |
| --- | --- | --- |
| 0 | yellow | `255,200,0 / .40` |
| 1 | green | `80,200,120 / .40` |
| 2 | cyan | `0,190,255 / .35` |
| 3 | magenta | `255,105,180 / .38` |
| 4 | orange | `255,140,0 / .42` |

Each match gets the classes `cm-mark-highlight cm-mark-highlight-{slot}`.

---

## 3. Files

| File | Role |
| --- | --- |
| `src/app/editor/mark.ts` | 5-slot `markField`, `setMarkEffect` (+styleIndex), `clearAllMarksEffect`, `MARK_STYLE_COUNT`, per-slot theme |
| `src/app/editor/mark.spec.ts` | +6 unit tests (slots, independence, clear one/all, doc recompute) |
| `src/app/components/text-editor/text-editor.component.ts` | `setMark`/`markSelection`/`clearMark` gain `styleIndex`; `clearAllMarks` |
| `src/app/components/toolbar/toolbar.component.ts` | Search dropdown: Mark Style 1–5, Clear All Marks |
| `src/app/app.component.ts` | Routes `markStyle1..5` / `clearAllMarks`; `onClearMark` clears all |

---

## 4. Public API

### `editor/mark.ts`

| Export | Kind | Description |
| --- | --- | --- |
| `MARK_STYLE_COUNT` | const | Number of style slots (5) |
| `setMarkEffect` | StateEffect | `{ styleIndex, term, options }` — empty term clears the slot |
| `clearAllMarksEffect` | StateEffect | Clear every slot |
| `markCount(state, styleIndex?)` | function | Count one slot, or all when omitted |

### `TextEditorComponent`

| Method | Description |
| --- | --- |
| `setMark(term, options?, styleIndex=0)` | Mark `term` in a slot; returns slot count |
| `markSelection(options?, styleIndex=0)` | Mark the selection/word in a slot |
| `clearMark(styleIndex=0)` | Clear one slot |
| `clearAllMarks()` | Clear all slots |

---

## 5. Key decisions

- **Five facet entries instead of one merged set** — merging overlapping marks
  of different colors into a single `RangeSet` is awkward (builder needs sorted,
  non-overlapping adds). Providing one decoration set per slot sidesteps it and
  CodeMirror layers them correctly.
- **Backward-compatible signatures** — `styleIndex` defaults to 0, so the
  existing Replace-bar Mark path and Feature 09 behavior are unchanged.
- **Clear button clears all** — least surprising when multiple styles are set
  from the Search menu.

---

## 6. Testing

- **Unit:** +6 Jasmine cases. Total suite: **54 passing**.
- **Build:** `npm run build` clean.
- **Manual:** [../MANUAL_TESTING.md](../MANUAL_TESTING.md) §2.16.

---

## 7. Future work

- A dedicated Mark panel exposing per-style options (case/word/regex) and
  occurrence counts.
- "Jump to next/previous mark" navigation per style.
- Persist mark terms across reopen.
