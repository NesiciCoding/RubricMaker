import { afterEach, describe, it, expect, vi } from 'vitest';
import { collectParagraphTexts, richPassageToDocx, richPromptToDocx } from './testExamExportDocx';
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

describe('rich docx blocks with images', () => {
    afterEach(() => vi.unstubAllGlobals());

    function stubImages() {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                blob: async () => ({ type: 'image/png', arrayBuffer: async () => new ArrayBuffer(8) }),
            }))
        );
        vi.stubGlobal(
            'createImageBitmap',
            vi.fn(async () => ({ width: 100, height: 50 }))
        );
    }

    it('turns an image-only paragraph into a single image paragraph after the surrounding text blocks', async () => {
        stubImages();
        const blocks = await richPassageToDocx('<p>Before</p><p><img src="data:image/png;base64,AAA"></p><p>After</p>');
        expect(blocks).toHaveLength(3);
    });

    it('drops an image that cannot be fetched without leaving an empty paragraph behind', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Promise.reject(new Error('offline')))
        );
        const blocks = await richPassageToDocx('<p>Before</p><p><img src="x"></p><p>After</p>');
        expect(blocks).toHaveLength(2);
    });

    it('keeps the first paragraph as lead runs and moves its images and the other blocks into the rest', async () => {
        stubImages();
        const { leadRuns, rest } = await richPromptToDocx('<p>Lead <img src="x"></p><p>Second</p>');
        expect(leadRuns).toHaveLength(1);
        expect(rest).toHaveLength(2);
    });

    it('handles a bare top-level image', async () => {
        stubImages();
        const blocks = await richPassageToDocx('<img src="x"><p>Text</p>');
        expect(blocks).toHaveLength(2);
    });
});
