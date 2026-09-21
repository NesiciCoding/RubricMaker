import type { StudentTest, StaircaseStep, TestQuestion, CefrLevel } from '../types';

// A generator-engine (roadmap 27.1) placement run whose trace converged server-side but whose
// student_tests row was never written — the hand-in failed (offline/outage) and never retried.
// The teacher owns the placement_sessions row (RLS: owner SELECT), so these can be materialised
// into a submitted student_tests row client-side, from the already-authoritative trace.
export interface ConvergedPlacementSession {
    assignmentId: string;
    testId: string;
    studentId: string;
    levelPath: StaircaseStep[];
    askedQuestions: TestQuestion[];
    startLevel: CefrLevel;
    createdAt: string;
    updatedAt: string;
}

// Deterministic id so re-running recovery upserts the same row rather than piling up duplicates.
export function recoveredTestId(assignmentId: string): string {
    return `recovered-${assignmentId}`;
}

/**
 * Materialise a submitted StudentTest from a converged generator placement session — the same
 * shape submit-test's generator branch writes. The estimate replay (estimatePlacement) needs
 * levelPath + placementStartLevel, not the raw response text, so answers are keyed by the trace's
 * questions with empty responses (correctness already lives in levelPath).
 */
export function buildRecoveredStudentTest(s: ConvergedPlacementSession): StudentTest {
    return {
        id: recoveredTestId(s.assignmentId),
        testId: s.testId,
        studentId: s.studentId,
        answers: s.levelPath.map((step) => ({ questionId: step.questionId, response: '' })),
        status: 'submitted',
        startedAt: s.createdAt,
        submittedAt: s.updatedAt,
        events: [],
        levelPath: s.levelPath,
        askedQuestionSnapshots: s.askedQuestions,
        placementStartLevel: s.startLevel,
        updatedAt: s.updatedAt,
    };
}

/**
 * Sessions with no student_tests row yet for the same (test, student). A placement test's id is
 * unique to that placement, so any existing submission for the pair — a real hand-in that later
 * landed, or a prior recovery — means there's nothing to recover.
 */
export function unrecoveredSessions(
    sessions: ConvergedPlacementSession[],
    existing: Pick<StudentTest, 'testId' | 'studentId'>[]
): ConvergedPlacementSession[] {
    const have = new Set(existing.map((st) => `${st.testId}__${st.studentId}`));
    return sessions.filter((s) => !have.has(`${s.testId}__${s.studentId}`));
}
