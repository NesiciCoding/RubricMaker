import { describe, it, expect } from 'vitest';
import { countMatchupsPerStudent, getMatchKey, pickNextMatchupPair } from './comparativeMatchups';
import type { ComparativeMatchup } from '../types';

function makeMatchup(rubricId: string, studentAId: string, studentBId: string): ComparativeMatchup {
    return { id: `${studentAId}-${studentBId}`, rubricId, studentAId, studentBId, gradedAt: '2026-01-01T00:00:00Z' };
}

describe('getMatchKey', () => {
    it('is order-independent', () => {
        expect(getMatchKey('a', 'b')).toBe(getMatchKey('b', 'a'));
    });
});

describe('countMatchupsPerStudent', () => {
    it('counts each student once per matchup they appear in, on either side', () => {
        const matchups = [makeMatchup('r1', 's1', 's2'), makeMatchup('r1', 's1', 's3'), makeMatchup('r1', 's2', 's3')];
        expect(countMatchupsPerStudent(matchups)).toEqual({ s1: 2, s2: 2, s3: 2 });
    });

    it('returns an empty record for no matchups', () => {
        expect(countMatchupsPerStudent([])).toEqual({});
    });
});

describe('pickNextMatchupPair', () => {
    const students = [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }];

    it('returns null once fewer than 2 students remain under the limit', () => {
        // s1 and s2 are both already at the limit (1); only s3 is still eligible,
        // and there's no one left to pair it with.
        const matchups = [makeMatchup('r1', 's1', 's2')];
        expect(pickNextMatchupPair([{ id: 's1' }, { id: 's2' }, { id: 's3' }], matchups, 1, null)).toBeNull();
    });

    it('never exceeds the per-student limit when picking a pair', () => {
        const matchups = [makeMatchup('r1', 's1', 's2'), makeMatchup('r1', 's1', 's3')];
        // s1 is already at the limit (2); it must never be picked again.
        for (let i = 0; i < 20; i++) {
            const pick = pickNextMatchupPair(students, matchups, 2, null);
            expect(pick).not.toBeNull();
            expect([pick!.a.id, pick!.b.id]).not.toContain('s1');
        }
    });

    it('prefers the requested anchor when still eligible', () => {
        const pick = pickNextMatchupPair(students, [], 0, 's2');
        expect(pick?.a.id).toBe('s2');
    });

    it('falls back to a random anchor when the requested one is no longer eligible', () => {
        const matchups = [makeMatchup('r1', 's1', 's2'), makeMatchup('r1', 's1', 's3')];
        const pick = pickNextMatchupPair(students, matchups, 2, 's1');
        expect(pick).not.toBeNull();
        expect([pick!.a.id, pick!.b.id]).not.toContain('s1');
    });

    it('prefers an opponent the anchor has not already been paired with', () => {
        const matchups = [makeMatchup('r1', 's1', 's2'), makeMatchup('r1', 's1', 's3')];
        for (let i = 0; i < 20; i++) {
            const pick = pickNextMatchupPair(students, matchups, 0, 's1');
            expect(pick?.b.id).toBe('s4');
        }
    });

    it('falls back to an already-paired opponent once every option is exhausted', () => {
        const twoStudents = [{ id: 's1' }, { id: 's2' }];
        const matchups = [makeMatchup('r1', 's1', 's2')];
        const pick = pickNextMatchupPair(twoStudents, matchups, 0, 's1');
        expect(pick).toEqual({ a: { id: 's1' }, b: { id: 's2' } });
    });

    it('treats a non-positive limit as unlimited', () => {
        const matchups = [makeMatchup('r1', 's1', 's2'), makeMatchup('r1', 's1', 's3'), makeMatchup('r1', 's1', 's4')];
        expect(pickNextMatchupPair(students, matchups, 0, null)).not.toBeNull();
    });
});
