/** Filesystem-safe filename fragment — collapses anything but letters/digits into underscores. */
export function sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9]/gi, '_');
}

/** `min-max` range label, collapsed to a single number when they're equal (e.g. single-point levels). */
export function formatPointsRange(min: number, max: number): string {
    return min === max ? `${max}` : `${min}-${max}`;
}

const HTML_BLOCK_TAGS = new Set([
    'P',
    'DIV',
    'LI',
    'TR',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'BLOCKQUOTE',
    'UL',
    'OL',
    'TABLE',
    'TD',
    'TH',
    'BR',
]);

// Strip HTML tags from TipTap output via DOMParser — shared by any plain-text label (e.g. a table
// cell, a comment, a question prompt) that embeds TipTap-authored markup. A regex approach would
// leave entities like &amp; encoded and could misparse literal "<"/">" in plain text (e.g. "x < y")
// as a tag; DOMParser handles both correctly. Plain .textContent would also collapse list
// items/paragraphs together with no separator, so block elements insert a trailing space.
export function stripHtmlTags(text: string): string {
    if (!text) return '';
    const doc = new DOMParser().parseFromString(text, 'text/html');
    let result = '';
    const walk = (node: ChildNode) => {
        if (node.nodeType === Node.TEXT_NODE) {
            // DOMParser text nodes always carry textContent, so the '' fallback is unreachable — kept defensive.
            /* v8 ignore next 1 */
            result += node.textContent ?? '';
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        node.childNodes.forEach(walk);
        if (HTML_BLOCK_TAGS.has((node as Element).tagName)) result += ' ';
    };
    doc.body.childNodes.forEach(walk);
    return result.replace(/\s+/g, ' ').trim();
}

/** Drops inline font sizes (pasted Word/web text carries stray ones) so a passage prints at the booklet's base size; headings keep their relative size. */
export function stripInlineFontSizes(html: string): string {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    doc.body.querySelectorAll('[style]').forEach((el) => {
        const kept = (el.getAttribute('style') ?? '')
            .split(';')
            .filter((decl) => decl.trim() && !/^\s*font(-size)?\s*:/i.test(decl))
            .join(';');
        if (kept) el.setAttribute('style', kept);
        else el.removeAttribute('style');
    });
    doc.body.querySelectorAll('font[size]').forEach((el) => el.removeAttribute('size'));
    return doc.body.firstElementChild?.innerHTML ?? '';
}

/** Normalises a stored question prompt to HTML: TipTap output passes through, legacy plain text keeps its line breaks. */
export function promptToHtml(prompt: string): string {
    if (!prompt) return '';
    if (/<[a-z][^>]*>/i.test(prompt)) return prompt;
    return prompt
        .split(/\r?\n/)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('');
}

/** Plain-text rendering of a comment that may contain pasted or TipTap-authored HTML. */
export const stripCommentHtml = stripHtmlTags;

/** Escape untrusted text for safe interpolation into export HTML (e.g. student free-text answers). */
export function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
