import { describe, it, expect } from 'vitest';
import type { SchoolYear } from '../types';
import {
    SCHOOL_YEARS,
    SCHOOL_YEAR_LABELS,
    classHasSchoolYear,
    formatClassYears,
    getAvailableSchoolYears,
    getClassYears,
    getEffectiveSchoolYear,
} from './schoolYears';

describe('getClassYears', () => {
    it('returns an empty list without a class', () => {
        expect(getClassYears()).toEqual([]);
    });

    it('returns an empty list for a class with no year', () => {
        expect(getClassYears({})).toEqual([]);
    });

    it('falls back to the single legacy year field', () => {
        expect(getClassYears({ year: 'jaar-2' })).toEqual(['jaar-2']);
    });

    it('returns every declared year in SCHOOL_YEARS order', () => {
        expect(getClassYears({ years: ['groep-8', 'groep-7'] })).toEqual(['groep-7', 'groep-8']);
    });

    it('prefers years over a stale singular year', () => {
        expect(getClassYears({ year: 'jaar-1', years: ['groep-8'] })).toEqual(['groep-8']);
    });
});

describe('classHasSchoolYear', () => {
    it('is false without a class', () => {
        expect(classHasSchoolYear(undefined, 'groep-7')).toBe(false);
    });

    it('matches a mixed class on any of its years', () => {
        const cls = { years: ['groep-7', 'groep-8'] as SchoolYear[] };
        expect(classHasSchoolYear(cls, 'groep-8')).toBe(true);
        expect(classHasSchoolYear(cls, 'jaar-1')).toBe(false);
    });
});

describe('getEffectiveSchoolYear', () => {
    it('prefers the student override', () => {
        expect(getEffectiveSchoolYear({ schoolYear: 'groep-8' }, { years: ['groep-7', 'groep-8'] })).toBe('groep-8');
    });

    it('falls back to the class primary year', () => {
        expect(getEffectiveSchoolYear(undefined, { year: 'jaar-3' })).toBe('jaar-3');
    });

    it('is undefined when neither side declares a year', () => {
        expect(getEffectiveSchoolYear(undefined, undefined)).toBeUndefined();
    });
});

describe('formatClassYears', () => {
    it('joins a mixed-year class in curriculum order', () => {
        expect(formatClassYears({ years: ['groep-8', 'groep-7'] })).toBe('Groep 7 · Groep 8');
    });

    it('is undefined without a year', () => {
        expect(formatClassYears({})).toBeUndefined();
    });

    it('labels every known school year', () => {
        SCHOOL_YEARS.forEach((year) => expect(formatClassYears({ year })).toBe(SCHOOL_YEAR_LABELS[year]));
    });
});

describe('getAvailableSchoolYears', () => {
    it('collects the years of every class, including mixed ones, in curriculum order', () => {
        expect(
            getAvailableSchoolYears([{ year: 'jaar-3' }, { years: ['groep-8', 'groep-7'] }, { year: 'jaar-3' }])
        ).toEqual(['groep-7', 'groep-8', 'jaar-3']);
    });

    it('is empty when no class declares a year', () => {
        expect(getAvailableSchoolYears([{}])).toEqual([]);
    });
});
