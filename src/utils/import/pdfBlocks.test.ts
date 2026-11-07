import { describe, expect, it, vi } from 'vitest';
import { pdfItemsToLines, pdfPagesToBlocks, type PdfTextItem } from './pdfBlocks';
import { DocumentReadError } from './documentModel';

const item = (str: string, x: number, y: number, overrides: Partial<PdfTextItem> = {}): PdfTextItem => ({
    str,
    x,
    y,
    height: 10,
    ...overrides,
});

describe('pdfItemsToLines', () => {
    it('groups runs by baseline and reads the page top to bottom, left to right', () => {
        const lines = pdfItemsToLines([
            item('tall.', 106, 100, { width: 22 }),
            item('below', 72, 130),
            item('She', 72, 100, { width: 20 }),
            item('is', 95, 100, { width: 9 }),
        ]);

        expect(lines.map((l) => l.text)).toEqual(['She is tall.', 'below']);
        expect(lines[0].x).toBe(72);
        expect(lines[0].y).toBe(100);
    });

    it('joins touching runs without inventing a space', () => {
        const lines = pdfItemsToLines([
            item('beau', 72, 50, { width: 18 }),
            item('tiful', 90, 50, { width: 22 }),
            item('pencil', 115, 50),
        ]);

        expect(lines[0].text).toBe('beautiful pencil');
    });

    it('treats a small baseline wobble as one line and a real step as a new one', () => {
        const lines = pdfItemsToLines([item('1.', 72, 200), item('She', 90, 201.5), item('2.', 72, 220)]);

        expect(lines.map((l) => l.text)).toEqual(['1. She', '2.']);
    });

    it('ignores whitespace-only runs, which a PDF uses as spacing', () => {
        expect(pdfItemsToLines([item('   ', 72, 10), item('real', 140, 10)])).toHaveLength(1);
    });

    it('keeps the largest font size on a line, so a bold heading cue is visible', () => {
        const lines = pdfItemsToLines([
            item('Assignment', 72, 10, { height: 10, fontName: 'Arial-BoldMT' }),
            item('1', 130, 10, { height: 18 }),
        ]);

        expect(lines[0].height).toBe(18);
        expect(lines[0].fontName).toBe('Arial-BoldMT');
    });
});

describe('pdfPagesToBlocks', () => {
    it('marks bold fonts and keeps the page number and left edge', () => {
        const model = pdfPagesToBlocks([
            [item('PART 1', 72, 20, { fontName: 'Helvetica-Bold' })],
            [item('plain text', 88, 40, { fontName: 'Helvetica' })],
        ]);

        expect(model.source).toBe('pdf');
        expect(model.pageCount).toBe(2);
        expect(model.blocks[0]).toMatchObject({ page: 1, text: 'PART 1', bold: true, fontSizePt: 10 });
        expect(model.blocks[1]).toMatchObject({ page: 2, text: 'plain text', x: 88 });
        expect((model.blocks[1] as { bold?: boolean }).bold).toBeUndefined();
    });

    it('notes a document with no text layer instead of pretending it is empty', () => {
        const model = pdfPagesToBlocks([[], []]);

        expect(model.blocks).toEqual([]);
        expect(model.notes).toEqual([{ key: 'pdf_no_text_layer' }]);
    });
});

describe('pdfToBlocks', () => {
    it('maps pdf.js text items through their transform matrix', async () => {
        vi.resetModules();
        vi.doMock('pdfjs-dist', () => ({
            GlobalWorkerOptions: { workerSrc: '' },
            getDocument: () => ({
                promise: Promise.resolve({
                    numPages: 1,
                    getPage: async () => ({
                        getViewport: () => ({ height: 800 }),
                        getTextContent: async () => ({
                            items: [
                                { str: 'She', transform: [10, 0, 0, 10, 72, 700], width: 20, fontName: 'F1' },
                                { str: 'is', transform: [10, 0, 0, 10, 95, 700], width: 9, fontName: 'F1' },
                                { str: '5', transform: [10, 0, 0, 10, 500, 700], width: 5, fontName: 'F1' },
                                { str: 'x', transform: [10, 0, 0, 10, 72, 650], width: 5, fontName: 'F1' },
                            ],
                        }),
                    }),
                }),
            }),
        }));

        const { pdfToBlocks: read } = await import('./pdfBlocks');
        const model = await read(new ArrayBuffer(8));

        expect(model.pageCount).toBe(1);
        expect(model.blocks.map((b) => (b.kind === 'paragraph' ? b.text : ''))).toEqual(['She is 5', 'x']);
        vi.doUnmock('pdfjs-dist');
    });

    it('reports a document pdf.js refuses to open as unreadable', async () => {
        vi.resetModules();
        vi.doMock('pdfjs-dist', () => ({
            GlobalWorkerOptions: { workerSrc: '' },
            getDocument: () => ({ promise: Promise.reject(new Error('Invalid PDF structure')) }),
        }));

        // resetModules gives this test a fresh documentModel too, so assert on the error's shape rather
        // than on class identity across two module instances.
        const { pdfToBlocks: read } = await import('./pdfBlocks');
        await expect(read(new ArrayBuffer(4))).rejects.toMatchObject({
            name: DocumentReadError.name,
            reason: 'unreadable',
        });
        vi.doUnmock('pdfjs-dist');
    });
});
