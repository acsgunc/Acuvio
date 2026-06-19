import { StateField, StateEffect, RangeSetBuilder, type Extension } from '@codemirror/state';
import { EditorView, Decoration, type DecorationSet } from '@codemirror/view';

/**
 * "Mark" support for the editable document view (Notepad++ Search → Mark).
 *
 * Unlike a transient find highlight, marks are **persistent**: every occurrence
 * of the marked term stays highlighted until cleared, independent of the active
 * find query. The match scan is a pure function ({@link findMatches}) so it can
 * be unit-tested without an editor; the editor wraps it in a {@link StateField}
 * that recomputes decorations whenever the term or the document changes.
 */

/** A single match span (absolute document offsets). */
export interface MatchSpan {
  from: number;
  to: number;
}

/** Options controlling how the marked term is matched. */
export interface MarkOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

const DEFAULT_OPTIONS: MarkOptions = { caseSensitive: false, wholeWord: false, regexp: false };

/** Number of independent mark styles (Notepad++ has five distinct colors). */
export const MARK_STYLE_COUNT = 5;

/**
 * Set/replace the term marked in a given style slot.
 *
 * `styleIndex` selects one of the {@link MARK_STYLE_COUNT} color slots. A `null`
 * payload (or an empty term) clears just that slot.
 */
export const setMarkEffect = StateEffect.define<{
  styleIndex: number;
  term: string;
  options: MarkOptions;
} | null>();

/** Clear every mark style at once. */
export const clearAllMarksEffect = StateEffect.define<null>();

const WORD_CHAR = /[\w$]/;

/** Escape a string for safe use as a literal inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find every (non-overlapping) match of `term` in `text`.
 *
 * Pure and side-effect free. Returns matches in document order. An empty term,
 * or an invalid regular expression when `regexp` is set, yields an empty list.
 */
export function findMatches(
  text: string,
  term: string,
  options: Partial<MarkOptions> = {},
): MatchSpan[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (!term) return [];

  let pattern = opts.regexp ? term : escapeRegExp(term);
  if (opts.wholeWord) pattern = `(?<![\\w$])(?:${pattern})(?![\\w$])`;

  let re: RegExp;
  try {
    re = new RegExp(pattern, opts.caseSensitive ? 'g' : 'gi');
  } catch {
    return []; // invalid regex
  }

  const spans: MatchSpan[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      // Zero-width match — advance to avoid an infinite loop.
      re.lastIndex++;
      continue;
    }
    spans.push({ from: m.index, to: m.index + m[0].length });
  }
  return spans;
}

const markDecorations: readonly Decoration[] = Array.from({ length: MARK_STYLE_COUNT }, (_, i) =>
  Decoration.mark({ class: `cm-mark-highlight cm-mark-highlight-${i}` }),
);

/** One mark style slot: the marked term, its match options, and its decorations. */
interface MarkSlot {
  term: string;
  options: MarkOptions;
  decorations: DecorationSet;
}

/** State for all mark style slots. */
interface MarkState {
  slots: readonly MarkSlot[];
}

const EMPTY_SLOT: MarkSlot = {
  term: '',
  options: DEFAULT_OPTIONS,
  decorations: Decoration.none,
};

const EMPTY_STATE: MarkState = {
  slots: Array.from({ length: MARK_STYLE_COUNT }, () => EMPTY_SLOT),
};

function buildDecorations(
  text: string,
  term: string,
  options: MarkOptions,
  styleIndex: number,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const span of findMatches(text, term, options)) {
    builder.add(span.from, span.to, markDecorations[styleIndex]);
  }
  return builder.finish();
}

/** Recompute the decorations for one slot against the current document. */
function recomputeSlot(slot: MarkSlot, text: string, styleIndex: number): MarkSlot {
  if (!slot.term) return slot;
  return { ...slot, decorations: buildDecorations(text, slot.term, slot.options, styleIndex) };
}

const markField = StateField.define<MarkState>({
  create() {
    return EMPTY_STATE;
  },
  update(value, tr) {
    // A slot's term was set/cleared explicitly.
    for (const effect of tr.effects) {
      if (effect.is(clearAllMarksEffect)) {
        return EMPTY_STATE;
      }
      if (effect.is(setMarkEffect)) {
        const payload = effect.value;
        if (!payload) continue;
        const { styleIndex } = payload;
        if (styleIndex < 0 || styleIndex >= MARK_STYLE_COUNT) continue;
        const slots = value.slots.slice();
        if (!payload.term) {
          slots[styleIndex] = EMPTY_SLOT;
        } else {
          slots[styleIndex] = {
            term: payload.term,
            options: payload.options,
            decorations: buildDecorations(
              tr.state.doc.toString(),
              payload.term,
              payload.options,
              styleIndex,
            ),
          };
        }
        value = { slots };
      }
    }
    // Recompute active slots when the document changed.
    if (tr.docChanged && value.slots.some((s) => s.term)) {
      const text = tr.state.doc.toString();
      value = { slots: value.slots.map((s, i) => recomputeSlot(s, text, i)) };
    }
    return value;
  },
  // Provide each slot's decorations as a separate facet entry so overlapping
  // marks in different styles coexist (matches within one style never overlap).
  provide: (f) =>
    Array.from({ length: MARK_STYLE_COUNT }, (_, i) =>
      EditorView.decorations.compute([f], (state) => state.field(f).slots[i].decorations),
    ),
});

const markTheme = EditorView.baseTheme({
  '.cm-mark-highlight': { borderRadius: '2px' },
  '.cm-mark-highlight-0': { backgroundColor: 'rgba(255, 200, 0, 0.40)' }, // yellow
  '.cm-mark-highlight-1': { backgroundColor: 'rgba(80, 200, 120, 0.40)' }, // green
  '.cm-mark-highlight-2': { backgroundColor: 'rgba(0, 190, 255, 0.35)' }, // cyan
  '.cm-mark-highlight-3': { backgroundColor: 'rgba(255, 105, 180, 0.38)' }, // magenta
  '.cm-mark-highlight-4': { backgroundColor: 'rgba(255, 140, 0, 0.42)' }, // orange
});

/** The complete Mark extension bundle for the editor. */
export function markHighlighter(): Extension {
  return [markField, markTheme];
}

/**
 * Number of marked occurrences in `state`.
 *
 * Pass a `styleIndex` to count one slot, or omit it to count every style.
 */
export function markCount(state: { field: (f: any) => any }, styleIndex?: number): number {
  const value = state.field(markField) as MarkState;
  if (styleIndex === undefined) {
    return value.slots.reduce((sum, s) => sum + s.decorations.size, 0);
  }
  if (styleIndex < 0 || styleIndex >= MARK_STYLE_COUNT) return 0;
  return value.slots[styleIndex].decorations.size;
}
