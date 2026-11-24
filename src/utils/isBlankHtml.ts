/** An editor that was emptied still reports `<p></p>`; that is no content at all, while a picture alone is content. */
export function isBlankHtml(html: string): boolean {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return !doc.querySelector('img') && (doc.body.textContent ?? '').trim() === '';
}
