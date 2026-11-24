import DOMPurify from 'dompurify';
import { isRichClozePrompt, matchClozeGaps, type ClozeGap } from '../../supabase/functions/_shared/testScoring.ts';

export { isRichClozePrompt };

/**
 * A formatted cloze prompt is HTML whose `{{…}}` gaps stay in the text (so the scorer reads it unchanged). While it is
 * still being walked, each gap is swapped for one of these private-use markers: they survive sanitising and parsing
 * untouched and are told apart from anything a teacher could type.
 */
const MARK_OPEN = '';
const MARK_CLOSE = '';
const MARK_PATTERN = new RegExp(`${MARK_OPEN}(\\d+)${MARK_CLOSE}`, 'g');

export type RichClozePiece = { type: 'text'; text: string } | { type: 'gap'; gap: ClozeGap };

/** The prompt with each gap replaced by its marker, plus the gaps in order. */
function markGaps(prompt: string): { marked: string; gaps: ClozeGap[] } {
    const matches = matchClozeGaps(prompt);
    let marked = '';
    let last = 0;
    matches.forEach((match, i) => {
        marked += `${prompt.slice(last, match.start)}${MARK_OPEN}${i}${MARK_CLOSE}`;
        last = match.end;
    });
    marked += prompt.slice(last);
    return { marked, gaps: matches.map((m) => m.gap) };
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/** Readable plain text of an HTML fragment: paragraphs, list items and `<br>` become line breaks. */
export function htmlToPlainLines(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let out = '';
    const walk = (node: ChildNode) => {
        if (node.nodeType === Node.TEXT_NODE) {
            out += node.textContent ?? '';
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node as Element;
        if (element.tagName === 'BR') {
            out += '\n';
            return;
        }
        element.childNodes.forEach(walk);
        if (BLOCK_TAGS.has(element.tagName)) out += '\n';
    };
    doc.body.childNodes.forEach(walk);
    return out.replace(/\n+$/, '');
}

/** A formatted prompt as plain text and gaps, in order — what `renderClozeSegments` returns for it. */
export function richClozePieces(prompt: string): RichClozePiece[] {
    const { marked, gaps } = markGaps(prompt);
    const plain = htmlToPlainLines(marked);
    const pieces: RichClozePiece[] = [];
    let last = 0;
    for (const match of plain.matchAll(MARK_PATTERN)) {
        if (match.index > last) pieces.push({ type: 'text', text: plain.slice(last, match.index) });
        const gap = gaps[Number(match[1])];
        if (gap) pieces.push({ type: 'gap', gap });
        last = match.index + match[0].length;
    }
    if (last < plain.length) pieces.push({ type: 'text', text: plain.slice(last) });
    return pieces;
}

/** Sanitised HTML of a formatted prompt with each gap replaced by `blank(index)` (already-safe HTML), for printing. */
export function richClozeHtmlWithBlanks(prompt: string, blank: (index: number) => string): string {
    const { marked } = markGaps(prompt);
    return DOMPurify.sanitize(marked).replace(MARK_PATTERN, (_whole, index: string) => blank(Number(index)));
}

/** A sanitised DOM of a formatted prompt in which each gap marker is still a text marker; see `splitGapMarkers`. */
export function sanitisedRichClozeBody(prompt: string): { body: HTMLElement; gaps: ClozeGap[] } {
    const { marked, gaps } = markGaps(prompt);
    const doc = new DOMParser().parseFromString(DOMPurify.sanitize(marked), 'text/html');
    return { body: doc.body, gaps };
}

/** Splits one text node's text around its gap markers: strings, and `{ index }` where a gap goes. */
export function splitGapMarkers(text: string): (string | { index: number })[] {
    const parts: (string | { index: number })[] = [];
    let last = 0;
    for (const match of text.matchAll(MARK_PATTERN)) {
        if (match.index > last) parts.push(text.slice(last, match.index));
        parts.push({ index: Number(match[1]) });
        last = match.index + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
}

// Exactly the entities `decodeEntities` in testScoring.ts reads back.
const PROMPT_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for insertion into a prompt: entity-escaped when the prompt is HTML, untouched when it is plain. */
export function escapeForPrompt(prompt: string, text: string): string {
    if (!isRichClozePrompt(prompt)) return text;
    return text.replace(/[&<>"']/g, (ch) => PROMPT_ESCAPES[ch]);
}
