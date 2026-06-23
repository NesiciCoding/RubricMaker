import { describe, it, expect } from 'vitest';
import { getCohortStudentIds, isAllCohorts, ALL_COHORTS } from './cohortAggregator';
import type { Class, Student } from '../types';

const classes: Class[] = [
    { id: 'c1', name: 'Havo 3A', year: '2026', voTrack: 'havo' },
    { id: 'c2', name: 'Havo 3B', year: '2026', voTrack: 'havo' },
    { id: 'c3', name: 'Vwo 3A', year: '2026', voTrack: 'vwo' },
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
        const ids = getCohortStudentIds(students, classes, { voTrack: 'havo', year: '2026' });
        expect(ids.has('s1')).toBe(true);
        expect(ids.has('s3')).toBe(false);
    });

    it('includes students who passed through a matching class even after transferring out', () => {
        const ids = getCohortStudentIds(students, classes, { voTrack: 'havo', year: '2026' });
        expect(ids.has('s2')).toBe(true);
    });

    it('filters by year alone when track is "all"', () => {
        const ids = getCohortStudentIds(students, classes, { voTrack: 'all', year: '2026' });
        expect(ids.size).toBe(3);
    });
});
