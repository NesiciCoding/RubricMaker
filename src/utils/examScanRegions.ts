/**
 * Maps the approximate mm geometry from `answerSheetGeometry()` (testExamContent.ts) onto pixel
 * regions of a scanned, perspective-corrected answer sheet (see documentCrop.ts), so a future
 * exam-scan pipeline can isolate one question's answer at a time instead of OCRing the whole page.
 *
 * Multiple-choice/true-false bubbles are detected by ink coverage, not OCR: each bubble already
 * has its option letter pre-printed on the sheet, so reading that letter back with Tesseract would
 * just report the printed option regardless of which one the student actually marked. This is
 * optical mark recognition (OMR) — comparing how much ink is inside each cell — not text
 * recognition.
 *
 * `answerSheetGeometry()` assumes a single continuous top-to-bottom flow with no page breaks, so
 * its y-positions only correspond to real scanned pixels while the whole sheet fits on one page;
 * `answerSheetFitsOnOnePage()` gates that assumption instead of silently cropping the wrong page.
 */

import type { RgbaImage } from '../types';
import { luminance } from './preprocessScan';
import { EXAM_PAGE_MM, CHOICE_CELL_WIDTH_MM, type AnswerBlockGeometry } from './testExamContent';

/** Horizontal gap between adjacent choice-bubble cells, in mm. */
export const CHOICE_CELL_GAP_MM = 4;

export interface MmRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PixelRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Whether an answer sheet's estimated geometry can be trusted to crop precise regions out of a
 * scanned image. Once the estimated content runs past one page, the flow-based `y` values stop
 * corresponding to any single scanned page — callers should fall back to whole-page OCR instead
 * of cropping when this returns false.
 */
export function answerSheetFitsOnOnePage(blocks: AnswerBlockGeometry[]): boolean {
    const last = blocks[blocks.length - 1];
    if (!last) return true;
    return last.y + last.height <= EXAM_PAGE_MM.height - EXAM_PAGE_MM.margin;
}

/** Per-letter bubble cells within a 'choice' block's mm box, evenly spaced left-to-right. */
export function choiceCellRects(block: AnswerBlockGeometry): { letter: string; rect: MmRect }[] {
    const letters = block.space.optionLetters ?? [];
    return letters.map((letter, i) => ({
        letter,
        rect: {
            x: block.x + i * (CHOICE_CELL_WIDTH_MM + CHOICE_CELL_GAP_MM),
            y: block.y,
            width: CHOICE_CELL_WIDTH_MM,
            height: CHOICE_CELL_WIDTH_MM,
        },
    }));
}

/**
 * Maps an mm rect on the EXAM_PAGE_MM page to pixel coordinates on a scanned image, assuming the
 * image has already been perspective-corrected/cropped to the physical A4 page bounds.
 */
export function mmRectToPixelRect(rect: MmRect, imageWidthPx: number, imageHeightPx: number): PixelRect {
    const scaleX = imageWidthPx / EXAM_PAGE_MM.width;
    const scaleY = imageHeightPx / EXAM_PAGE_MM.height;
    return {
        x: Math.round(rect.x * scaleX),
        y: Math.round(rect.y * scaleY),
        width: Math.round(rect.width * scaleX),
        height: Math.round(rect.height * scaleY),
    };
}

/** Crop a pixel rect out of an image, clamped to the image's bounds. */
export function cropRegion(img: RgbaImage, rect: PixelRect): RgbaImage {
    const x0 = Math.max(0, Math.min(rect.x, img.width));
    const y0 = Math.max(0, Math.min(rect.y, img.height));
    const x1 = Math.max(x0, Math.min(rect.x + rect.width, img.width));
    const y1 = Math.max(y0, Math.min(rect.y + rect.height, img.height));
    const w = x1 - x0;
    const h = y1 - y0;
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const srcIdx = ((y0 + y) * img.width + (x0 + x)) * 4;
            const dstIdx = (y * w + x) * 4;
            out[dstIdx] = img.data[srcIdx];
            out[dstIdx + 1] = img.data[srcIdx + 1];
            out[dstIdx + 2] = img.data[srcIdx + 2];
            out[dstIdx + 3] = img.data[srcIdx + 3];
        }
    }
    return { data: out, width: w, height: h };
}

/** Crop a non-choice answer block's region out of the scanned page, for isolated per-question OCR instead of OCRing the whole page. */
export function cropAnswerBlock(pageImage: RgbaImage, block: AnswerBlockGeometry): RgbaImage {
    const rect = mmRectToPixelRect(
        { x: block.x, y: block.y, width: block.width, height: block.height },
        pageImage.width,
        pageImage.height
    );
    return cropRegion(pageImage, rect);
}

/** Fraction of pixels darker than `threshold` (0-255 luminance) — a filled/circled bubble has much higher ink coverage than an empty printed circle outline. */
export function inkCoverage(img: RgbaImage, threshold = 160): number {
    const count = img.width * img.height;
    if (count === 0) return 0;
    const d = img.data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) {
        if (luminance(d[i], d[i + 1], d[i + 2]) < threshold) dark++;
    }
    return dark / count;
}

export interface ChoiceDetectionOptions {
    /** Minimum ink coverage for a bubble to count as marked, in [0,1]. */
    markThreshold?: number;
    /** Luminance below which a pixel counts as "ink" (0-255). */
    inkThreshold?: number;
}

/**
 * Detects which bubble(s) are marked in a 'choice' answer block by comparing ink coverage across
 * each option's cell — single-select questions return at most the darkest cell above the
 * threshold, multi-select (multiple-response) questions return every cell above it.
 */
export function detectChoiceAnswer(
    pageImage: RgbaImage,
    block: AnswerBlockGeometry,
    opts: ChoiceDetectionOptions = {}
): string[] {
    const markThreshold = opts.markThreshold ?? 0.25;
    const cells = choiceCellRects(block);
    if (cells.length === 0) return [];

    const coverages = cells.map(({ letter, rect }) => ({
        letter,
        coverage: inkCoverage(
            cropRegion(pageImage, mmRectToPixelRect(rect, pageImage.width, pageImage.height)),
            opts.inkThreshold
        ),
    }));

    if (block.space.multiSelect) {
        return coverages.filter((c) => c.coverage >= markThreshold).map((c) => c.letter);
    }
    const best = coverages.reduce((a, b) => (b.coverage > a.coverage ? b : a));
    return best.coverage >= markThreshold ? [best.letter] : [];
}
