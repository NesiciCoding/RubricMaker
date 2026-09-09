import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getPage = vi.fn();
const getDocument = vi.fn();

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: (...args: unknown[]) => getDocument(...args),
}));

import { isScannableImage, isScannablePdf, rasterizePdf, importScanFiles } from '../scanImport';

function imageFile(name = 'photo.png', type = 'image/png'): File {
    return new File(['bytes'], name, { type });
}

function pdfFile(name = 'scan.pdf'): File {
    const file = new File(['%PDF'], name, { type: 'application/pdf' });
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(4));
    return file;
}

function mockPdf(numPages: number) {
    getPage.mockImplementation(async () => ({
        getViewport: () => ({ width: 100, height: 200 }),
        render: () => ({ promise: Promise.resolve() }),
    }));
    getDocument.mockReturnValue({ promise: Promise.resolve({ numPages, getPage }) });
}

let getContextSpy: ReturnType<typeof vi.spyOn>;
let toBlobSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    getContextSpy = vi
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
        this: HTMLCanvasElement,
        cb: BlobCallback
    ) {
        cb(new Blob(['page'], { type: 'image/png' }));
    });
});

afterEach(() => {
    getContextSpy.mockRestore();
    toBlobSpy.mockRestore();
    getPage.mockReset();
    getDocument.mockReset();
});

describe('file predicates', () => {
    it('recognises image files', () => {
        expect(isScannableImage(imageFile('a.jpg', 'image/jpeg'))).toBe(true);
        expect(isScannableImage(pdfFile())).toBe(false);
    });

    it('recognises PDFs by mime type or extension', () => {
        expect(isScannablePdf(pdfFile())).toBe(true);
        expect(isScannablePdf(new File([''], 'x.PDF', { type: '' }))).toBe(true);
        expect(isScannablePdf(imageFile())).toBe(false);
    });
});

describe('rasterizePdf', () => {
    it('renders one image per page', async () => {
        mockPdf(3);
        const images = await rasterizePdf(pdfFile());
        expect(images).toHaveLength(3);
        expect(images.map((i) => i.pageIndex)).toEqual([0, 1, 2]);
        expect(images[0].sourceName).toBe('scan.pdf');
        expect(images[0].mimeType).toBe('image/png');
    });
});

describe('importScanFiles', () => {
    it('passes image files through unchanged', async () => {
        const { images, skipped } = await importScanFiles([imageFile('essay.jpg', 'image/jpeg')]);
        expect(skipped).toEqual([]);
        expect(images).toHaveLength(1);
        expect(images[0].mimeType).toBe('image/jpeg');
        expect(images[0].pageIndex).toBeUndefined();
    });

    it('expands a PDF into per-page images', async () => {
        mockPdf(2);
        const { images } = await importScanFiles([pdfFile()]);
        expect(images).toHaveLength(2);
    });

    it('skips unsupported files with a reason', async () => {
        const { images, skipped } = await importScanFiles([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
        expect(images).toEqual([]);
        expect(skipped).toEqual([{ name: 'notes.txt', reason: 'unsupported-type' }]);
    });

    it('reports a PDF whose render throws', async () => {
        getDocument.mockReturnValue({ promise: Promise.reject(new Error('bad pdf')) });
        const { images, skipped } = await importScanFiles([pdfFile('broken.pdf')]);
        expect(images).toEqual([]);
        expect(skipped).toEqual([{ name: 'broken.pdf', reason: 'pdf-render-failed' }]);
    });

    it('handles a mix of images, PDFs, and junk in one call', async () => {
        mockPdf(1);
        const { images, skipped } = await importScanFiles([
            imageFile('a.png'),
            pdfFile('b.pdf'),
            new File(['x'], 'c.txt', { type: 'text/plain' }),
        ]);
        expect(images).toHaveLength(2);
        expect(skipped).toEqual([{ name: 'c.txt', reason: 'unsupported-type' }]);
    });
});
