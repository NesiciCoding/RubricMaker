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

    it('renders a table as a GFM table with a header separator row', () => {
        const md = htmlToMarkdown('<table><tr><th>Name</th><th>Score</th></tr><tr><td>A</td><td>B</td></tr></table>');
        expect(md).toContain('| Name | Score |');
        expect(md).toContain('| --- | --- |');
        expect(md).toContain('| A | B |');
    });

    it('renders a task list with GFM checkbox syntax', () => {
        const html =
            '<ul data-type="taskList"><li data-checked="true"><div>Done</div></li><li data-checked="false"><div>Todo</div></li></ul>';
        const md = htmlToMarkdown(html);
        expect(md).toContain('- [x] Done');
        expect(md).toContain('- [ ] Todo');
    });

    it('preserves sup/sub/highlight/color marks as inline HTML', () => {
        const md = htmlToMarkdown(
            '<p>H<sub>2</sub>O and x<sup>2</sup> and <mark style="background-color: #fef08a">flagged</mark> and <span style="color: #663399">purple</span></p>'
        );
        expect(md).toContain('<sub>2</sub>');
        expect(md).toContain('<sup>2</sup>');
        expect(md).toContain('<mark style="background-color: #fef08a">flagged</mark>');
        expect(md).toContain('<span style="color: #663399">purple</span>');
    });
});

describe('htmlToDocxChildren', () => {
    it('produces one Paragraph per top-level block', () => {
        const children = htmlToDocxChildren(FIXTURE_HTML);
        // h1, p, 2 list items (ul), 2 list items (ol), blockquote, hr = 8
        expect(children.length).toBe(8);
    });

    it('produces a real Table node (not flattened paragraphs) for a <table>', () => {
        const children = htmlToDocxChildren('<table><tr><th>Name</th></tr><tr><td>A</td></tr></table>');
        expect(children.length).toBe(1);
        expect(children[0].constructor.name).toBe('Table');
    });

    it('produces one Paragraph per task list item', () => {
        const html =
            '<ul data-type="taskList"><li data-checked="true"><div>Done</div></li><li data-checked="false"><div>Todo</div></li></ul>';
        const children = htmlToDocxChildren(html);
        expect(children.length).toBe(2);
    });

    it('does not throw on color/highlight/font/line-height/text-align marks', () => {
        const html =
            '<p style="text-align: center; line-height: 1.5"><span style="color: #663399; font-family: Arial; font-size: 14pt">styled</span> <mark style="background-color: #fef08a">hl</mark> <sup>2</sup></p>';
        expect(() => htmlToDocxChildren(html)).not.toThrow();
    });
});

describe('escapeHtml', () => {
    it('escapes markup-significant characters so user-controlled strings cannot inject markup', () => {
        expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(escapeHtml('A & B "quoted" \'single\'')).toBe('A &amp; B &quot;quoted&quot; &#39;single&#39;');
    });
});
