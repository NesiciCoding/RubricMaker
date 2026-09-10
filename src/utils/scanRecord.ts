/**
 * Building the persisted `Scan` record when the teacher confirms an OCR draft, and the
 * discard-after-OCR decision. Per the phase's privacy posture, the image blob is discarded
 * once its text is confirmed unless `settings.keepImage` is on — so the record never carries
 * image bytes (only the recognised text, confidence, and links), and the caller is told
 * whether to drop the blob from `scanStore`.
 *
 * Pure and storage-free: the caller performs the actual scanStore/state writes and blob
 * deletion using the returned record and `discardImage` flag.
 */

import type { AcademicYear, Scan, ScanOcrSettings } from '../types';
import type { OcrResult } from './textExtraction';

export interface BuildScanRecordInput {
    id: string;
    studentId?: string;
    rubricId?: string;
    /** Confirmed transcription (teacher-edited); becomes `Scan.ocrText`. */
    ocrText: string;
    /** Mean per-word confidence in [0, 1] from recognition, if available. */
    ocrConfidence?: number;
    lang?: string;
    schoolYear: AcademicYear;
    /** ISO timestamp; defaults to now. Pass explicitly for deterministic results. */
    createdAt?: string;
}

export function buildScanRecord(input: BuildScanRecordInput): Scan {
    return {
        id: input.id,
        studentId: input.studentId,
        rubricId: input.rubricId,
        ocrText: input.ocrText,
        ocrConfidence: input.ocrConfidence,
        lang: input.lang,
        schoolYear: input.schoolYear,
        createdAt: input.createdAt ?? new Date().toISOString(),
        synced: false,
    };
}

export interface FinalizeScanReviewInput {
    id: string;
    studentId?: string;
    rubricId?: string;
    /** The teacher-corrected text at confirm time. */
    editedText: string;
    /** The recognition result, for its confidence and language. */
    result: OcrResult;
    lang?: string;
    schoolYear: AcademicYear;
    settings: ScanOcrSettings;
    createdAt?: string;
}

export interface FinalizedScanReview {
    scan: Scan;
    discardImage: boolean;
}

/**
 * Resolve a confirmed review into the record to persist and whether to discard the image.
 * The edited text wins over the raw OCR text; confidence is carried from the result as
 * provenance. `discardImage` is the negation of `keepImage`.
 */
export function finalizeScanReview(input: FinalizeScanReviewInput): FinalizedScanReview {
    const scan = buildScanRecord({
        id: input.id,
        studentId: input.studentId,
        rubricId: input.rubricId,
        ocrText: input.editedText,
        ocrConfidence: input.result.confidence,
        lang: input.lang,
        schoolYear: input.schoolYear,
        createdAt: input.createdAt,
    });
    return { scan, discardImage: !input.settings.keepImage };
}
