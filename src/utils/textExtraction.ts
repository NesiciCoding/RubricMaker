import DOMPurify from 'dompurify';
import type { Attachment } from '../types';
import { type PSM } from 'tesseract.js';
import { resolveOcrLanguages } from './ocrLanguage';
import { OcrUnavailableError } from './ocrErrors';
import { Oem, type CaptureHint, psmForCaptureHint, buildUserWords, buildUserPatterns } from './ocrConfig';
import { loadPdfjs } from './pdfjsWorker';

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
    const pdfjsLib = await loadPdfjs();

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
    /** Explicit Tesseract PSM override; wins over `captureHint` when set. */
    psm?: PSM;
    /** Domain words (rubric vocabulary, class roster names) to bias recognition toward. */
    userWords?: Iterable<string>;
    /** Domain regex-free patterns (Tesseract `user_patterns` syntax) to bias recognition toward. */
    userPatterns?: Iterable<string>;
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

type TesseractModule = typeof import('tesseract.js');
type TesseractWorker = Awaited<ReturnType<TesseractModule['createWorker']>>;

/** Lazily imports tesseract.js and creates a worker — the one engine-load point shared by a
 *  one-shot recognizeImage() call and a reused OcrSession. */
async function loadTesseractWorker(langs: string): Promise<{ tesseract: TesseractModule; worker: TesseractWorker }> {
    try {
        const tesseract = await import('tesseract.js');
        const worker = await tesseract.createWorker(langs, Oem.LSTM_ONLY);
        return { tesseract, worker };
    } catch (err) {
        throw new OcrUnavailableError(err);
    }
}

/** Tracks the dictionary last seeded onto a worker, keyed by its exact words+patterns content, so
 *  a shared OcrSession doesn't pay reinitialize()'s cost again when consecutive calls seed the
 *  same vocabulary (e.g. every block of the same exam reusing examAnswerVocabulary(test)). */
interface DictState {
    key: string;
}

/** The dictKey computed below for "no words, no patterns" — the state a freshly-created worker
 *  is already in, so a DictState must start here, not at '', to avoid an unnecessary reinitialize
 *  on the very first call when nothing was ever seeded. */
const NO_DICT_KEY = '\u0000';

/** Runs one recognition on an already-created worker — the shared core of recognizeImage() and
 *  OcrSession.recognize(), so a batch can reuse one worker without duplicating this logic.
 *  `dict` is omitted for the one-shot recognizeImage() path (a fresh worker has no prior seed to
 *  compare against); OcrSession threads one shared DictState through every recognize() call. */
async function recognizeWithWorker(
    worker: TesseractWorker,
    tesseract: TesseractModule,
    langs: string,
    dataUrl: string,
    opts: Omit<RecognizeImageOptions, 'langs'>,
    dict: DictState = { key: NO_DICT_KEY }
): Promise<OcrResult> {
    const psm = opts.psm ?? tesseract.PSM[psmForCaptureHint(opts.captureHint)];
    // Dictionary seeding needs Tesseract's Init()-time config, so it can only take effect via
    // reinitialize() after the worker's first load — setParameters silently ignores
    // user_words_suffix/user_patterns_suffix/load_*_dawg (they're init-only members).
    const userWordsText = buildUserWords(opts.userWords ?? []);
    const userPatternsText = buildUserPatterns(opts.userPatterns ?? []);
    const dictKey = `${userWordsText}\u0000${userPatternsText}`;
    if (dictKey !== dict.key) {
        dict.key = dictKey;
        if (userWordsText || userPatternsText) {
            const primaryLang = (Array.isArray(langs) ? langs[0] : langs).split('+')[0];
            // Keep the standard dictionaries on: user words/patterns are meant to *supplement*
            // recognition, not replace it — disabling load_system_dawg/load_freq_dawg is for
            // code/identifier-heavy text and would hurt recognition of ordinary student prose.
            const config: Record<string, string> = { load_system_dawg: '1', load_freq_dawg: '1' };
            if (userWordsText) {
                await worker.writeText(`${primaryLang}.user-words`, userWordsText);
                config.user_words_suffix = 'user-words';
            }
            if (userPatternsText) {
                await worker.writeText(`${primaryLang}.user-patterns`, userPatternsText);
                config.user_patterns_suffix = 'user-patterns';
            }
            await worker.reinitialize(langs, Oem.LSTM_ONLY, config);
        } else {
            // A later call on the same session dropped the words/patterns a previous call seeded —
            // restore the plain, unseeded engine state rather than leaving the old dictionary active.
            await worker.reinitialize(langs, Oem.LSTM_ONLY);
        }
    }
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = (await worker.recognize(dataUrl, {}, { blocks: true })) as unknown as { data: RecognizeData };
    const words = collectWords(data);
    const meanWordConfidence =
        words.length > 0 ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length : undefined;
    return {
        text: data.text ?? '',
        confidence: meanWordConfidence ?? toUnitConfidence(data.confidence),
        words,
    };
}

/**
 * OCR an image data URL into text plus per-word confidence, keeping a human in the loop:
 * the confidence lets the review UI flag low-confidence spans. Uses the LSTM engine and a
 * capture-driven page-segmentation mode. `tesseract.js` is imported lazily so its WASM
 * payload stays out of routes that never OCR.
 *
 * One-shot: creates and tears down its own worker. A caller OCR-ing several images in the same
 * batch (a multi-page scan, a class of answer sheets) should use `createOcrSession()` instead —
 * re-creating the engine (and reloading its language data) per image is the expensive part.
 */
export async function recognizeImage(dataUrl: string, opts: RecognizeImageOptions = {}): Promise<OcrResult> {
    const langs = resolveOcrLanguages(opts.langs);
    const { tesseract, worker } = await loadTesseractWorker(langs);
    try {
        return await recognizeWithWorker(worker, tesseract, langs, dataUrl, opts);
    } finally {
        await worker.terminate();
    }
}

/** A Tesseract engine instance kept alive across several recognize() calls — see recognizeImage()'s doc. */
export interface OcrSession {
    recognize(dataUrl: string, opts?: Omit<RecognizeImageOptions, 'langs'>): Promise<OcrResult>;
    terminate(): Promise<void>;
}

/**
 * Opens one OCR session for a batch of images sharing the same language(s) — a multi-page scan,
 * a class of answer sheets. Reuses one Tesseract worker across every `recognize()` call instead
 * of re-initializing the engine per image, so a caller must terminate() it once the batch is done
 * (a `try`/`finally` around the batch loop, same as any other resource with manual cleanup).
 */
export async function createOcrSession(langs?: RecognizeImageOptions['langs']): Promise<OcrSession> {
    const resolvedLangs = resolveOcrLanguages(langs);
    const { tesseract, worker } = await loadTesseractWorker(resolvedLangs);
    const dict: DictState = { key: NO_DICT_KEY };
    return {
        recognize: (dataUrl, opts = {}) => recognizeWithWorker(worker, tesseract, resolvedLangs, dataUrl, opts, dict),
        terminate: async () => {
            await worker.terminate();
        },
    };
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
