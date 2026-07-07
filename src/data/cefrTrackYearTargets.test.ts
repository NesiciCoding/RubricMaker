import { describe, it, expect } from 'vitest';
import { CEFR_TRACK_YEAR_TARGETS, getCefrTargetRange } from './cefrTrackYearTargets';
import { cefrSubLevelOrdinal } from '../utils/cefrOrdinal';
import { SCHOOL_YEARS } from './schoolYears';
import { VO_TRACKS } from './voTracks';

describe('CEFR_TRACK_YEAR_TARGETS', () => {
    it('has min <= max for every defined cell', () => {
        for (const year of SCHOOL_YEARS) {
            for (const track of VO_TRACKS) {
                const range = CEFR_TRACK_YEAR_TARGETS[year][track];
                if (!range) continue;
                expect(cefrSubLevelOrdinal(range.min)).toBeLessThanOrEqual(cefrSubLevelOrdinal(range.max));
            }
        }
    });
});

describe('getCefrTargetRange', () => {
    it('returns undefined for tracks that do not run VMBO past jaar-4', () => {
        expect(getCefrTargetRange('jaar-5', 'vmbo-bb')).toBeUndefined();
        expect(getCefrTargetRange('jaar-6', 'vmbo-tl')).toBeUndefined();
    });

    it('returns undefined for HAVO past jaar-5', () => {
        expect(getCefrTargetRange('jaar-6', 'havo')).toBeUndefined();
    });

    it('returns a range for VWO through jaar-6', () => {
        expect(getCefrTargetRange('jaar-6', 'vwo')).toEqual({ min: 'b2', max: 'c1' });
    });

    it('returns the uniform groep-7/8 range regardless of track', () => {
        expect(getCefrTargetRange('groep-7', 'vwo')).toEqual({ min: 'pre-a1', max: 'pre-a1' });
        expect(getCefrTargetRange('groep-7', undefined)).toEqual({ min: 'pre-a1', max: 'pre-a1' });
        expect(getCefrTargetRange('groep-8', 'vmbo-bb')).toEqual({ min: 'a1', max: 'a1' });
    });

    it('returns undefined when year is unset', () => {
        expect(getCefrTargetRange(undefined, 'havo')).toBeUndefined();
    });

    it('returns undefined when a VO year has no track', () => {
        expect(getCefrTargetRange('jaar-3', undefined)).toBeUndefined();
    });
});
