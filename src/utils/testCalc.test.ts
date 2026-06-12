import { describe, it, expect } from 'vitest';
import {
    calcTestMaxPoints,
    calcStudentTestRawPoints,
    calcTestPercentage,
    calcClassAveragePercentage,
    suggestAdjustmentToTarget,
    applyAdjustment,
    scoreShortAnswerExact,
} from './testCalc';
import type { Test, StudentTest, TestQuestion } from '../types';

const mcQuestion: TestQuestion = {
    id: 'q-mc',
    prompt: 'Pick the correct option',
    type: 'multiple-choice',
    points: 4,
    options: [
        { id: 'a', text: 'Wrong', isCorrect: false },
        { id: 'b', text: 'Right', isCorrect: true },
        { id: 'c', text: 'Also wrong', isCorrect: false },
    ],
};

const saQuestion: TestQuestion = {
    id: 'q-sa',
    prompt: 'Capital of France?',
    type: 'short-answer',
    points: 2,
    expectedAnswer: 'Paris',
};

const openQuestion: TestQuestion = {
    id: 'q-open',
    prompt: 'Explain your reasoning',
    type: 'open',
    points: 6,
};

const makeTest = (overrides: Partial<Test> = {}): Test => ({
    id: 't1',
    name: 'Unit test',
    questions: [mcQuestion, saQuestion, openQuestion],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const makeStudentTest = (overrides: Partial<StudentTest> = {}): StudentTest => ({
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [],
    status: 'submitted',
    startedAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
});

describe('calcTestMaxPoints', () => {
    it('sums all question points', () => {
        expect(calcTestMaxPoints(makeTest())).toBe(12);
    });

    it('returns 0 for a test without questions', () => {
        expect(calcTestMaxPoints(makeTest({ questions: [] }))).toBe(0);
    });
});

describe('calcStudentTestRawPoints', () => {
    it('auto-scores multiple-choice against isCorrect options', () => {
        const test = makeTest();
        expect(calcStudentTestRawPoints(test, [{ questionId: 'q-mc', response: 'b' }])).toBe(4);
        expect(calcStudentTestRawPoints(test, [{ questionId: 'q-mc', response: 'a' }])).toBe(0);
        expect(calcStudentTestRawPoints(test, [{ questionId: 'q-mc', response: 'nonexistent' }])).toBe(0);
    });

    it('auto-scores short-answer via exact match', () => {
        const test = makeTest();
        expect(calcStudentTestRawPoints(test, [{ questionId: 'q-sa', response: '  paris ' }])).toBe(2);
        expect(calcStudentTestRawPoints(test, [{ questionId: 'q-sa', response: 'London' }])).toBe(0);
    });

    it('gives open questions 0 until manually graded', () => {
        const test = makeTest();
        expect(calcStudentTestRawPoints(test, [{ questionId: 'q-open', response: 'Because...' }])).toBe(0);
        expect(
            calcStudentTestRawPoints(test, [{ questionId: 'q-open', response: 'Because...', pointsEarned: 5 }])
        ).toBe(5);
    });

    it('lets manual pointsEarned override auto-scoring', () => {
        const test = makeTest();
        expect(calcStudentTestRawPoints(test, [{ questionId: 'q-mc', response: 'b', pointsEarned: 1 }])).toBe(1);
    });

    it('ignores answers to unknown questions', () => {
        expect(calcStudentTestRawPoints(makeTest(), [{ questionId: 'ghost', response: 'x' }])).toBe(0);
    });
});

describe('scoreShortAnswerExact', () => {
    it('returns null when no expectedAnswer is set', () => {
        expect(scoreShortAnswerExact({ ...saQuestion, expectedAnswer: undefined }, 'Paris')).toBeNull();
    });

    it('returns null for non short-answer questions', () => {
        expect(scoreShortAnswerExact(openQuestion, 'Paris')).toBeNull();
    });
});

describe('calcTestPercentage', () => {
    it('computes a percentage', () => {
        expect(calcTestPercentage(6, 12)).toBe(50);
    });

    it('returns 0 when max points is 0', () => {
        expect(calcTestPercentage(5, 0)).toBe(0);
    });

    it('clamps to [0, 100]', () => {
        expect(calcTestPercentage(20, 12)).toBe(100);
        expect(calcTestPercentage(-3, 12)).toBe(0);
    });
});

describe('calcClassAveragePercentage', () => {
    it('returns 0 for an empty class', () => {
        expect(calcClassAveragePercentage([], makeTest())).toBe(0);
    });

    it('averages over students, preferring stored rawTotalPoints', () => {
        const test = makeTest();
        const sts = [
            makeStudentTest({ rawTotalPoints: 12 }),
            makeStudentTest({ id: 'st2', studentId: 's2', rawTotalPoints: 6 }),
        ];
        expect(calcClassAveragePercentage(sts, test)).toBe(75);
    });

    it('falls back to computing raw points from answers', () => {
        const test = makeTest();
        const sts = [makeStudentTest({ answers: [{ questionId: 'q-mc', response: 'b' }] })];
        expect(calcClassAveragePercentage(sts, test)).toBeCloseTo((4 / 12) * 100);
    });

    it('returns 0 when the test has 0 max points', () => {
        const test = makeTest({ questions: [] });
        expect(calcClassAveragePercentage([makeStudentTest({ rawTotalPoints: 0 })], test)).toBe(0);
    });
});

describe('suggestAdjustmentToTarget', () => {
    it('suggests a positive delta when below target', () => {
        expect(suggestAdjustmentToTarget(50, 75, 12)).toBe(3);
    });

    it('suggests a negative delta when above target', () => {
        expect(suggestAdjustmentToTarget(75, 50, 12)).toBe(-3);
    });

    it('suggests 0 when already at target', () => {
        expect(suggestAdjustmentToTarget(60, 60, 12)).toBe(0);
    });
});

describe('applyAdjustment', () => {
    it('stores the uniform adjustment', () => {
        const st = applyAdjustment(makeStudentTest({ rawTotalPoints: 6 }), 3, 12);
        expect(st.adjustmentPoints).toBe(3);
    });

    it('clamps the effective total at max points', () => {
        const st = applyAdjustment(makeStudentTest({ rawTotalPoints: 11 }), 3, 12);
        expect(st.adjustmentPoints).toBe(1);
    });

    it('clamps the effective total at 0', () => {
        const st = applyAdjustment(makeStudentTest({ rawTotalPoints: 2 }), -5, 12);
        expect(st.adjustmentPoints).toBe(-2);
    });

    it('does not mutate the input', () => {
        const original = makeStudentTest({ rawTotalPoints: 6 });
        applyAdjustment(original, 3, 12);
        expect(original.adjustmentPoints).toBeUndefined();
    });
});
