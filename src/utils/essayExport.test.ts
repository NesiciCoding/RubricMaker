import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, htmlToDocxChildren, escapeHtml } from './essayExport';

const FIXTURE_HTML = `
<h1>My Essay</h1>
<p>This is <strong>bold</strong> and <em>italic</em> text with a <a href="https://example.com">link</a>.</p>
<ul><li>First</li><li>Second</li></ul>
<ol><li>One</li><li>Two</li></ol>
<blockquote>A quote.</blockquote>
<hr/>
`;

describe('htmlToMarkdown', () => {
    it('converts headings, formatting, links, and lists to markdown', () => {
        const md = htmlToMarkdown(FIXTURE_HTML);
        expect(md).toContain('# My Essay');
        expect(md).toContain('**bold**');
        expect(md).toContain('_italic_');
        expect(md).toContain('[link](https://example.com)');
        expect(md).toContain('- First');
        expect(md).toContain('- Second');
        expect(md).toContain('1. One');
        expect(md).toContain('2. Two');
        expect(md).toContain('> A quote.');
        expect(md).toContain('---');
    });

    it('flattens a table to pipe-separated rows', () => {
        const md = htmlToMarkdown('<table><tr><td>A</td><td>B</td></tr></table>');
        expect(md).toContain('A | B');
    });
});

describe('htmlToDocxChildren', () => {
    it('produces one Paragraph per top-level block', () => {
        const children = htmlToDocxChildren(FIXTURE_HTML);
        // h1, p, 2 list items (ul), 2 list items (ol), blockquote, hr = 8
        expect(children.length).toBe(8);
    });
});

describe('escapeHtml', () => {
    it('escapes markup-significant characters so user-controlled strings cannot inject markup', () => {
        expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(escapeHtml('A & B "quoted" \'single\'')).toBe('A &amp; B &quot;quoted&quot; &#39;single&#39;');
    });
});
