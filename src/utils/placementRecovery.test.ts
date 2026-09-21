import { describe, it, expect } from 'vitest';
import {
    buildRecoveredStudentTest,
    unrecoveredSessions,
    recoveredTestId,
    type ConvergedPlacementSession,
} from './placementRecovery';

const session: ConvergedPlacementSession = {
    assignmentId: 'asg-1',
    testId: 'test-1',
    studentId: 'stu-1',
    levelPath: [
        { sectionId: 'B1', level: 'B1', questionId: 'q1', correct: true },
        { sectionId: 'B2', level: 'B2', questionId: 'q2', correct: false },
    ],
    askedQuestions: [],
    startLevel: 'B1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:10:00Z',
};

describe('placementRecovery', () => {
    it('materialises a submitted StudentTest carrying the trace the estimate needs', () => {
        const st = buildRecoveredStudentTest(session);
        expect(st.id).toBe(recoveredTestId('asg-1'));
        expect(st.status).toBe('submitted');
        expect(st.levelPath).toHaveLength(2);
        expect(st.placementStartLevel).toBe('B1');
        expect(st.answers.map((a) => a.questionId)).toEqual(['q1', 'q2']);
    });

    it('skips sessions that already have a submission for the same student+test', () => {
        expect(unrecoveredSessions([session], [{ testId: 'test-1', studentId: 'stu-1' }])).toEqual([]);
        expect(unrecoveredSessions([session], [{ testId: 'test-1', studentId: 'other' }])).toHaveLength(1);
    });
});
