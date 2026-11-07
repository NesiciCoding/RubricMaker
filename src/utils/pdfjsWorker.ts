import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfjsModule = typeof import('pdfjs-dist');

/**
 * The build emits the worker with a `.js` extension (see `assetFileNames` in vite.config.ts):
 * servers whose MIME table lacks `.mjs` answer `application/octet-stream`, which browsers refuse
 * for module workers, and pdf.js then falls back to a "fake worker" that fails the same way.
 */
export async function loadPdfjs(): Promise<PdfjsModule> {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    return pdfjsLib;
}
