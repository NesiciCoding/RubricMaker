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
