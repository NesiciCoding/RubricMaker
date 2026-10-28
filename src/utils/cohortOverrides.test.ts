import { describe, it, expect } from 'vitest';
import { staleCohortOverridePatch } from './cohortOverrides';
import type { Class } from '../types';

const mixed: Class = {
    id: 'c1',
    name: 'Groep 7/8 · VMBO-TL/HAVO',
    years: ['groep-7', 'groep-8'],
    year: 'groep-7',
    voTracks: ['vmbo-tl', 'havo'],
    voTrack: 'vmbo-tl',
};

describe('staleCohortOverridePatch', () => {
    it('leaves overrides the class still teaches alone', () => {
        expect(staleCohortOverridePatch({ schoolYear: 'groep-8', voTrack: 'havo' }, mixed)).toBeNull();
    });

    it('leaves a student with no overrides alone', () => {
        expect(staleCohortOverridePatch({}, mixed)).toBeNull();
    });

    it('clears a year the class no longer teaches but keeps the track', () => {
        expect(staleCohortOverridePatch({ schoolYear: 'jaar-3', voTrack: 'havo' }, mixed)).toEqual({
            schoolYear: undefined,
        });
    });

    it('clears a track the class no longer teaches but keeps the year', () => {
        expect(staleCohortOverridePatch({ schoolYear: 'groep-8', voTrack: 'vwo' }, mixed)).toEqual({
            voTrack: undefined,
        });
    });

    it('clears both halves at once when the class has narrowed past the student', () => {
        expect(staleCohortOverridePatch({ schoolYear: 'jaar-3', voTrack: 'vwo' }, mixed)).toEqual({
            schoolYear: undefined,
            voTrack: undefined,
        });
    });

    it('treats a class with no cohorts left as supporting no override at all', () => {
        expect(staleCohortOverridePatch({ schoolYear: 'groep-7', voTrack: 'havo' }, {})).toEqual({
            schoolYear: undefined,
            voTrack: undefined,
        });
    });

    it('treats a missing class the same way, so a merge into a deleted class cannot strand a tag', () => {
        expect(staleCohortOverridePatch({ schoolYear: 'groep-7' }, undefined)).toEqual({ schoolYear: undefined });
    });

    it('reads the legacy singular year/voTrack fields of an older class record', () => {
        const legacy: Class = { id: 'c3', name: 'Havo 3A', year: 'jaar-3', voTrack: 'havo' };
        expect(staleCohortOverridePatch({ schoolYear: 'jaar-3', voTrack: 'havo' }, legacy)).toBeNull();
        expect(staleCohortOverridePatch({ schoolYear: 'jaar-4' }, legacy)).toEqual({ schoolYear: undefined });
    });
});
