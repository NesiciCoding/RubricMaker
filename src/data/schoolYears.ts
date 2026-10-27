import type { SchoolYear } from '../types';

export const SCHOOL_YEARS: SchoolYear[] = [
    'groep-7',
    'groep-8',
    'jaar-1',
    'jaar-2',
    'jaar-3',
    'jaar-4',
    'jaar-5',
    'jaar-6',
];

/** Dutch curriculum labels — kept untranslated across locales, same convention as VO_TRACK_LABELS. */
export const SCHOOL_YEAR_LABELS: Record<SchoolYear, string> = {
    'groep-7': 'Groep 7',
    'groep-8': 'Groep 8',
    'jaar-1': 'Jaar 1',
    'jaar-2': 'Jaar 2',
    'jaar-3': 'Jaar 3',
    'jaar-4': 'Jaar 4',
    'jaar-5': 'Jaar 5',
    'jaar-6': 'Jaar 6',
};

/** groep-7/8 are primary school (basisschool) and have no VO track; jaar-1..6 are voortgezet onderwijs. */
export const SCHOOL_YEAR_HAS_TRACK: Record<SchoolYear, boolean> = {
    'groep-7': false,
    'groep-8': false,
    'jaar-1': true,
    'jaar-2': true,
    'jaar-3': true,
    'jaar-4': true,
    'jaar-5': true,
    'jaar-6': true,
};

/** School years actually in use, in SCHOOL_YEARS order — for filter dropdowns. */
export function getAvailableSchoolYears(classes: { year?: SchoolYear; years?: SchoolYear[] }[]): SchoolYear[] {
    return SCHOOL_YEARS.filter((y) => classes.some((c) => getClassYears(c).includes(y)));
}

/**
 * Every school year declared on a class, in SCHOOL_YEARS order. Falls back to the single legacy
 * `year` field so classes stored before multi-year support keep working untouched.
 */
export function getClassYears(cls?: { year?: SchoolYear; years?: SchoolYear[] }): SchoolYear[] {
    if (!cls) return [];
    const years = cls.years?.length ? cls.years : cls.year ? [cls.year] : [];
    return SCHOOL_YEARS.filter((y) => years.includes(y));
}

/** True when the class teaches this year (its own year, or one of the years it mixes). */
export function classHasSchoolYear(
    cls: { year?: SchoolYear; years?: SchoolYear[] } | undefined,
    year: SchoolYear
): boolean {
    return getClassYears(cls).includes(year);
}

/**
 * A student's own school year, falling back to their class's primary year. A mixed-year class
 * (e.g. groep 7 & 8) leaves the primary year as the class default until the student is tagged.
 */
export function getEffectiveSchoolYear(
    student?: { schoolYear?: SchoolYear },
    cls?: { year?: SchoolYear; years?: SchoolYear[] }
): SchoolYear | undefined {
    return student?.schoolYear ?? getClassYears(cls)[0];
}

/** "Groep 7 · Groep 8" for a mixed-year class, undefined when no year is set. */
export function formatClassYears(cls?: { year?: SchoolYear; years?: SchoolYear[] }): string | undefined {
    const years = getClassYears(cls);
    return years.length ? years.map((y) => SCHOOL_YEAR_LABELS[y]).join(' · ') : undefined;
}
