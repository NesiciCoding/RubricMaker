import JSZip from 'jszip';
import { afterEach, describe, it, expect, vi } from 'vitest';
import '../i18n';
import type { Test } from '../types';
import { collectParagraphTexts, exportExamDocx, richPassageToDocx, richPromptToDocx } from './testExamExportDocx';
import { htmlToDocxChildren, htmlToDocxLead } from './essayExport';

const saved: Blob[] = [];
vi.mock('file-saver', () => ({ saveAs: (blob: Blob) => saved.push(blob) }));

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

    it('keeps an image-only paragraph in its position between the surrounding text blocks', async () => {
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

    it('keeps the first paragraph, images included, as lead runs and the other blocks as the rest', async () => {
        stubImages();
        const { leadRuns, rest } = await richPromptToDocx('<p>Lead <img src="x"></p><p>Second</p>');
        expect(leadRuns).toHaveLength(2);
        expect(rest).toHaveLength(1);
    });

    it('handles a bare top-level image', async () => {
        stubImages();
        const blocks = await richPassageToDocx('<img src="x"><p>Text</p>');
        expect(blocks).toHaveLength(2);
    });
});

describe('exam booklet .docx content', () => {
    async function bookletXml(test: Test): Promise<string> {
        saved.length = 0;
        await exportExamDocx(test, { attachmentMode: 'inline', hotTextMirror: false, scanMarkers: false });
        const zip = await JSZip.loadAsync(saved[0]);
        const name = Object.keys(zip.files).find((f) => f.endsWith('-booklet.docx'))!;
        const booklet = await JSZip.loadAsync(await zip.files[name].async('arraybuffer'));
        return booklet.files['word/document.xml'].async('string');
    }

    const test: Test = {
        id: 't1',
        name: 'Quiz',
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        sections: [{ id: 's1', title: 'Listening', audioUrl: 'https://example.com/a.mp3' }],
        questions: [
            { id: 'q1', type: 'open', points: 1, prompt: '<p>One</p>', sectionId: 's1' },
            {
                id: 'q2',
                type: 'open',
                points: 3,
                prompt: '<p>Two</p>',
                sectionId: 's1',
                audioUrl: 'https://example.com/q.mp3',
            },
        ],
    };

    it('prints listen notes for the section and the audio question, and pluralised point labels', async () => {
        const xml = await bookletXml(test);
        expect(xml.match(/Listen to the recording\./g)).toHaveLength(2);
        expect(xml).toContain('1 pt');
        expect(xml).toContain('3 pts');
    });

    describe('rich content placement', () => {
        afterEach(() => vi.unstubAllGlobals());

        const richTest = (sectionContent: string, prompt: string): Test => ({
            ...test,
            sections: [{ id: 's1', title: 'Reading', content: sectionContent }],
            questions: [{ id: 'q1', type: 'open', points: 1, prompt, sectionId: 's1' }],
        });

        it('keeps an image in its table cell and a list image in its list item', async () => {
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
            const xml = await bookletXml(
                richTest(
                    '<table><tr><td>Label A</td><td><img src="data:image/png;base64,AAA"></td></tr></table><ul><li>Item <img src="data:image/png;base64,AAA"></li></ul>',
                    '<p>Q</p>'
                )
            );

            const cells = xml.split('<w:tc>').slice(1);
            const labelCell = cells.findIndex((c) => c.includes('Label A'));
            expect(labelCell).toBeGreaterThanOrEqual(0);
            expect(cells[labelCell]).not.toContain('<w:drawing>');
            expect(cells[labelCell + 1]).toContain('<w:drawing>');

            const paragraphs = xml.split('<w:p>').slice(1);
            expect(paragraphs.filter((p) => p.includes('Item ') && p.includes('<w:drawing>'))).toHaveLength(1);
        });

        it('keeps text that sits next to inline markup without a wrapping paragraph', async () => {
            const xml = await bookletXml(richTest('<p>Passage</p>', 'Read <strong>this</strong> carefully.'));
            expect(xml).toContain('Read ');
            expect(xml).toContain('this');
            expect(xml).toContain(' carefully.');
        });
    });
});
