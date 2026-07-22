import { describe, expect, it } from 'vitest';
import { buildEloProgress } from './eloProgressAggregator';
import type { StudentTest, Test } from '../types';

function makeTest(overrides: Partial<Test> = {}): Test {
    return {
        id: 't1',
        name: 'Placement Test',
        questions: [],
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: '2024-01-01T00:00:00Z',
        mode: 'placement',
        placementEngine: 'staircase',
        ...overrides,
    };
}

function makeStudentTest(overrides: Partial<StudentTest> = {}): StudentTest {
    return {
        id: 'st1',
        testId: 't1',
        studentId: 's1',
        answers: [],
        status: 'submitted',
        startedAt: '2024-01-01T10:00:00Z',
        submittedAt: '2024-01-01T10:05:00Z',
        levelPath: [{ sectionId: 'sec1', level: 'A2', questionId: 'q1', correct: true }],
        ...overrides,
    };
}

describe('buildEloProgress', () => {
    it('returns an empty array when there are no student tests', () => {
        expect(buildEloProgress([], [makeTest()])).toEqual([]);
    });

    it('produces one point per submitted placement attempt, with the level-anchor Elo value', () => {
        const points = buildEloProgress([makeStudentTest()], [makeTest()]);
        expect(points).toHaveLength(1);
        expect(points[0]).toMatchObject({
            studentTestId: 'st1',
            testName: 'Placement Test',
            level: 'A2',
            eloValue: 900,
            attemptIndex: 1,
        });
    });

    it('excludes attempts on a non-placement test', () => {
        const points = buildEloProgress(
            [makeStudentTest()],
            [makeTest({ mode: 'assessment', placementEngine: undefined })]
        );
        expect(points).toEqual([]);
    });

    it('excludes in-progress attempts', () => {
        const points = buildEloProgress([makeStudentTest({ status: 'in_progress' })], [makeTest()]);
        expect(points).toEqual([]);
    });

    it('excludes attempts whose test no longer exists', () => {
        const points = buildEloProgress([makeStudentTest({ testId: 'missing' })], [makeTest()]);
        expect(points).toEqual([]);
    });

    it('excludes attempts with no resolvable placement estimate', () => {
        const points = buildEloProgress([makeStudentTest({ levelPath: undefined })], [makeTest()]);
        expect(points).toEqual([]);
    });

    it('sorts chronologically and assigns 1-based attempt indices regardless of input order', () => {
        const earlier = makeStudentTest({
            id: 'st-early',
            submittedAt: '2024-01-01T10:00:00Z',
            levelPath: [{ sectionId: 'sec1', level: 'A2', questionId: 'q1', correct: true }],
        });
        const later = makeStudentTest({
            id: 'st-late',
            submittedAt: '2024-02-01T10:00:00Z',
            levelPath: [
                { sectionId: 'sec1', level: 'A2', questionId: 'q1', correct: true },
                { sectionId: 'sec1', level: 'A2', questionId: 'q2', correct: true },
            ],
        });

        const points = buildEloProgress([later, earlier], [makeTest()]);

        expect(points.map((p) => p.studentTestId)).toEqual(['st-early', 'st-late']);
        expect(points.map((p) => p.attemptIndex)).toEqual([1, 2]);
        expect(points[1].level).toBe('B1');
        expect(points[1].eloValue).toBe(1200);
    });

    it('falls back to gradedAt then startedAt when submittedAt is unset', () => {
        const points = buildEloProgress(
            [makeStudentTest({ status: 'graded', submittedAt: undefined, gradedAt: '2024-01-05T00:00:00Z' })],
            [makeTest()]
        );
        expect(points[0].date).toBe('2024-01-05T00:00:00Z');
    });
});
