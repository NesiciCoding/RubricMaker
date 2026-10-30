/**
 * Decodes the QR code printed in an answer sheet's scan-marker band, so a batch of scanned pages
 * can be grouped per student without the teacher picking a name for every page. The payload is an
 * identifier only (see answerSheetQrPayload in testExamContent.ts): the decoded `studentId` is a
 * prefilled suggestion the teacher can override, never proof that the student handed the sheet in.
 */

import type { RgbaImage } from '../types';
import { EXAM_PAGE_MM, SCAN_QR_INSET_MM, SCAN_QR_SIZE_MM } from './testExamContent';
import { cropRegion, mmRectToPixelRect } from './examScanRegions';

export interface AnswerSheetQrIdentity {
    testId: string;
    studentId?: string;
    /** Total printed pages of this student's sheet, when the export recorded it. */
    pages?: number;
}

/** Raw QR text from an RGBA image, or null when there is no readable code. */
export async function decodeQr(image: RgbaImage): Promise<string | null> {
    if (image.width <= 0 || image.height <= 0) return null;
    // The decoder is only needed while assigning scanned pages, so keep it out of the Tests route chunk.
    const { default: jsQR } = await import('jsqr');
    const result = jsQR(new Uint8ClampedArray(image.data), image.width, image.height, {
        inversionAttempts: 'attemptBoth',
    });
    return result?.data ?? null;
}

/** Validate and normalise an answer-sheet QR payload; null for anything that isn't one. */
export function parseAnswerSheetQr(raw: string | null | undefined): AnswerSheetQrIdentity | null {
    if (!raw) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const payload = parsed as Record<string, unknown>;
    if (payload.sheetType !== 'answer' || typeof payload.testId !== 'string' || !payload.testId) return null;

    const identity: AnswerSheetQrIdentity = { testId: payload.testId };
    if (typeof payload.studentId === 'string' && payload.studentId) identity.studentId = payload.studentId;
    if (typeof payload.pages === 'number' && Number.isFinite(payload.pages) && payload.pages > 0) {
        identity.pages = Math.floor(payload.pages);
    }
    return identity;
}

/**
 * Read the answer-sheet QR from a page image that has already been cropped to the physical A4 page.
 * Tries the printed QR position first (fast and unambiguous), then the whole page as a fallback for
 * sheets where the crop is slightly off.
 */
export async function decodeAnswerSheetQr(pageImage: RgbaImage): Promise<AnswerSheetQrIdentity | null> {
    const qrRect = {
        x: EXAM_PAGE_MM.width - SCAN_QR_INSET_MM - SCAN_QR_SIZE_MM,
        y: EXAM_PAGE_MM.height - SCAN_QR_INSET_MM - SCAN_QR_SIZE_MM,
        width: SCAN_QR_SIZE_MM,
        height: SCAN_QR_SIZE_MM,
    };
    const crop = cropRegion(pageImage, mmRectToPixelRect(qrRect, pageImage.width, pageImage.height));
    return parseAnswerSheetQr(await decodeQr(crop)) ?? parseAnswerSheetQr(await decodeQr(pageImage));
}
