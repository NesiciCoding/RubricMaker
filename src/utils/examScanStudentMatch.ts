/**
 * Student matching for pages without a readable QR code. The answer sheet prints the candidate
 * name at the top (personalised exports) or a blank line (blank sheets); OCRing that header and
 * matching it against the roster gives the teacher a suggestion to confirm rather than forcing a
 * manual pick for every page.
 */

import type { RgbaImage } from '../types';
import { cropRegion, mmRectToPixelRect } from './examScanRegions';
import { EXAM_PAGE_MM } from './testExamContent';

/** Height of the header region that contains the printed candidate name, in mm. */
export const ANSWER_SHEET_NAME_REGION_MM = 90;

/** Crop the top of an A4 answer-sheet page, where the candidate name is printed. */
export function cropAnswerSheetNameRegion(pageImage: RgbaImage): RgbaImage {
    return cropRegion(
        pageImage,
        mmRectToPixelRect(
            { x: 0, y: 0, width: EXAM_PAGE_MM.width, height: ANSWER_SHEET_NAME_REGION_MM },
            pageImage.width,
            pageImage.height
        )
    );
}

function normalize(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * Pick the roster student whose name appears in the OCR text. Full-name matches win; when exactly
 * one student's surname appears, that is used too (students often initial their first name).
 * Ambiguous matches return undefined so the teacher stays in control.
 */
export function matchStudentByName(ocrText: string, students: { id: string; name: string }[]): string | undefined {
    const haystack = ` ${normalize(ocrText)} `;
    if (haystack.trim() === '') return undefined;

    const fullMatches = students.filter((s) => {
        const name = normalize(s.name);
        return name.length > 2 && haystack.includes(` ${name} `);
    });
    if (fullMatches.length === 1) return fullMatches[0].id;
    if (fullMatches.length > 1) return undefined;

    const allSurnames = students.map((s) => ({ id: s.id, surname: normalize(s.name).split(' ').pop() ?? '' }));
    const surnameMatches = allSurnames.filter((s) => s.surname.length >= 3 && haystack.includes(` ${s.surname} `));
    const uniqueIds = new Set(surnameMatches.map((s) => s.id));
    return uniqueIds.size === 1 ? surnameMatches[0].id : undefined;
}
