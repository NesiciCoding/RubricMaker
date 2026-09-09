import type { AcademicYear } from '../types';

/**
 * Month (1-indexed) a new academic year begins on. August matches the Dutch/EU
 * convention: dates on or after 1 August belong to the year that starts then.
 */
export const ACADEMIC_YEAR_CUTOVER_MONTH = 8;

/** The academic year a date falls in, as `YYYY-YYYY` (e.g. `'2026-2027'`). */
export function getAcademicYear(date: Date = new Date(), cutoverMonth = ACADEMIC_YEAR_CUTOVER_MONTH): AcademicYear {
    const year = date.getFullYear();
    const startYear = date.getMonth() + 1 >= cutoverMonth ? year : year - 1;
    return `${startYear}-${startYear + 1}`;
}

/** Start year of an `AcademicYear`, or NaN if it isn't in `YYYY-YYYY` form. */
export function academicYearStart(ay: AcademicYear): number {
    return Number.parseInt(ay.slice(0, 4), 10);
}

/** The academic year immediately before `ay` (e.g. `'2026-2027'` → `'2025-2026'`). */
export function previousAcademicYear(ay: AcademicYear): AcademicYear {
    const start = academicYearStart(ay) - 1;
    return `${start}-${start + 1}`;
}

/** Negative if `a` starts before `b`, positive if after, 0 if the same year. */
export function compareAcademicYear(a: AcademicYear, b: AcademicYear): number {
    return academicYearStart(a) - academicYearStart(b);
}

/**
 * Whether a scan stamped with `ay` is past the one-year retention cap relative to
 * `current` — i.e. it belongs to any academic year before the current one.
 */
export function isBeyondRetention(ay: AcademicYear, current: AcademicYear = getAcademicYear()): boolean {
    return compareAcademicYear(ay, current) < 0;
}
