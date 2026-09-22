import { describe, it, expect } from 'vitest';
import {
    formatGivenAnswer,
    formatCorrectAnswer,
    describeTestCefr,
    buildTestStudentSummary,
    buildAnswerRows,
    describeTestMeta,
    pickLatestAttempt,
} from './testAnswerText';
import type { Student, StudentTest, Test, TestQuestion } from '../types';

const mc: TestQuestion = {
    id: 'q1',
    prompt: 'She ___ to school.',
    type: 'multiple-choice',
    points: 1,
    options: [
        { id: 'o1', text: 'go', isCorrect: false },
        { id: 'o2', text: 'goes', isCorrect: true },
    ],
};

const matching: TestQuestion = {
    id: 'q2',
    prompt: 'Match',
    type: 'matching',
    points: 2,
    matchingPairs: [
        { id: 'p1', left: 'cat', right: 'kat' },
        { id: 'p2', left: 'dog', right: 'hond' },
    ],
};

describe('formatGivenAnswer / formatCorrectAnswer', () => {
    it('multiple-choice given + correct', () => {
        expect(formatGivenAnswer(mc, { questionId: 'q1', response: 'o1' })).toBe('go');
        expect(formatCorrectAnswer(mc)).toBe('goes');
    });

    it('missing answer is a no-response marker', () => {
        expect(formatGivenAnswer(mc, undefined)).toBe('(no response)');
    });

    it('matching pairs render both given and correct', () => {
        const given = formatGivenAnswer(matching, {
            questionId: 'q2',
            response: JSON.stringify({ p1: 'p2', p2: 'p2' }),
        });
        expect(given).toBe('cat → hond; dog → hond');
        expect(formatCorrectAnswer(matching)).toBe('cat → kat; dog → hond');
    });

    it('open-ended has no correct answer', () => {
        expect(formatCorrectAnswer({ id: 'q', prompt: '', type: 'open', points: 5 })).toBe('');
    });

    it('true-false with an unset correctBoolean matches the scorer (true is correct)', () => {
        expect(formatCorrectAnswer({ id: 'q', prompt: '', type: 'true-false', points: 1 })).toBe('True');
        expect(formatCorrectAnswer({ id: 'q', prompt: '', type: 'true-false', points: 1, correctBoolean: false })).toBe(
            'False'
        );
    });
});

describe('pickLatestAttempt', () => {
    const at = (id: string, attemptNumber: number): StudentTest => ({
        id,
        testId: 't1',
        studentId: 's1',
        answers: [],
        status: 'graded',
        startedAt: '2024-01-01T00:00:00.000Z',
        attemptNumber,
    });
    it('returns null for an empty list', () => {
        expect(pickLatestAttempt([])).toBeNull();
    });
    it('picks the highest attemptNumber regardless of array order', () => {
        expect(pickLatestAttempt([at('a', 2), at('b', 1), at('c', 3)])?.id).toBe('c');
    });
});

const baseTest: Test = {
    id: 't1',
    name: 'Quiz',
    questions: [mc],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-01T00:00:00.000Z',
};

const student: Student = { id: 's1', name: 'Jane' } as Student;

describe('describeTestCefr', () => {
    it('regular test reports target + achieved against 70% threshold', () => {
        const test: Test = { ...baseTest, cefrTargetLevel: 'B1', cefrSkill: 'reading' };
        const st: StudentTest = {
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [{ questionId: 'q1', response: 'o2' }],
            status: 'graded',
            startedAt: '2024-01-02T00:00:00.000Z',
        };
        expect(describeTestCefr(test, st)).toContain('B1');
        expect(describeTestCefr(test, st)).toContain('achieved');
    });

    it('returns null when the test carries no CEFR data', () => {
        expect(describeTestCefr(baseTest, null)).toBeNull();
    });

    it('includes class-wide adjustment points in the achievement calculation', () => {
        const test: Test = { ...baseTest, cefrTargetLevel: 'B1' };
        const st: StudentTest = {
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [{ questionId: 'q1', response: 'o1' }], // 0/1 raw → 0%
            adjustmentPoints: 1, // +1 → 1/1 → 100%
            status: 'graded',
            startedAt: '2024-01-02T00:00:00.000Z',
        };
        expect(describeTestCefr(test, st)).toContain('achieved');
    });

    it('honours a configurable achieve threshold', () => {
        const test: Test = { ...baseTest, cefrTargetLevel: 'B1' };
        const st: StudentTest = {
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [{ questionId: 'q1', response: 'o2' }], // 100%
            status: 'graded',
            startedAt: '2024-01-02T00:00:00.000Z',
        };
        expect(describeTestCefr(test, st, 100)).toContain('achieved');
        expect(describeTestCefr(test, st, 100)).toContain('threshold 100%');

        const partial: StudentTest = {
            ...st,
            answers: [{ questionId: 'q1', response: 'o1' }], // 0%
        };
        expect(describeTestCefr(test, partial, 1)).toContain('not yet');
    });
});

describe('buildAnswerRows status', () => {
    const twoQ: Test = { ...baseTest, questions: [mc, matching] };
    it('marks correct, wrong and blank answers', () => {
        const st: StudentTest = {
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [{ questionId: 'q1', response: 'o2' }], // q1 correct, q2 unanswered
            status: 'graded',
            startedAt: '2024-01-02T00:00:00.000Z',
        };
        const rows = buildAnswerRows(twoQ, st, twoQ.questions);
        expect(rows[0].status).toBe('correct');
        expect(rows[1].status).toBe('blank');
    });
});

describe('describeTestMeta', () => {
    it('reports time on task and proctor flags', () => {
        const st: StudentTest = {
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [],
            status: 'submitted',
            startedAt: '2024-01-02T10:00:00.000Z',
            submittedAt: '2024-01-02T10:15:00.000Z',
            events: [{ type: 'tab_switch', at: '2024-01-02T10:05:00.000Z' }],
        };
        const lines = describeTestMeta(st);
        expect(lines.some((l) => l.includes('15 min'))).toBe(true);
        expect(lines.some((l) => l.includes('tab switch'))).toBe(true);
    });
});

describe('buildTestStudentSummary', () => {
    it('includes score, given and correct answers', () => {
        const st: StudentTest = {
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [{ questionId: 'q1', response: 'o1' }],
            status: 'graded',
            startedAt: '2024-01-02T00:00:00.000Z',
        };
        const out = buildTestStudentSummary(baseTest, st, student, baseTest.questions);
        expect(out).toContain('Jane');
        expect(out).toContain('Given:   go');
        expect(out).toContain('Correct: goes');
        expect(out).toContain('0/1 pts');
    });
});
