import { describe, it, expect, vi } from 'vitest';

const GlobalWorkerOptions = { workerSrc: '' };
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions }));

describe('loadPdfjs', () => {
    it('points pdf.js at the bundled worker instead of letting it fall back to a fake worker', async () => {
        const { loadPdfjs } = await import('./pdfjsWorker');
        const lib = await loadPdfjs();
        expect(lib.GlobalWorkerOptions).toBe(GlobalWorkerOptions);
        expect(GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min\.mjs/);
    });
});
