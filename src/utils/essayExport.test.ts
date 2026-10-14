import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, htmlToDocxChildren, escapeHtml, cssColorToHex, htmlToDocxLead } from './essayExport';

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

    it('escapes backslashes in table cells before escaping pipes, so a literal backslash cannot unescape a pipe', () => {
        const md = htmlToMarkdown('<table><tr><td>C:\\path</td><td>a\\|b</td></tr></table>');
        expect(md).toContain('| C:\\\\path | a\\\\\\|b |');
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

    it('falls back to data-color and plain ==highlight== syntax for unstyled marks', () => {
        expect(htmlToMarkdown('<p><mark data-color="#ff0000">red</mark></p>')).toBe(
            '<mark style="background-color: #ff0000">red</mark>'
        );
        expect(htmlToMarkdown('<p><mark>plain</mark></p>')).toBe('==plain==');
    });

    it('renders links without an href and spans without styles as plain text', () => {
        const md = htmlToMarkdown('<p><a>no href</a> and <span>no styles</span></p>');
        expect(md).toBe('[no href]() and no styles');
    });

    it('returns the raw row text for empty tables and unknown block elements', () => {
        expect(htmlToMarkdown('<table></table>')).toBe('');
        expect(htmlToMarkdown('<div>Standalone block</div>')).toBe('Standalone block');
    });

    it('falls back to the li text for task-list items without a wrapping div', () => {
        const md = htmlToMarkdown('<ul data-type="taskList"><li>Plain item</li></ul>');
        expect(md).toBe('- [ ] Plain item');
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

describe('cssColorToHex', () => {
    it('normalises hex and rgb() values to 6-digit hex', () => {
        expect(cssColorToHex('#1e293b')).toBe('1e293b');
        expect(cssColorToHex('#f00')).toBe('ff0000');
        expect(cssColorToHex('rgb(255, 128, 0)')).toBe('ff8000');
    });

    it('drops values docx cannot render', () => {
        for (const v of ['inherit', 'transparent', 'currentColor', 'red', '', undefined]) {
            expect(cssColorToHex(v)).toBeUndefined();
        }
    });
});

describe('htmlToDocxChildren with non-hex colors', () => {
    it('does not throw on color: inherit or a transparent highlight', () => {
        expect(() =>
            htmlToDocxChildren(
                '<p><span style="color: inherit">a</span><mark style="background-color: transparent">b</mark><span style="color: rgb(1,2,3)">c</span></p>'
            )
        ).not.toThrow();
    });
});

describe('htmlToDocxChildren links and right-to-left text (#695)', () => {
    async function documentXml(html: string) {
        const { Document, Packer } = await import('docx');
        const JSZip = (await import('jszip')).default;
        const doc = new Document({ sections: [{ children: htmlToDocxChildren(html) }] });
        const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
        return {
            body: await zip.file('word/document.xml')!.async('string'),
            rels: await zip.file('word/_rels/document.xml.rels')!.async('string'),
        };
    }

    it('keeps a link as a real hyperlink to its URL', async () => {
        const { body, rels } = await documentXml('<p>Read <a href="https://example.com/a?b=1">this article</a>.</p>');
        expect(body).toContain('<w:hyperlink');
        expect(body).toContain('this article');
        expect(rels).toContain('Target="https://example.com/a?b=1"');
        expect(rels).toContain('TargetMode="External"');
    });

    it('drops the link but keeps the text for unsafe hrefs', async () => {
        const { body, rels } = await documentXml('<p><a href="javascript:alert(1)">click</a></p>');
        expect(body).not.toContain('<w:hyperlink');
        expect(body).toContain('click');
        expect(rels).not.toContain('javascript:');
    });

    it('marks dir="rtl" paragraphs and their runs as right-to-left', async () => {
        const { body } = await documentXml('<p dir="rtl">مرحبا بالعالم</p><p>Hello</p>');
        expect(body.match(/<w:bidi\/>/g)).toHaveLength(1);
        expect(body).toContain('<w:rtl/>');
    });

    it('follows the first strong character for dir="auto"', async () => {
        const { body } = await documentXml('<p dir="auto">שלום world</p><p dir="auto">Hello שלום</p>');
        expect(body.match(/<w:bidi\/>/g)).toHaveLength(1);
    });

    it('marks right-to-left list items and headings', async () => {
        const { body } = await documentXml('<h2 dir="rtl">عنوان</h2><ul><li><p dir="rtl">بند</p></li></ul>');
        expect(body.match(/<w:bidi\/>/g)).toHaveLength(2);
    });

    it("keeps a link's own colour instead of the default link blue", async () => {
        const { body } = await documentXml('<p><a href="https://example.com" style="color: #ff0000">red</a></p>');
        expect(body).toContain('w:val="ff0000"');
        expect(body).not.toContain('0563C1');
    });

    it('lets list paragraphs inherit the direction of their list', async () => {
        const { body } = await documentXml('<ul dir="rtl"><li><p>مرحبا</p></li></ul>');
        expect(body).toContain('<w:bidi/>');
    });
});

describe('htmlToDocxLead direction (#695)', () => {
    it('reports a right-to-left lead paragraph so the caller can mark it', () => {
        expect(htmlToDocxLead('<p dir="rtl">سؤال</p>').leadRtl).toBe(true);
        expect(htmlToDocxLead('<p>Question</p>').leadRtl).toBeFalsy();
    });
});
