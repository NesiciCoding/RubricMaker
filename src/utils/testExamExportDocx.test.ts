import { describe, it, expect } from 'vitest';
import { collectParagraphTexts } from './testExamExportDocx';
import { htmlToDocxChildren, htmlToDocxLead } from './essayExport';

function parse(html: string): Element {
    return new DOMParser().parseFromString(html, 'text/html').body;
}

describe('collectParagraphTexts', () => {
    it('splits multiple paragraphs into separate segments', () => {
        expect(collectParagraphTexts(parse('<p>First</p><p>Second</p>'))).toEqual(['First', 'Second']);
    });

    it('includes plain <div> text that a p/li/h*/blockquote-only selector would miss', () => {
        expect(collectParagraphTexts(parse('<div>Hello world</div>'))).toEqual(['Hello world']);
    });

    it('does not duplicate a nested block’s text', () => {
        expect(collectParagraphTexts(parse('<blockquote><p>Read this</p></blockquote>'))).toEqual(['Read this']);
    });

    it('keeps interleaved text and a nested block in source order', () => {
        expect(collectParagraphTexts(parse('<blockquote>Before<p>Inside</p>After</blockquote>'))).toEqual([
            'Before',
            'Inside',
            'After',
        ]);
    });

    it('merges inline formatting into the surrounding paragraph', () => {
        expect(collectParagraphTexts(parse('<p>Hello <strong>world</strong>!</p>'))).toEqual(['Hello world!']);
    });

    it('falls back to the raw text when there are no block elements at all', () => {
        expect(collectParagraphTexts(parse('Just plain text, no tags.'))).toEqual(['Just plain text, no tags.']);
    });

    it('drops empty/whitespace-only segments', () => {
        expect(collectParagraphTexts(parse('<p>   </p><p>Real content</p>'))).toEqual(['Real content']);
    });
});

describe('htmlToDocxLead', () => {
    it('splits the first paragraph into inline runs and the rest into blocks', () => {
        const { leadRuns, rest } = htmlToDocxLead('<p>Hi <strong>there</strong></p><p>Second</p><p></p><p>Third</p>');
        expect(leadRuns).toHaveLength(2);
        expect(rest).toHaveLength(3);
    });

    it('returns no lead runs when the prompt starts with a non-paragraph block', () => {
        const { leadRuns, rest } = htmlToDocxLead('<ul><li>a</li></ul>');
        expect(leadRuns).toEqual([]);
        expect(rest).toHaveLength(1);
    });
});

describe('htmlToDocxChildren spacingAfter', () => {
    it('keeps one block per paragraph, including blank lines, for reading passages', () => {
        const blocks = htmlToDocxChildren('<p>One <em>two</em></p><p></p><p><mark>Three</mark></p>', 120);
        expect(blocks).toHaveLength(3);
    });
});
