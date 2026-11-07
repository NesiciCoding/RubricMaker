/**
 * pdfBlocks.ts
 * Turns a PDF into the neutral DocumentModel.
 *
 * A PDF has no paragraphs, only glyphs at coordinates, so "reading order" is reconstructed here: items
 * that share a baseline become one line, lines are ordered top to bottom, and each line keeps its left
 * edge and font size. That is the whole vocabulary the structure detector is allowed to see — it is
 * more than a PDF states and exactly what an OCR pass can also provide, which is why a scanned paper
 * can go through the same recogniser later.
 */

import {
    cleanDocumentText,
    DocumentReadError,
    type DocumentBlock,
    type DocumentModel,
    type DocumentParagraph,
} from './documentModel';

/** One positioned text run as the extractor sees it, measured from the page's top-left corner. */
export interface PdfTextItem {
    str: string;
    /** Left edge in PDF points. */
    x: number;
    /** Baseline distance from the top of the page in PDF points. */
    y: number;
    /** Width in points, when the extractor knows it — it decides whether two runs touch. */
    width?: number;
    /** Font size in points. */
    height: number;
    fontName?: string;
}

interface Line {
    y: number;
    x: number;
    height: number;
    fontName?: string;
    text: string;
}

/** A line's items are grouped when their baselines are this close, relative to the font size. */
const LINE_TOLERANCE = 0.55;
/**
 * Two runs on the same line are joined without a space when the gap between them is narrower than this
 * fraction of the font size. Kerning gaps are a fraction of a point; a real word space is ~0.25em, so
 * the threshold has to sit well below it or "is tall" comes back as "istall".
 */
const WORD_GAP = 0.12;

const BOLD_FONT = /\b(bold|black|heavy|semibold|demi)/i;

/** Font names spell emphasis in every way imaginable: Arial-BoldMT, F1Bold, HelveticaNeue-Heavy. */
function isBoldFont(fontName: string | undefined): boolean {
    return !!fontName && BOLD_FONT.test(fontName.replace(/[^a-z]+/gi, ' '));
}

function joinRuns(runs: PdfTextItem[]): string {
    let text = '';
    let previousEnd: number | undefined;
    let previousHeight = 0;
    for (const run of runs) {
        const gap = previousEnd === undefined ? undefined : run.x - previousEnd;
        const needsSpace =
            gap !== undefined &&
            gap > Math.max(0.6, previousHeight * WORD_GAP) &&
            !text.endsWith(' ') &&
            !run.str.startsWith(' ');
        text += needsSpace ? ` ${run.str}` : run.str;
        previousEnd = run.width !== undefined ? run.x + run.width : run.x;
        previousHeight = Math.max(previousHeight, run.height);
    }
    return text;
}

/** Groups one page's positioned runs into lines, in reading order. */
export function pdfItemsToLines(items: PdfTextItem[]): Line[] {
    const usable = items.filter((item) => item.str.trim().length > 0);
    const sorted = [...usable].sort((a, b) => a.y - b.y || a.x - b.x);
    const clusters: PdfTextItem[][] = [];
    for (const item of sorted) {
        const current = clusters[clusters.length - 1];
        const anchor = current?.[0];
        const tolerance = Math.max(2, Math.max(item.height, anchor?.height ?? 0) * LINE_TOLERANCE);
        if (current && anchor && Math.abs(item.y - anchor.y) <= tolerance) current.push(item);
        else clusters.push([item]);
    }
    return clusters.map((cluster) => {
        const ordered = [...cluster].sort((a, b) => a.x - b.x);
        const line: Line = {
            y: Math.min(...ordered.map((i) => i.y)),
            x: Math.min(...ordered.map((i) => i.x)),
            height: Math.max(...ordered.map((i) => i.height)),
            text: cleanDocumentText(joinRuns(ordered)),
        };
        const fontName = ordered.find((i) => i.fontName)?.fontName;
        if (fontName) line.fontName = fontName;
        return line;
    });
}

/**
 * Reduces positioned runs per page to paragraph blocks. Columns are not split here: a two-column exam
 * is read left-to-right per line, and the detector works from the left edge and the numbering rather
 * than from a column model it could get wrong silently.
 */
export function pdfPagesToBlocks(pages: PdfTextItem[][], pageCount = pages.length): DocumentModel {
    const blocks: DocumentBlock[] = [];
    pages.forEach((items, index) => {
        const page = index + 1;
        for (const line of pdfItemsToLines(items)) {
            if (!line.text) continue;
            const block: DocumentParagraph = { kind: 'paragraph', page, text: line.text, x: Math.round(line.x) };
            const size = Math.round(line.height * 10) / 10;
            if (size > 0) block.fontSizePt = size;
            if (isBoldFont(line.fontName)) block.bold = true;
            blocks.push(block);
        }
    });
    const model: DocumentModel = { source: 'pdf', pageCount, blocks };
    if (blocks.length === 0) {
        model.notes = [{ key: 'pdf_no_text_layer' }];
    }
    return model;
}

/** Reads every page's text layer through pdf.js; a scan without one comes back empty plus a note. */
export async function pdfToBlocks(data: ArrayBuffer | Uint8Array): Promise<DocumentModel> {
    const pdfjsLib = await import('pdfjs-dist');
    // Use the worker bundled with the app to avoid an external CDN dependency. Vite resolves this to
    // the hashed asset path at build time.
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

    let loadingTask: ReturnType<typeof pdfjsLib.getDocument>;
    try {
        loadingTask = pdfjsLib.getDocument({ data });
    } catch (err) {
        throw new DocumentReadError('unreadable', err instanceof Error ? err.message : String(err));
    }

    try {
        let pdf: { numPages: number; getPage: (n: number) => Promise<unknown> };
        try {
            pdf = (await loadingTask.promise) as unknown as typeof pdf;
        } catch (err) {
            throw new DocumentReadError('unreadable', err instanceof Error ? err.message : String(err));
        }

        const pages: PdfTextItem[][] = [];
        try {
            for (let index = 1; index <= pdf.numPages; index += 1) {
                const page = (await pdf.getPage(index)) as {
                    getViewport: (opts: { scale: number }) => { height: number };
                    getTextContent: () => Promise<{ items: unknown[] }>;
                };
                const height = page.getViewport({ scale: 1 }).height;
                const content = await page.getTextContent();
                const items: PdfTextItem[] = [];
                for (const raw of content.items) {
                    if (!raw || typeof raw !== 'object' || !('str' in raw)) continue;
                    const item = raw as {
                        str: string;
                        transform: number[];
                        width?: number;
                        height?: number;
                        fontName?: string;
                    };
                    const [, b, , d, e, f] = item.transform;
                    const size = Math.hypot(b, d) || item.height || 0;
                    items.push({
                        str: item.str,
                        x: e,
                        y: height - f,
                        width: item.width,
                        height: size,
                        fontName: item.fontName,
                    });
                }
                pages.push(items);
            }
        } catch (err) {
            if (err instanceof DocumentReadError) throw err;
            throw new DocumentReadError('unreadable', err instanceof Error ? err.message : String(err));
        }
        return pdfPagesToBlocks(pages, pdf.numPages);
    } finally {
        try {
            await loadingTask.destroy?.();
        } catch {
            // Worker cleanup is best-effort; extraction already succeeded or has its own error.
        }
    }
}
