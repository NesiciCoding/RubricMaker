/** Strip tags, decode common HTML entities and collapse whitespace. */
export function htmlToPlainText(html: string): string {
    return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Count words in an HTML string. */
export function countWords(html: string): number {
    const text = htmlToPlainText(html);
    if (!text) return 0;
    return text.split(' ').filter((w) => w.length > 0).length;
}
