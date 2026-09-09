import { describe, it, expect } from 'vitest';
import {
    getAcademicYear,
    academicYearStart,
    previousAcademicYear,
    compareAcademicYear,
    isBeyondRetention,
} from './academicYear';

describe('getAcademicYear', () => {
    it('places a date on or after the August cutover in the year that starts then', () => {
        expect(getAcademicYear(new Date('2026-08-01T00:00:00Z'))).toBe('2026-2027');
        expect(getAcademicYear(new Date('2026-12-31T00:00:00Z'))).toBe('2026-2027');
    });

    it('places a date before the cutover in the prior-starting year', () => {
        expect(getAcademicYear(new Date('2026-07-31T00:00:00Z'))).toBe('2025-2026');
        expect(getAcademicYear(new Date('2026-01-01T00:00:00Z'))).toBe('2025-2026');
    });

    it('honours a custom cutover month', () => {
        expect(getAcademicYear(new Date('2026-09-01T00:00:00Z'), 9)).toBe('2026-2027');
        expect(getAcademicYear(new Date('2026-08-31T00:00:00Z'), 9)).toBe('2025-2026');
    });
});

describe('academicYearStart', () => {
    it('parses the start year', () => {
        expect(academicYearStart('2026-2027')).toBe(2026);
    });

    it('is NaN for a malformed value', () => {
        expect(Number.isNaN(academicYearStart('not-a-year'))).toBe(true);
    });
});

describe('previousAcademicYear', () => {
    it('returns the year before', () => {
        expect(previousAcademicYear('2026-2027')).toBe('2025-2026');
    });
});

describe('compareAcademicYear', () => {
    it('orders by start year', () => {
        expect(compareAcademicYear('2025-2026', '2026-2027')).toBeLessThan(0);
        expect(compareAcademicYear('2026-2027', '2025-2026')).toBeGreaterThan(0);
        expect(compareAcademicYear('2026-2027', '2026-2027')).toBe(0);
    });
});

describe('isBeyondRetention', () => {
    it('flags any earlier academic year as beyond the one-year cap', () => {
        expect(isBeyondRetention('2025-2026', '2026-2027')).toBe(true);
    });

    it('keeps the current academic year', () => {
        expect(isBeyondRetention('2026-2027', '2026-2027')).toBe(false);
    });

    it('keeps a future academic year', () => {
        expect(isBeyondRetention('2027-2028', '2026-2027')).toBe(false);
    });
});
