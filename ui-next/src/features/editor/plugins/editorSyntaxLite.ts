import { Extension, RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

const footnoteDecoration = Decoration.mark({ class: 'cm-syntax-footnote' });
const indexDecoration = Decoration.mark({ class: 'cm-syntax-index' });
const lawquoteDecoration = Decoration.mark({ class: 'cm-syntax-lawquote' });

const FOOTNOTE_PATTERN = /\[\^[^\]\n]+\]/g;
const INDEX_PATTERN = /\{[^\n{}|]+\|idx\|[^\n{}|]+\}/g;
const LAWQUOTE_PATTERN = /^:::\s*\{?\.?lawquote[^\n]*\}?/gm;

function addMatches(
  builder: RangeSetBuilder<Decoration>,
  text: string,
  offset: number,
  pattern: RegExp,
  decoration: Decoration,
): void {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const from = offset + match.index;
    const to = from + match[0].length;
    builder.add(from, to, decoration);

    if (match[0].length === 0) {
      pattern.lastIndex += 1;
    }
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const range of view.visibleRanges) {
    const text = view.state.doc.sliceString(range.from, range.to);
    addMatches(builder, text, range.from, FOOTNOTE_PATTERN, footnoteDecoration);
    addMatches(builder, text, range.from, INDEX_PATTERN, indexDecoration);
    addMatches(builder, text, range.from, LAWQUOTE_PATTERN, lawquoteDecoration);
  }

  return builder.finish();
}

const lightweightSyntaxPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildDecorations(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildDecorations(update.view);
    }
  }
}, {
  decorations: value => value.decorations,
});

export function lightweightEditorSyntaxHighlighting(): Extension {
  return lightweightSyntaxPlugin;
}
