import { describe, it, expect } from 'vitest';
import { scoreStudentTest } from './studentTestScore';
import type { StudentTest, Test, TestQuestion } from '../types';

const question = (id: string, points: number, sectionId?: string): TestQuestion => ({
    id,
    prompt: id,
    type: 'multiple-choice',
    points,
    sectionId,
    options: [
        { id: 'right', text: 'Right', isCorrect: true },
        { id: 'wrong', text: 'Wrong', isCorrect: false },
    ],
});

const baseTest: Test = {
    id: 't1',
    name: 'Test',
    questions: [question('q1', 1), question('q2', 3)],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
};

const attempt = (overrides: Partial<StudentTest> = {}): StudentTest => ({
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [
        { questionId: 'q1', response: 'right' },
        { questionId: 'q2', response: 'wrong' },
    ],
    status: 'graded',
    startedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
});

describe('scoreStudentTest', () => {
    it('scores a regular test against all its questions, with adjustments clamped to the maximum', () => {
        expect(scoreStudentTest(baseTest, attempt())).toMatchObject({ rawPoints: 1, maxPoints: 4, percentage: 25 });
        expect(scoreStudentTest(baseTest, attempt({ rawTotalPoints: 3, adjustmentPoints: 5 }))).toMatchObject({
            totalPoints: 4,
            percentage: 100,
        });
    });

    it('scores a staged placement run only on the sections the student was routed through', () => {
        const staged: Test = {
            ...baseTest,
            mode: 'placement',
            questions: [question('r1', 1, 'routing'), question('e1', 1, 'easy'), question('h1', 2, 'hard')],
            sections: [
                {
                    id: 'routing',
                    title: 'Routing',
                    routing: { thresholdPct: 60, passSectionId: 'hard', failSectionId: 'easy' },
                },
                { id: 'easy', title: 'Easy', cefrLevel: 'A1' },
                { id: 'hard', title: 'Hard', cefrLevel: 'B1' },
            ],
        };
        const score = scoreStudentTest(
            staged,
            attempt({
                sectionPath: ['routing', 'hard'],
                answers: [
                    { questionId: 'r1', response: 'right' },
                    { questionId: 'h1', response: 'right' },
                    { questionId: 'e1', response: 'right' },
                ],
                rawTotalPoints: 4,
            })
        );
        expect(score).toMatchObject({ staged: true, rawPoints: 3, maxPoints: 3, percentage: 100 });
        expect(score.pathQuestions.map((q) => q.id)).toEqual(['r1', 'h1']);
    });

    it('scores a generator run from its asked-question snapshots', () => {
        const generator: Test = { ...baseTest, mode: 'placement', placementEngine: 'generator', questions: [] };
        const score = scoreStudentTest(
            generator,
            attempt({
                answers: [
                    { questionId: 'g1', response: 'right' },
                    { questionId: 'g2', response: 'wrong' },
                ],
                askedQuestionSnapshots: [question('g1', 2), question('g2', 2)],
                levelPath: [
                    { sectionId: 'B1', level: 'B1', questionId: 'g1', correct: true },
                    { sectionId: 'B2', level: 'B2', questionId: 'g2', correct: false },
                ],
            })
        );
        expect(score).toMatchObject({ isStaircase: true, rawPoints: 2, maxPoints: 4, percentage: 50 });
    });
});
