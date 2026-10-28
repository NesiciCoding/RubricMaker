import { describe, it, expect } from 'vitest';
import { getCohortStudentIds, isAllCohorts, ALL_COHORTS } from './cohortAggregator';
import type { Class, Student } from '../types';

const classes: Class[] = [
    { id: 'c1', name: 'Havo 3A', year: 'jaar-3', voTrack: 'havo' },
    { id: 'c2', name: 'Havo 3B', year: 'jaar-3', voTrack: 'havo' },
    { id: 'c3', name: 'Vwo 3A', year: 'jaar-3', voTrack: 'vwo' },
];

const students: Student[] = [
    { id: 's1', name: 'Currently in cohort class', classId: 'c1' },
    {
        id: 's2',
        name: 'Transferred out, still counts via history',
        classId: 'c3',
        pastClassMemberships: [{ classId: 'c1', leftAt: '2026-01-01' }],
    },
    { id: 's3', name: 'Never in cohort', classId: 'c3' },
];

describe('getCohortStudentIds', () => {
    it('isAllCohorts flags the unfiltered case so callers can skip filtering entirely', () => {
        expect(isAllCohorts(ALL_COHORTS)).toBe(true);
        expect(isAllCohorts({ voTrack: 'havo', year: 'all' })).toBe(false);
    });

    it('includes students currently in a matching class', () => {
        const ids = getCohortStudentIds(students, classes, { voTrack: 'havo', year: 'jaar-3' });
        expect(ids.has('s1')).toBe(true);
        expect(ids.has('s3')).toBe(false);
    });

    it('includes students who passed through a matching class even after transferring out', () => {
        const ids = getCohortStudentIds(students, classes, { voTrack: 'havo', year: 'jaar-3' });
        expect(ids.has('s2')).toBe(true);
    });

    it('filters by year alone when track is "all"', () => {
        const ids = getCohortStudentIds(students, classes, { voTrack: 'all', year: 'jaar-3' });
        expect(ids.size).toBe(3);
    });

    it('skips students whose class is not in the class list', () => {
        const ids = getCohortStudentIds([{ id: 'ghost', name: 'Ghost', classId: 'unknown-class' }], classes, {
            voTrack: 'havo',
            year: 'jaar-3',
        });
        expect(ids.has('ghost')).toBe(false);
    });

    it('skips students with no class at all', () => {
        const ids = getCohortStudentIds([{ id: 'solo', name: 'Solo', classId: '' }], classes, {
            voTrack: 'all',
            year: 'all',
        });
        expect(ids.has('solo')).toBe(false);
    });

    it('narrows a mixed-year class to the student’s own year when they are tagged', () => {
        const mixedClass: Class = { id: 'm1', name: 'Groep 7/8', years: ['groep-7', 'groep-8'] };
        const roster: Student[] = [
            { id: 'y7', name: 'Groep 7 pupil', classId: 'm1', schoolYear: 'groep-7' },
            { id: 'y8', name: 'Groep 8 pupil', classId: 'm1', schoolYear: 'groep-8' },
            { id: 'untagged', name: 'Untagged pupil', classId: 'm1' },
        ];

        const ids = getCohortStudentIds(roster, [mixedClass], { voTrack: 'all', year: 'groep-8' });

        expect(ids.has('y8')).toBe(true);
        expect(ids.has('y7')).toBe(false);
        // No tag of their own, so the student follows the class and counts in either cohort.
        expect(ids.has('untagged')).toBe(true);
    });

    it('narrows a mixed-track class to the student’s own track when they are pinned', () => {
        const mixedClass: Class = { id: 'm2', name: 'VMBO-TL/HAVO', voTracks: ['vmbo-tl', 'havo'], voTrack: 'vmbo-tl' };
        const roster: Student[] = [
            { id: 'tl', name: 'VMBO-TL pupil', classId: 'm2', voTrack: 'vmbo-tl' },
            { id: 'havo', name: 'HAVO pupil', classId: 'm2', voTrack: 'havo' },
        ];

        const ids = getCohortStudentIds(roster, [mixedClass], { voTrack: 'havo', year: 'all' });

        expect(ids.has('havo')).toBe(true);
        expect(ids.has('tl')).toBe(false);
    });

    it('matches a past membership on the class alone, since the tag describes the student’s current class', () => {
        const mixedClass: Class = { id: 'm3', name: 'Groep 7/8', years: ['groep-7', 'groep-8'] };
        const current: Class = { id: 'c9', name: 'Havo 3A', year: 'jaar-3', voTrack: 'havo' };
        const roster: Student[] = [
            {
                id: 'moved',
                name: 'Moved on',
                classId: 'c9',
                schoolYear: 'jaar-3',
                pastClassMemberships: [{ classId: 'm3', leftAt: '2026-01-01' }],
            },
        ];

        const ids = getCohortStudentIds(roster, [mixedClass, current], { voTrack: 'all', year: 'groep-7' });

        expect(ids.has('moved')).toBe(true);
    });

    it('excludes classes whose year does not match the filter', () => {
        const classesWithYear: Class[] = [...classes, { id: 'c4', name: 'Havo 4A', year: 'jaar-4', voTrack: 'havo' }];
        const ids = getCohortStudentIds([{ id: 's4', name: 'Older year', classId: 'c4' }], classesWithYear, {
            voTrack: 'all',
            year: 'jaar-3',
        });
        expect(ids.has('s4')).toBe(false);
    });
});
