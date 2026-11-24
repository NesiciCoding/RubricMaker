import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import type { Test, TestQuestion } from '../types';
import { DEFAULT_EXAM_EXPORT_OPTIONS } from './testExamContent';
import { buildExamBookletHtml } from './testExamExportHtml';
import { exportExamDocx } from './testExamExportDocx';

const saved: Blob[] = [];
vi.mock('file-saver', () => ({ saveAs: (blob: Blob) => saved.push(blob) }));

const IMG = 'https://example.com/pic.png';

const questions: TestQuestion[] = [
    {
        id: 'm',
        type: 'matching',
        points: 2,
        prompt: '<p>Match</p>',
        matchingPairs: [
            { id: 'p1', left: 'Dog', right: 'Hond', leftImageUrl: IMG },
            { id: 'p2', left: 'Cat', right: 'Kat' },
        ],
    },
    {
        id: 'o',
        type: 'ordering',
        points: 2,
        prompt: '<p>Order</p>',
        orderItems: [
            { id: 'a', text: 'Seed', imageUrl: IMG },
            { id: 'b', text: 'Tree' },
        ],
    },
    {
        id: 'c',
        type: 'categorize',
        points: 2,
        prompt: '<p>Sort</p>',
        categories: [{ id: 'k', label: 'Animals' }],
        categorizeItems: [{ id: 'i', text: 'Lion', categoryId: 'k', imageUrl: IMG }],
    },
];

const test = (qs: TestQuestion[]): Test => ({
    id: 't',
    name: 'T',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: qs,
});

afterEach(() => vi.unstubAllGlobals());

describe('item pictures in the printed booklet', () => {
    it('prints a picture beside the item in the HTML booklet for all three types', () => {
        const html = buildExamBookletHtml(test(questions), DEFAULT_EXAM_EXPORT_OPTIONS);
        expect(html.match(new RegExp(`<img src="${IMG}" alt=""`, 'g'))).toHaveLength(3);
    });

    it('prints nothing for an unsafe picture URL', () => {
        const unsafe = questions.map((q) =>
            q.type === 'ordering'
                ? { ...q, orderItems: q.orderItems!.map((i) => ({ ...i, imageUrl: 'javascript:alert(1)' })) }
                : { ...q, matchingPairs: undefined, categorizeItems: undefined }
        );
        const html = buildExamBookletHtml(test(unsafe), DEFAULT_EXAM_EXPORT_OPTIONS);
        expect(html).not.toContain('javascript:');
        expect(html).not.toContain(`src="${IMG}"`);
    });

    it('embeds the pictures in the DOCX booklet, and still exports when one cannot be fetched', async () => {
        const booklet = async () => {
            saved.length = 0;
            await exportExamDocx(test(questions), {
                attachmentMode: 'inline',
                hotTextMirror: false,
                scanMarkers: false,
            });
            const zip = await JSZip.loadAsync(saved[0]);
            const name = Object.keys(zip.files).find((f) => f.endsWith('-booklet.docx'))!;
            const inner = await JSZip.loadAsync(await zip.files[name].async('arraybuffer'));
            return inner.files['word/document.xml'].async('string');
        };
        vi.stubGlobal(
            'createImageBitmap',
            vi.fn(async () => ({ width: 100, height: 50 }))
        );
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                blob: async () => ({ type: 'image/png', arrayBuffer: async () => new ArrayBuffer(8) }),
            }))
        );
        expect((await booklet()).match(/<w:drawing>/g)?.length).toBeGreaterThanOrEqual(3);

        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('offline');
            })
        );
        const withoutImages = await booklet();
        expect(withoutImages).not.toContain('<w:drawing>');
        expect(withoutImages).toContain('Seed');
    });

    it('converts a WebP picture to PNG so the DOCX booklet still shows it', async () => {
        const drawImage = vi.fn();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never);
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
            callback(new Blob([new Uint8Array(4)], { type: 'image/png' }))
        );
        vi.stubGlobal(
            'createImageBitmap',
            vi.fn(async () => ({ width: 100, height: 50 }))
        );
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ blob: async () => new Blob([new Uint8Array(4)], { type: 'image/webp' }) }))
        );
        saved.length = 0;
        await exportExamDocx(test(questions), { attachmentMode: 'inline', hotTextMirror: false, scanMarkers: false });
        const zip = await JSZip.loadAsync(saved[0]);
        const name = Object.keys(zip.files).find((f) => f.endsWith('-booklet.docx'))!;
        const inner = await JSZip.loadAsync(await zip.files[name].async('arraybuffer'));
        expect(drawImage).toHaveBeenCalled();
        expect(await inner.files['word/document.xml'].async('string')).toContain('<w:drawing>');
        expect(Object.keys(inner.files).some((f) => f.endsWith('.png'))).toBe(true);
    });
});
