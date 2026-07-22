import type { StudentTest, Test, CefrLevel } from '../types';
import { estimatePlacement } from './placementResult';
import { LEVEL_TO_ELO } from './placementStaircase';

export interface EloProgressPoint {
    studentTestId: string;
    testName: string;
    /** ISO timestamp the attempt was submitted (falls back to graded/started when unset) */
    date: string;
    /** 1-based, chronological across the student's placement attempts */
    attemptIndex: number;
    level: CefrLevel;
    /** `LEVEL_TO_ELO[level]` — lets the point share a Y-axis scale with the per-level Elo bands */
    eloValue: number;
}

/**
 * Chronological Elo-scaled CEFR progression (roadmap Phase 25.5) from a student's placement-test
 * attempts: one point per submitted/graded placement `StudentTest`, using the same provisional
 * estimate (`estimatePlacement`) already shown elsewhere, mapped onto the Elo axis via
 * `LEVEL_TO_ELO` so it can render alongside the per-level color bands.
 */
export function buildEloProgress(studentTests: StudentTest[], tests: Test[]): EloProgressPoint[] {
    const testsById = new Map(tests.map((t) => [t.id, t]));

    const unordered = studentTests
        .filter((st) => st.status === 'submitted' || st.status === 'graded')
        .map((st) => {
            const test = testsById.get(st.testId);
            if (!test || test.mode !== 'placement') return null;
            const estimate = estimatePlacement(test, st);
            if (!estimate) return null;
            return {
                studentTestId: st.id,
                testName: test.name,
                date: st.submittedAt ?? st.gradedAt ?? st.startedAt,
                level: estimate.level,
                eloValue: LEVEL_TO_ELO[estimate.level],
            };
        })
        .filter((p): p is Omit<EloProgressPoint, 'attemptIndex'> => p !== null)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return unordered.map((p, i) => ({ ...p, attemptIndex: i + 1 }));
}
