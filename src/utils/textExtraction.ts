import DOMPurify from 'dompurify';
import type { Attachment } from '../types';
import { type PSM } from 'tesseract.js';
import { resolveOcrLanguages } from './ocrLanguage';
import { Oem, type CaptureHint, psmForCaptureHint } from './ocrConfig';

export class UnsupportedFormatError extends Error {
    constructor(mimeType: string) {
        super(
            `Cannot extract text from "${mimeType}" files. Supported: PDF, Word (.docx), plain text, HTML (essays), and images.`
        );
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
        const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
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

/**
 * Converts a .docx attachment to sanitized TipTap-loadable HTML (Mammoth's semantic
 * conversion, not extractFromDocx's plain-text one) for the shared read-only document view.
 */
export async function convertDocxToHtml(dataUrl: string): Promise<string> {
    const mammoth = await import('mammoth');
    const buffer = base64ToArrayBuffer(dataUrl);
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    return DOMPurify.sanitize(result.value);
}

function extractFromPlainText(dataUrl: string): string {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return atob(base64);
}

function extractFromHtml(dataUrl: string): string {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const html = decodeURIComponent(escape(atob(base64)));
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** One recognised word with its confidence in [0, 1] and pixel bounding box. */
export interface OcrWord {
    text: string;
    confidence: number;
    bbox?: { x0: number; y0: number; x1: number; y1: number };
}

/** Rich OCR result: the full text, mean per-word confidence in [0, 1], and per-word data. */
export interface OcrResult {
    text: string;
    confidence: number;
    words: OcrWord[];
}

export interface RecognizeImageOptions {
    /** UI locale(s) or tesseract code(s); resolved via `resolveOcrLanguages`. Defaults to English. */
    langs?: string | string[];
    /** What's being scanned; selects the page-segmentation mode. */
    captureHint?: CaptureHint;
    /** Explicit PSM override; wins over `captureHint` when set. */
    psm?: number;
}

/** Tesseract reports confidence 0–100; the app models it in [0, 1]. */
function toUnitConfidence(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.min(1, Math.max(0, value / 100));
}

interface RawWord {
    text?: string;
    confidence?: number;
    bbox?: { x0: number; y0: number; x1: number; y1: number };
}

interface RecognizeData {
    text?: string;
    confidence?: number;
    words?: RawWord[];
    blocks?: { paragraphs?: { lines?: { words?: RawWord[] }[] }[] }[] | null;
}

/** Collect per-word data from either the flat `words` shape or the nested `blocks` tree. */
function collectWords(data: RecognizeData): OcrWord[] {
    const raw: RawWord[] = [];
    if (Array.isArray(data.words) && data.words.length > 0) {
        raw.push(...data.words);
    } else if (Array.isArray(data.blocks)) {
        for (const block of data.blocks) {
            for (const paragraph of block.paragraphs ?? []) {
                for (const line of paragraph.lines ?? []) {
                    for (const word of line.words ?? []) raw.push(word);
                }
            }
        }
    }
    return raw.map((w) => ({
        text: w.text ?? '',
        confidence: toUnitConfidence(w.confidence),
        bbox: w.bbox,
    }));
}

/**
 * OCR an image data URL into text plus per-word confidence, keeping a human in the loop:
 * the confidence lets the review UI flag low-confidence spans. Uses the LSTM engine and a
 * capture-driven page-segmentation mode. `tesseract.js` is imported lazily so its WASM
 * payload stays out of routes that never OCR.
 */
export async function recognizeImage(dataUrl: string, opts: RecognizeImageOptions = {}): Promise<OcrResult> {
    const langs = resolveOcrLanguages(opts.langs);
    const psm = opts.psm ?? psmForCaptureHint(opts.captureHint);
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(langs, Oem.LSTM_ONLY);
    try {
        await worker.setParameters({ tessedit_pageseg_mode: psm as unknown as PSM });
        const { data } = (await worker.recognize(dataUrl, {}, { blocks: true })) as unknown as { data: RecognizeData };
        const words = collectWords(data);
        const meanWordConfidence =
            words.length > 0 ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length : undefined;
        return {
            text: data.text ?? '',
            confidence: meanWordConfidence ?? toUnitConfidence(data.confidence),
            words,
        };
    } finally {
        await worker.terminate();
    }
}

async function extractFromImage(dataUrl: string): Promise<string> {
    const { text } = await recognizeImage(dataUrl);
    return text;
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

    if (mimeType === 'text/html' || name.toLowerCase().endsWith('.html')) {
        onProgress?.(50, 'Reading text from essay…');
        const text = extractFromHtml(dataUrl);
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
