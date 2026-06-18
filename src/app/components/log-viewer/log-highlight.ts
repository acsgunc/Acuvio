import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

/**
 * Per-line / per-token decoration for log severity, timestamps, IPs and numbers.
 * Runs only over the visible viewport ranges, so it stays cheap even when the
 * document holds a large window of lines.
 */

const LEVEL_RE = /\b(ERROR|ERR|FATAL|CRITICAL|WARN(?:ING)?|INFO|DEBUG|TRACE|NOTICE)\b/g;
const TIMESTAMP_RE =
  /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
const IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?\b/g;
const NUMBER_RE = /\b\d+\b/g;

const levelMark = (level: string): Decoration => {
  const l = level.toUpperCase();
  let cls = 'acu-level-info';
  if (l === 'ERROR' || l === 'ERR' || l === 'FATAL' || l === 'CRITICAL') cls = 'acu-level-error';
  else if (l.startsWith('WARN')) cls = 'acu-level-warn';
  else if (l === 'INFO' || l === 'NOTICE') cls = 'acu-level-info';
  else if (l === 'DEBUG') cls = 'acu-level-debug';
  else if (l === 'TRACE') cls = 'acu-level-trace';
  return Decoration.mark({ class: cls });
};

const tsMark = Decoration.mark({ class: 'acu-timestamp' });
const ipMark = Decoration.mark({ class: 'acu-ip' });
const numMark = Decoration.mark({ class: 'acu-number' });

interface Tok {
  from: number;
  to: number;
  deco: Decoration;
  priority: number;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    const toks: Tok[] = [];

    const collect = (re: RegExp, make: (m: string) => Decoration, priority: number) => {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        toks.push({ from: from + m.index, to: from + m.index + m[0].length, deco: make(m[0]), priority });
      }
    };

    // Higher priority wins on overlap. Timestamps/IPs before plain numbers.
    collect(TIMESTAMP_RE, () => tsMark, 3);
    collect(IP_RE, () => ipMark, 3);
    collect(LEVEL_RE, (s) => levelMark(s), 2);
    collect(NUMBER_RE, () => numMark, 1);

    toks.sort((a, b) => a.from - b.from || b.priority - a.priority);

    let lastTo = -1;
    for (const t of toks) {
      if (t.from < lastTo) continue; // skip overlaps with already-placed token
      builder.add(t.from, t.to, t.deco);
      lastTo = t.to;
    }
  }

  return builder.finish();
}

export const logHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);
