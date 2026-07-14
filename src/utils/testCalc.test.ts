import { describe, it, expect } from 'vitest';
import {
    calcTestMaxPoints,
    calcStudentTestRawPoints,
    calcTestPercentage,
    calcClassAveragePercentage,
    suggestAdjustmentToTarget,
    applyAdjustment,
    scoreShortAnswerExact,
    scoreNumeric,
    scoreMultipleResponse,
    scoreCloze,
    scoreMatching,
    scoreOrdering,
    scoreCategorize,
    scoreHotText,
    autoScoreResponse,
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

    it('only counts the latest answer when a questionId appears more than once', () => {
        const test = makeTest();
        expect(
            calcStudentTestRawPoints(test, [
                { questionId: 'q-mc', response: 'a' },
                { questionId: 'q-mc', response: 'b' },
            ])
        ).toBe(4);
        expect(
            calcStudentTestRawPoints(test, [
                { questionId: 'q-mc', response: 'b' },
                { questionId: 'q-mc', response: 'a' },
            ])
        ).toBe(0);
    });

    it('clamps manual pointsEarned to [0, question.points]', () => {
        const test = makeTest();
        expect(calcStudentTestRawPoints(test, [{ questionId: 'q-open', response: 'x', pointsEarned: -3 }])).toBe(0);
        expect(calcStudentTestRawPoints(test, [{ questionId: 'q-open', response: 'x', pointsEarned: 100 }])).toBe(6);
    });
});

describe('scoreShortAnswerExact', () => {
    it('returns null when no expectedAnswer is set', () => {
        expect(scoreShortAnswerExact({ ...saQuestion, expectedAnswer: undefined }, 'Paris')).toBeNull();
    });

    it('returns null for non short-answer questions', () => {
        expect(scoreShortAnswerExact(openQuestion, 'Paris')).toBeNull();
    });

    it('matches a trimmed case-insensitive single expectedAnswer', () => {
        expect(scoreShortAnswerExact(saQuestion, '  paris  ')).toBe(2);
        expect(scoreShortAnswerExact(saQuestion, 'Lyon')).toBe(0);
    });

    it('matches any of expectedAnswers when set', () => {
        const question = { ...saQuestion, expectedAnswers: ['grey', 'gray'] };
        expect(scoreShortAnswerExact(question, 'Gray')).toBe(2);
        expect(scoreShortAnswerExact(question, ' grey ')).toBe(2);
        expect(scoreShortAnswerExact(question, 'green')).toBe(0);
    });

    it('prefers expectedAnswers over the legacy expectedAnswer when both are set', () => {
        const question = { ...saQuestion, expectedAnswer: 'Paris', expectedAnswers: ['Lyon'] };
        expect(scoreShortAnswerExact(question, 'Paris')).toBe(0);
        expect(scoreShortAnswerExact(question, 'Lyon')).toBe(2);
    });
});

const numericQuestion: TestQuestion = {
    id: 'q-num',
    prompt: 'What is pi to 2 decimal places?',
    type: 'numeric',
    points: 3,
    expectedNumericValue: 3.14,
    numericTolerance: 0.01,
};

describe('scoreNumeric', () => {
    it('returns null when no expectedNumericValue is set', () => {
        expect(scoreNumeric({ ...numericQuestion, expectedNumericValue: undefined }, '3.14')).toBeNull();
    });

    it('returns null for non-numeric question types', () => {
        expect(scoreNumeric(openQuestion, '3.14')).toBeNull();
    });

    it('awards full points within tolerance', () => {
        expect(scoreNumeric(numericQuestion, '3.14')).toBe(3);
        expect(scoreNumeric(numericQuestion, '3.15')).toBe(3);
        expect(scoreNumeric(numericQuestion, '3.13')).toBe(3);
    });

    it('awards zero outside tolerance', () => {
        expect(scoreNumeric(numericQuestion, '3.20')).toBe(0);
    });

    it('defaults tolerance to 0 (exact match) when unset', () => {
        const exact = { ...numericQuestion, numericTolerance: undefined };
        expect(scoreNumeric(exact, '3.14')).toBe(3);
        expect(scoreNumeric(exact, '3.140001')).toBe(0);
    });

    it('awards zero for a non-numeric response', () => {
        expect(scoreNumeric(numericQuestion, 'not a number')).toBe(0);
    });

    it('awards zero for an empty or whitespace-only response even when expectedNumericValue is 0', () => {
        const zeroQuestion = { ...numericQuestion, expectedNumericValue: 0 };
        expect(scoreNumeric(zeroQuestion, '')).toBe(0);
        expect(scoreNumeric(zeroQuestion, '   ')).toBe(0);
    });
});

const mrQuestion: TestQuestion = {
    id: 'q-mr',
    prompt: 'Select all prime numbers',
    type: 'multiple-response',
    points: 4,
    options: [
        { id: 'a', text: '2', isCorrect: true },
        { id: 'b', text: '3', isCorrect: true },
        { id: 'c', text: '4', isCorrect: false },
        { id: 'd', text: '6', isCorrect: false },
    ],
};

const tfQuestion: TestQuestion = {
    id: 'q-tf',
    prompt: 'The earth is round',
    type: 'true-false',
    points: 2,
    correctBoolean: true,
};

describe('scoreMultipleResponse', () => {
    it('awards full points for an exact match of correct options', () => {
        expect(scoreMultipleResponse(mrQuestion, JSON.stringify(['a', 'b']))).toBe(4);
    });

    it('awards proportional credit by default', () => {
        expect(scoreMultipleResponse(mrQuestion, JSON.stringify(['a']))).toBe(3);
        expect(scoreMultipleResponse(mrQuestion, JSON.stringify(['a', 'c']))).toBe(2);
    });

    it('awards 0 for an empty selection', () => {
        expect(scoreMultipleResponse(mrQuestion, JSON.stringify([]))).toBe(2);
    });

    it('treats unparsable responses as no selection', () => {
        expect(scoreMultipleResponse(mrQuestion, '')).toBe(2);
        expect(scoreMultipleResponse(mrQuestion, 'not json')).toBe(2);
    });

    it('is all-or-nothing when partialCredit is false', () => {
        const strict = { ...mrQuestion, partialCredit: false };
        expect(scoreMultipleResponse(strict, JSON.stringify(['a', 'b']))).toBe(4);
        expect(scoreMultipleResponse(strict, JSON.stringify(['a']))).toBe(0);
        expect(scoreMultipleResponse(strict, JSON.stringify(['a', 'b', 'c']))).toBe(0);
    });
});

const clozeQuestion: TestQuestion = {
    id: 'q-cloze',
    prompt: 'The capital of France is {{Paris|City of Paris}} and the capital of Germany is {{Berlin}}.',
    type: 'cloze',
    points: 4,
};

const clozeDropdownQuestion: TestQuestion = {
    id: 'q-cloze-dd',
    prompt: 'The capital of France is {{Paris|London|Berlin}} and the capital of Germany is {{Berlin|Paris|London}}.',
    type: 'cloze-dropdown',
    points: 4,
};

describe('scoreCloze', () => {
    it('awards full points when every gap matches an alternative, case-insensitively', () => {
        expect(scoreCloze(clozeQuestion, JSON.stringify({ 0: ' paris ', 1: 'berlin' }))).toBe(4);
        expect(scoreCloze(clozeQuestion, JSON.stringify({ 0: 'City of Paris', 1: 'Berlin' }))).toBe(4);
    });

    it('awards proportional credit by default', () => {
        expect(scoreCloze(clozeQuestion, JSON.stringify({ 0: 'Paris', 1: 'London' }))).toBe(2);
        expect(scoreCloze(clozeQuestion, JSON.stringify({}))).toBe(0);
    });

    it('treats unparsable responses as no answers', () => {
        expect(scoreCloze(clozeQuestion, '')).toBe(0);
        expect(scoreCloze(clozeQuestion, 'not json')).toBe(0);
    });

    it('is all-or-nothing when partialCredit is false', () => {
        const strict = { ...clozeQuestion, partialCredit: false };
        expect(scoreCloze(strict, JSON.stringify({ 0: 'Paris', 1: 'Berlin' }))).toBe(4);
        expect(scoreCloze(strict, JSON.stringify({ 0: 'Paris', 1: 'London' }))).toBe(0);
    });

    it('requires the first alternative for cloze-dropdown', () => {
        expect(scoreCloze(clozeDropdownQuestion, JSON.stringify({ 0: 'Paris', 1: 'Berlin' }))).toBe(4);
        expect(scoreCloze(clozeDropdownQuestion, JSON.stringify({ 0: 'London', 1: 'Berlin' }))).toBe(2);
    });
});

const matchingQuestion: TestQuestion = {
    id: 'q-match',
    prompt: 'Match the country to its capital',
    type: 'matching',
    points: 4,
    matchingPairs: [
        { id: 'p1', left: 'France', right: 'Paris' },
        { id: 'p2', left: 'Germany', right: 'Berlin' },
        { id: 'p3', left: 'Spain', right: 'Madrid' },
        { id: 'p4', left: 'Italy', right: 'Rome' },
    ],
};

describe('scoreMatching', () => {
    it('awards full points when every pair is matched to itself', () => {
        const response = JSON.stringify({ p1: 'p1', p2: 'p2', p3: 'p3', p4: 'p4' });
        expect(scoreMatching(matchingQuestion, response)).toBe(4);
    });

    it('awards proportional credit by default', () => {
        const response = JSON.stringify({ p1: 'p1', p2: 'p2', p3: 'p4', p4: 'p3' });
        expect(scoreMatching(matchingQuestion, response)).toBe(2);
    });

    it('treats unparsable responses as no answers', () => {
        expect(scoreMatching(matchingQuestion, '')).toBe(0);
        expect(scoreMatching(matchingQuestion, 'not json')).toBe(0);
    });

    it('is all-or-nothing when partialCredit is false', () => {
        const strict = { ...matchingQuestion, partialCredit: false };
        expect(scoreMatching(strict, JSON.stringify({ p1: 'p1', p2: 'p2', p3: 'p3', p4: 'p4' }))).toBe(4);
        expect(scoreMatching(strict, JSON.stringify({ p1: 'p1', p2: 'p2', p3: 'p4', p4: 'p3' }))).toBe(0);
    });
});

const orderingQuestion: TestQuestion = {
    id: 'q-order',
    prompt: 'Put these steps in the correct order',
    type: 'ordering',
    points: 4,
    orderItems: [
        { id: 'i1', text: 'First' },
        { id: 'i2', text: 'Second' },
        { id: 'i3', text: 'Third' },
        { id: 'i4', text: 'Fourth' },
    ],
};

describe('scoreOrdering', () => {
    it('awards full points for the correct order', () => {
        expect(scoreOrdering(orderingQuestion, JSON.stringify(['i1', 'i2', 'i3', 'i4']))).toBe(4);
    });

    it('awards proportional credit by default', () => {
        expect(scoreOrdering(orderingQuestion, JSON.stringify(['i1', 'i2', 'i4', 'i3']))).toBe(2);
    });

    it('treats unparsable responses as no answer', () => {
        expect(scoreOrdering(orderingQuestion, '')).toBe(0);
        expect(scoreOrdering(orderingQuestion, 'not json')).toBe(0);
    });

    it('is all-or-nothing when partialCredit is false', () => {
        const strict = { ...orderingQuestion, partialCredit: false };
        expect(scoreOrdering(strict, JSON.stringify(['i1', 'i2', 'i3', 'i4']))).toBe(4);
        expect(scoreOrdering(strict, JSON.stringify(['i1', 'i2', 'i4', 'i3']))).toBe(0);
    });
});

const categorizeQuestion: TestQuestion = {
    id: 'q-cat',
    prompt: 'Sort these animals by habitat',
    type: 'categorize',
    points: 4,
    categories: [
        { id: 'c1', label: 'Land' },
        { id: 'c2', label: 'Water' },
    ],
    categorizeItems: [
        { id: 'it1', text: 'Lion', categoryId: 'c1' },
        { id: 'it2', text: 'Shark', categoryId: 'c2' },
        { id: 'it3', text: 'Elephant', categoryId: 'c1' },
        { id: 'it4', text: 'Dolphin', categoryId: 'c2' },
    ],
};

describe('scoreCategorize', () => {
    it('awards full points when every item is assigned its correct category', () => {
        const response = JSON.stringify({ it1: 'c1', it2: 'c2', it3: 'c1', it4: 'c2' });
        expect(scoreCategorize(categorizeQuestion, response)).toBe(4);
    });

    it('awards proportional credit by default', () => {
        const response = JSON.stringify({ it1: 'c1', it2: 'c1', it3: 'c1', it4: 'c2' });
        expect(scoreCategorize(categorizeQuestion, response)).toBe(3);
    });

    it('treats unparsable responses as no answers', () => {
        expect(scoreCategorize(categorizeQuestion, '')).toBe(0);
        expect(scoreCategorize(categorizeQuestion, 'not json')).toBe(0);
    });

    it('is all-or-nothing when partialCredit is false', () => {
        const strict = { ...categorizeQuestion, partialCredit: false };
        expect(scoreCategorize(strict, JSON.stringify({ it1: 'c1', it2: 'c2', it3: 'c1', it4: 'c2' }))).toBe(4);
        expect(scoreCategorize(strict, JSON.stringify({ it1: 'c1', it2: 'c1', it3: 'c1', it4: 'c2' }))).toBe(0);
    });
});

const hotTextQuestion: TestQuestion = {
    id: 'q-hot',
    prompt: 'Click the capitals mentioned in the passage.',
    type: 'hot-text',
    points: 4,
    hotTextPassage: 'The capital of [[France]] is [[Paris]], and [[Berlin]] is in Germany.',
    hotTextCorrectIndices: [0, 1],
};

describe('scoreHotText', () => {
    it('awards full points when selection exactly matches the correct fragments', () => {
        expect(scoreHotText(hotTextQuestion, JSON.stringify([0, 1]))).toBe(4);
    });

    it('awards proportional credit by default', () => {
        expect(scoreHotText(hotTextQuestion, JSON.stringify([0]))).toBeCloseTo((4 * 2) / 3);
    });

    it('treats unparsable responses as no selection', () => {
        expect(scoreHotText(hotTextQuestion, '')).toBeCloseTo((4 * 1) / 3);
        expect(scoreHotText(hotTextQuestion, 'not json')).toBeCloseTo((4 * 1) / 3);
    });

    it('is all-or-nothing when partialCredit is false', () => {
        const strict = { ...hotTextQuestion, partialCredit: false };
        expect(scoreHotText(strict, JSON.stringify([0, 1]))).toBe(4);
        expect(scoreHotText(strict, JSON.stringify([0]))).toBe(0);
        expect(scoreHotText(strict, JSON.stringify([0, 1, 2]))).toBe(0);
    });

    it('returns 0 when the passage has no fragments', () => {
        const empty = { ...hotTextQuestion, hotTextPassage: 'No fragments here.' };
        expect(scoreHotText(empty, JSON.stringify([0]))).toBe(0);
    });
});

describe('autoScoreResponse for hot-text', () => {
    it('delegates to scoreHotText', () => {
        expect(autoScoreResponse(hotTextQuestion, JSON.stringify([0, 1]))).toBe(4);
    });
});

describe('autoScoreResponse for true-false', () => {
    it('awards full points for a matching response', () => {
        expect(autoScoreResponse(tfQuestion, 'true')).toBe(2);
    });

    it('awards 0 for a non-matching response', () => {
        expect(autoScoreResponse(tfQuestion, 'false')).toBe(0);
    });

    it('defaults correctBoolean to true when unset', () => {
        const { correctBoolean, ...rest } = tfQuestion;
        void correctBoolean;
        expect(autoScoreResponse(rest as TestQuestion, 'true')).toBe(2);
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
