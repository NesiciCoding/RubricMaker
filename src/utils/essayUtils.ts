/**
 * Count words in an HTML string.
 * Strips tags, decodes common HTML entities, collapses whitespace,
 * then splits on whitespace boundaries.
 */
export function countWords(html: string): number {
    const text = html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return 0;
    return text.split(' ').filter((w) => w.length > 0).length;
}
