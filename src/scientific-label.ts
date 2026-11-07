import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { MathJaxTexFont } from '@mathjax/mathjax-tex-font/js/svg.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';

export const escapeLabel = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
type MathPart = { kind: 'math'; source: string; svg: string; width: number; ascent: number; descent: number };
export type LabelPart = { kind: 'text'; source: string; nowrap?: boolean } | MathPart;
export type ScientificLabel = { parts: LabelPart[]; error?: string };
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const mathDocument = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams'], maxBuffer: 4096, maxMacros: 200,
    formatError: (_jax: unknown, error: { message: string }) => { throw new Error(error.message); } }),
  // Explicit paths keep UI, SVG, and PNG identical without remote fonts or shared IDs.
  OutputJax: new SVG({ fontCache: 'none', fontData: MathJaxTexFont }),
});
const cache = new Map<string, ScientificLabel>();
function mathPart(source: string): MathPart {
  const container = mathDocument.convert(source, { display: false, em: 16, ex: 8, containerWidth: 10000 });
  const node = adaptor.firstChild(container) as ReturnType<typeof adaptor.node>;
  const width = parseFloat(adaptor.getAttribute(node, 'width')) / 2;
  const height = parseFloat(adaptor.getAttribute(node, 'height')) / 2;
  const descent = -parseFloat(adaptor.getStyle(node, 'vertical-align')) / 2;
  if (![width, height, descent].every(Number.isFinite)) throw new Error('Use an inline expression for a site name.');
  return { kind: 'math', source, svg: adaptor.outerHTML(node), width, ascent: height - descent, descent };
}

/** Plain text plus $...$ or \(...\); bare TeX commands and braced scripts work too. */
export function scientificLabel(source: string): ScientificLabel {
  const existing = cache.get(source); if (existing) return existing;
  let result: ScientificLabel;
  try {
    if (source.length > 512) throw new Error('Keep LaTeX labels within 512 characters.');
    const parts: LabelPart[] = [];
    const delimiters = /(?<!\\)(\$|\\\()/g;
    let match: RegExpExecArray | null, start = 0, delimited = false;
    while ((match = delimiters.exec(source))) {
      delimited = true;
      const closing = match[0] === '$' ? /(?<!\\)\$/g : /\\\)/g;
      closing.lastIndex = delimiters.lastIndex;
      const end = closing.exec(source);
      if (!end) throw new Error(`Close the ${match[0] === '$' ? '$…$' : '\\(…\\)'} expression to render it.`);
      if (match.index > start) parts.push({ kind: 'text', source: source.slice(start, match.index) });
      parts.push(mathPart(source.slice(delimiters.lastIndex, end.index)));
      start = end.index + end[0].length; delimiters.lastIndex = start;
    }
    if (delimited) {
      if (start < source.length) parts.push({ kind: 'text', source: source.slice(start) });
    } else if (/\\[a-zA-Z]+|[_^]\{/.test(source)) parts.push(mathPart(source));
    else parts.push({ kind: 'text', source });
    result = { parts };
  } catch (error) { result = { parts: [{ kind: 'text', source }], error: (error as Error).message }; }
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(source, result);
  return result;
}

// Helvetica/Arial advances in thousandths of an em keep adjacent text and math
// attached in standalone exports, including when no browser canvas is available.
const advances: Record<string, number> = {};
for (const [letters, widths] of [
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', [667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611]],
  ['abcdefghijklmnopqrstuvwxyz', [556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500]],
  ['0123456789', Array(10).fill(556)],
] as [string, number[]][]) [...letters].forEach((letter, i) => { advances[letter] = widths[i]; });
Object.assign(advances, { ' ': 278, '.': 278, ',': 278, ':': 278, ';': 278, '-': 333, '·': 278, '%':889, '—':1000, '–':556, '<':584, '≤':584, '²':333, '³':333, '⁺':584, 'α':578, 'β':556, 'γ':500, 'δ':556, 'θ':556, 'λ':500, 'μ':556, 'σ':617, 'ω':722, 'é':556, 'ö':556, 'ü':556, '+': 584, '(': 333, ')': 333, '/': 278, '!': 278, "'": 191 });
export const textWidth = (text: string, fontSize: number) => [...text].reduce((sum, char) => sum + (advances[char] ?? 600), 0) * fontSize / 1000;

export type LabelLine = { parts: { part: LabelPart; width: number; scale: number }[]; width: number; ascent: number; descent: number };
/** Wrap text while keeping each math expression intact. Dimensions are SVG units. */
export function layoutLabel(source: string, maxWidth: number, fontSize = 11,appendText=''): LabelLine[] {
  const lines: LabelLine[] = [];
  const fresh = (): LabelLine => ({ parts: [], width: 0, ascent: fontSize * .85, descent: fontSize * .25 });
  let line = fresh();
  const push = () => { lines.push(line); line = fresh(); };
  const parts:LabelPart[]=[...scientificLabel(source).parts,...(appendText?[{kind:'text' as const,source:appendText,nowrap:true}]:[])];
  const atoms = parts.flatMap<LabelPart>(part => part.kind === 'math'||part.nowrap ? [part] : part.source.split(/(\s+)/).filter(Boolean).map(source => ({ kind: 'text' as const, source })));
  const whitespace = (part: LabelPart) => part.kind === 'text' && /^\s+$/.test(part.source);
  const groups: LabelPart[][] = [];
  for (const atom of atoms) {
    if (!groups.length || (atom.kind==='text'&&atom.nowrap) || whitespace(atom) || whitespace(groups.at(-1)![0])) groups.push([atom]);
    else groups.at(-1)!.push(atom);
  }
  for (const group of groups) {
    // Keep Fe and its adjacent $^{3+}$ together at a line break.
    const groupWidth = group.reduce((sum, part) => sum + (part.kind === 'math' ? part.width * fontSize : textWidth(part.source, fontSize)), 0);
    if (!whitespace(group[0]) && groupWidth <= maxWidth && line.width && line.width + groupWidth > maxWidth) push();
    for (const atom of group) {
      let rest = atom.source;
      if (atom.kind === 'text' && /^\s+$/.test(rest)) {
        if (line.width && line.width + fontSize * .278 <= maxWidth) { line.parts.push({ part: { kind: 'text', source: ' ' }, width: fontSize * .278, scale: 1 }); line.width += fontSize * .278; }
        continue;
      }
      do {
        let chars = 0, measured = 0;
        if (atom.kind === 'text'&&atom.nowrap) chars=rest.length;
        else if (atom.kind === 'text') for (const char of rest) {
          const next = textWidth(char, fontSize);
          if (chars && measured + next > maxWidth) break;
          measured += next; chars += char.length;
        }
        const piece: LabelPart = atom.kind === 'math' ? atom : { kind: 'text', source: rest.slice(0, chars) };
        const naturalWidth = piece.kind === 'math' ? piece.width * fontSize : textWidth(piece.source, fontSize);
        const scale = Math.min(1, maxWidth / Math.max(naturalWidth, 1)), width = naturalWidth * scale;
        if (line.width && line.width + width > maxWidth) push();
        line.parts.push({ part: piece, width, scale }); line.width += width;
        if (piece.kind === 'math') { line.ascent = Math.max(line.ascent, piece.ascent * fontSize * scale); line.descent = Math.max(line.descent, piece.descent * fontSize * scale); }
        rest = atom.kind === 'math' ? '' : rest.slice(chars);
      } while (rest);
    }
  }
  if (line.parts.length || !lines.length) push();
  return lines;
}
export function svgLabelLine(line: LabelLine, x: number, baseline: number, fontSize = 11): string {
  let svg = '', pending = '', textX = x, textLength = 0;
  const flush = () => {
    if (pending) svg += `<text x="${textX}" y="${baseline}" font-size="${fontSize}" textLength="${textLength}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${escapeLabel(pending)}</text>`;
    pending = ''; textLength = 0;
  };
  for (const { part, width, scale } of line.parts) {
    if (part.kind === 'text') { if (!pending) textX = x; pending += part.source; textLength += width; }
    else {
      flush();
      const height = (part.ascent + part.descent) * fontSize * scale;
      svg += part.svg.replace(/<svg[^>]*>/, opening => opening.replace(/ (width|height|style|role)="[^"]*"/g, '').replace('>', ` x="${x}" y="${baseline - part.ascent * fontSize * scale}" width="${width}" height="${height}" aria-hidden="true">`));
    }
    x += width;
  }
  flush();
  return svg;
}
