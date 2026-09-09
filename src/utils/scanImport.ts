/**
 * Turns files a teacher picks (photos, or a scanned PDF) into one or more image blobs
 * ready for OCR. Image files pass through as-is; PDFs are rendered page-by-page to
 * images via pdfjs, since a scanned PDF has no text layer to extract. The bytes are
 * handed to scanStore by the caller — nothing here touches storage or state.
 */

export interface ScanImage {
    blob: Blob;
    mimeType: string;
    /** Originating file name, for display and provenance. */
    sourceName: string;
    /** 0-based page index when the source was a multi-page PDF. */
    pageIndex?: number;
}

export interface SkippedFile {
    name: string;
    reason: string;
}

export interface ImportScanResult {
    images: ScanImage[];
    skipped: SkippedFile[];
}

export interface RasterizePdfOptions {
    /** Render scale; higher = more detail for OCR at the cost of size. */
    scale?: number;
    mimeType?: string;
    quality?: number;
}

export function isScannableImage(file: File): boolean {
    return file.type.startsWith('image/');
}

export function isScannablePdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
}

/** Render each page of a PDF to an image blob. */
export async function rasterizePdf(file: File, opts: RasterizePdfOptions = {}): Promise<ScanImage[]> {
    const { scale = 2, mimeType = 'image/png', quality } = opts;
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const images: ScanImage[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        const blob = await canvasToBlob(canvas, mimeType, quality);
        if (blob) images.push({ blob, mimeType, sourceName: file.name, pageIndex: i - 1 });
    }
    return images;
}

/** Convert a mixed set of picked files into scannable images, reporting anything unusable. */
export async function importScanFiles(
    files: FileList | File[],
    opts: RasterizePdfOptions = {}
): Promise<ImportScanResult> {
    const images: ScanImage[] = [];
    const skipped: SkippedFile[] = [];

    for (const file of Array.from(files)) {
        if (isScannableImage(file)) {
            images.push({ blob: file, mimeType: file.type, sourceName: file.name });
        } else if (isScannablePdf(file)) {
            try {
                const pages = await rasterizePdf(file, opts);
                if (pages.length === 0) skipped.push({ name: file.name, reason: 'no-pages' });
                images.push(...pages);
            } catch {
                skipped.push({ name: file.name, reason: 'pdf-render-failed' });
            }
        } else {
            skipped.push({ name: file.name, reason: 'unsupported-type' });
        }
    }

    return { images, skipped };
}
