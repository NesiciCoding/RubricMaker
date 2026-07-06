import type { SchoolYear, VoTrack, CefrSubLevelRange } from '../types';
import { SCHOOL_YEAR_HAS_TRACK } from './schoolYears';

function allTracks(range: CefrSubLevelRange): Record<VoTrack, CefrSubLevelRange> {
    return { 'vmbo-bb': range, 'vmbo-kb': range, 'vmbo-tl': range, havo: range, vwo: range };
}

/**
 * Expected CEFR range per (year, track), from the school's curriculum benchmark table.
 * groep-7/groep-8 rows apply uniformly across tracks (see SCHOOL_YEAR_HAS_TRACK). A missing
 * track key for a year means that track doesn't run that year at all (VMBO ends jaar-4, HAVO
 * jaar-5, VWO jaar-6). Range cells ("A1 / A2", "A2 to A2/B1") both resolve to the full span from
 * the lowest to the highest CEFR value named in the cell. The source table's "Bonus Level" row
 * (an aspirational ceiling beyond jaar-6) is out of scope and not modeled here.
 */
export const CEFR_TRACK_YEAR_TARGETS: Record<SchoolYear, Partial<Record<VoTrack, CefrSubLevelRange>>> = {
    'groep-7': allTracks({ min: 'pre-a1', max: 'pre-a1' }),
    'groep-8': allTracks({ min: 'a1', max: 'a1' }),
    'jaar-1': {
        'vmbo-bb': { min: 'a1', max: 'a1' },
        'vmbo-kb': { min: 'a1', max: 'a2' },
        'vmbo-tl': { min: 'a1', max: 'a2' },
        havo: { min: 'a2', max: 'a2' },
        vwo: { min: 'a2-plus', max: 'a2-plus' },
    },
    'jaar-2': {
        'vmbo-bb': { min: 'a1', max: 'a2' },
        'vmbo-kb': { min: 'a2', max: 'a2' },
        'vmbo-tl': { min: 'a2', max: 'a2' },
        havo: { min: 'b1-minus', max: 'b1-minus' },
        vwo: { min: 'b1', max: 'b1' },
    },
    'jaar-3': {
        'vmbo-bb': { min: 'a2-minus', max: 'a2-minus' },
        'vmbo-kb': { min: 'a2', max: 'a2' },
        'vmbo-tl': { min: 'b1-minus', max: 'b1-minus' },
        havo: { min: 'b1', max: 'b1' },
        vwo: { min: 'b1', max: 'b2' },
    },
    'jaar-4': {
        'vmbo-bb': { min: 'a2', max: 'b1' },
        'vmbo-kb': { min: 'a2', max: 'b1' },
        'vmbo-tl': { min: 'b1', max: 'b2' },
        havo: { min: 'b1', max: 'b2' },
        vwo: { min: 'b2', max: 'b2' },
    },
    'jaar-5': {
        havo: { min: 'b2', max: 'b2' },
        vwo: { min: 'b2-plus', max: 'b2-plus' },
    },
    'jaar-6': {
        vwo: { min: 'b2', max: 'c1' },
    },
};

/**
 * Looks up the expected CEFR range for a (year, track) pair. Returns undefined when the track
 * doesn't run that year, or year/track is unset. groep-7/groep-8 ignore the track argument since
 * the expectation is uniform across tracks for those years.
 */
export function getCefrTargetRange(
    year: SchoolYear | undefined,
    track: VoTrack | undefined
): CefrSubLevelRange | undefined {
    if (!year) return undefined;
    if (!SCHOOL_YEAR_HAS_TRACK[year]) return CEFR_TRACK_YEAR_TARGETS[year].havo;
    if (!track) return undefined;
    return CEFR_TRACK_YEAR_TARGETS[year][track];
}
