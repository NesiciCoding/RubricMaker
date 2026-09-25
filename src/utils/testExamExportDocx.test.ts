import { describe, it, expect } from 'vitest';
import { collectParagraphTexts } from './testExamExportDocx';

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
