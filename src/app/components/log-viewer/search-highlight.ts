import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';

/** A highlight range expressed in absolute document positions. */
export interface HighlightRange {
  from: number;
  to: number;
  active: boolean;
}

/** Effect used to replace the current set of search highlights. */
export const setSearchHighlights = StateEffect.define<HighlightRange[]>();

const matchMark = Decoration.mark({ class: 'acu-search-match' });
const activeMark = Decoration.mark({ class: 'acu-search-active' });

export const searchHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSearchHighlights)) {
        const ranges = effect.value
          .filter((r) => r.from < r.to)
          .sort((a, b) => a.from - b.from)
          .map((r) => (r.active ? activeMark : matchMark).range(r.from, r.to));
        deco = Decoration.set(ranges, true);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
