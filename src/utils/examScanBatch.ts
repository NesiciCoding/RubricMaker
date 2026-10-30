/**
 * Pure grouping/validation helpers for batch answer-sheet ingestion. Kept separate from the modal
 * so the page → student bookkeeping (which is where a multi-page batch can silently go wrong) is
 * unit-testable without rendering anything.
 */

export interface ScannedPageLike {
    id: string;
    /** Empty when the teacher has not assigned this page yet. */
    studentId: string;
    /** Page count recorded in the sheet's QR code, when it was read. */
    qrPageCount?: number;
}

export interface StudentPageGroup<T extends ScannedPageLike> {
    studentId: string;
    /** Pages in scan order; the index in this list is the student's printed page number - 1. */
    pages: T[];
}

/** Group assigned pages by student, preserving first-appearance order of both students and pages. */
export function groupPagesByStudent<T extends ScannedPageLike>(pages: T[]): StudentPageGroup<T>[] {
    const groups = new Map<string, T[]>();
    for (const page of pages) {
        if (!page.studentId) continue;
        const list = groups.get(page.studentId);
        if (list) list.push(page);
        else groups.set(page.studentId, [page]);
    }
    return [...groups.entries()].map(([studentId, groupedPages]) => ({ studentId, pages: groupedPages }));
}

export function unassignedPages<T extends ScannedPageLike>(pages: T[]): T[] {
    return pages.filter((page) => !page.studentId);
}

export interface PageCountMismatch {
    studentId: string;
    expected: number;
    actual: number;
}

/**
 * Students whose scanned page count disagrees with the page count printed in the QR payload.
 * Detection can still proceed (pages are read in order), but the teacher should check that no page
 * was missed or double-scanned.
 */
export function pageCountMismatches<T extends ScannedPageLike>(groups: StudentPageGroup<T>[]): PageCountMismatch[] {
    const mismatches: PageCountMismatch[] = [];
    for (const group of groups) {
        const expected = group.pages.find((page) => page.qrPageCount !== undefined)?.qrPageCount;
        if (expected !== undefined && expected !== group.pages.length) {
            mismatches.push({ studentId: group.studentId, expected, actual: group.pages.length });
        }
    }
    return mismatches;
}
