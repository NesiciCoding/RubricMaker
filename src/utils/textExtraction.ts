import type { Attachment } from '../types';

export class UnsupportedFormatError extends Error {
    constructor(mimeType: string) {
        super(`Cannot extract text from "${mimeType}" files. Supported: PDF, Word (.docx), plain text, and images.`);
        this.name = 'UnsupportedFormatError';
    }
}

function base64ToArrayBuffer(dataUrl: string): ArrayBuffer {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

async function extractFromPdf(dataUrl: string): Promise<string> {
    const pdfjsLib = await import('pdfjs-dist');
    // Use the worker bundled with the app to avoid an external CDN dependency.
    // Vite resolves '?worker&url' to the hashed asset path at build time.
    const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

    const buffer = base64ToArrayBuffer(dataUrl);
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => ('str' in item ? item.str : '')).join(' ');
        pages.push(text);
    }

    return pages.join('\n\n');
}

async function extractFromDocx(dataUrl: string): Promise<string> {
    const mammoth = await import('mammoth');
    const buffer = base64ToArrayBuffer(dataUrl);
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
}

function extractFromPlainText(dataUrl: string): string {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return atob(base64);
}

async function extractFromImage(dataUrl: string): Promise<string> {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    try {
        const { data } = await worker.recognize(dataUrl);
        return data.text;
    } finally {
        await worker.terminate();
    }
}

export async function extractText(
    attachment: Attachment,
    onProgress?: (pct: number, status: string) => void
): Promise<string> {
    const { mimeType, dataUrl, name } = attachment;

    onProgress?.(5, 'Reading file…');

    if (mimeType === 'application/pdf') {
        onProgress?.(20, 'Extracting text from PDF…');
        const text = await extractFromPdf(dataUrl);
        onProgress?.(100, 'Done');
        return text;
    }

    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        name.toLowerCase().endsWith('.docx')
    ) {
        onProgress?.(20, 'Extracting text from Word document…');
        const text = await extractFromDocx(dataUrl);
        onProgress?.(100, 'Done');
        return text;
    }

    if (mimeType === 'text/plain' || name.toLowerCase().endsWith('.txt')) {
        onProgress?.(50, 'Reading plain text…');
        const text = extractFromPlainText(dataUrl);
        onProgress?.(100, 'Done');
        return text;
    }

    if (mimeType.startsWith('image/')) {
        onProgress?.(10, 'Loading OCR engine…');
        const text = await extractFromImage(dataUrl);
        onProgress?.(100, 'Done');
        return text;
    }

    // Audio/video: not supported — caller should offer transcript paste
    if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
        throw new UnsupportedFormatError(mimeType);
    }

    throw new UnsupportedFormatError(mimeType);
}
