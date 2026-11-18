import { describe, it, expect, beforeAll } from 'vitest';
import { initTestI18n } from '../test-utils/initI18n';
import {
    formatGivenAnswer,
    formatCorrectAnswer,
    describeTestCefr,
    buildTestStudentSummary,
    buildAnswerRows,
    describeTestMeta,
    pickLatestAttempt,
    calcLinkedItemAccuracies,
} from './testAnswerText';
import type { Student, StudentTest, Test, TestQuestion } from '../types';

beforeAll(async () => {
    await initTestI18n();
});

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

const gradedSubmission: StudentTest = {
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [{ questionId: 'q1', response: 'o1' }],
    status: 'graded',
    startedAt: '2024-01-02T00:00:00.000Z',
};

describe('buildTestStudentSummary', () => {
    it('shows only the condensed header fields and no per-question rows', () => {
        const out = buildTestStudentSummary(baseTest, gradedSubmission, student, baseTest.questions, {
            className: '3HAVO',
        });
        expect(out).toContain('Name: Jane');
        expect(out).toContain('Class: 3HAVO');
        expect(out).toContain('Score: 0% correct');
        expect(out).not.toContain('Given');
        expect(out).not.toContain('Correct:');
        expect(out).not.toContain('Q1.');
    });

    it('shows the supplied level', () => {
        const out = buildTestStudentSummary(baseTest, gradedSubmission, student, baseTest.questions, {
            level: 'HAVO',
        });
        expect(out).toContain('Level: HAVO');
    });

    it('omits the class and level lines when neither is supplied', () => {
        const out = buildTestStudentSummary(baseTest, gradedSubmission, student, baseTest.questions);
        expect(out).not.toContain('Class:');
        expect(out).not.toContain('Level:');
    });
});

describe('calcLinkedItemAccuracies', () => {
    const standard = {
        guid: 'g1',
        statementNotation: 'CCSS.1',
        description: 'Do the thing',
        standardSetTitle: 'CCSS',
        jurisdictionTitle: 'US',
    };
    const grammar = {
        descriptorId: 'gram-1',
        framework: 'grammar' as const,
        categoryId: 'c1',
        categoryLabelEn: 'Tense',
        categoryLabelNl: 'Tijd',
        categoryColor: '#000000',
        descriptionEn: 'Past simple',
        descriptionNl: 'Verleden tijd',
    };
    const linkedTest: Test = {
        ...baseTest,
        questions: [
            { ...mc, id: 'q1', points: 1, linkedStandards: [standard] },
            { ...mc, id: 'q2', prompt: 'Other', points: 2, frameworkDescriptors: [grammar] },
        ],
    };
    const answers: StudentTest = {
        ...gradedSubmission,
        answers: [
            { questionId: 'q1', response: 'o2' },
            { questionId: 'q2', response: 'o1' },
        ],
    };

    it("rolls the student's points up per linked item, strongest first", () => {
        const items = calcLinkedItemAccuracies(
            linkedTest.questions,
            buildAnswerRows(linkedTest, answers, linkedTest.questions)
        );
        expect(items.map((i) => i.label)).toEqual(['CCSS.1', 'Past simple']);
        expect(items.map((i) => i.accuracyPct)).toEqual([100, 0]);
    });

    it('renders the percentage overview in the summary', () => {
        const out = buildTestStudentSummary(linkedTest, answers, student, linkedTest.questions);
        expect(out).toContain('Linked frameworks & grammar');
        expect(out).toContain('\n  100%  CCSS.1\n');
        expect(out).toContain('\n    0%  Past simple');
    });

    it('counts an unanswered linked question as zero credit', () => {
        const partial: StudentTest = { ...answers, answers: [{ questionId: 'q1', response: 'o2' }] };
        const items = calcLinkedItemAccuracies(
            linkedTest.questions,
            buildAnswerRows(linkedTest, partial, linkedTest.questions)
        );
        expect(items.find((i) => i.label === 'Past simple')?.accuracyPct).toBe(0);
    });
});

describe('matrix and cloze-bank answer text', () => {
    const matrix: TestQuestion = {
        id: 'qm',
        prompt: '',
        type: 'matrix',
        points: 2,
        matrixColumns: [
            { id: 'c1', text: 'True' },
            { id: 'c2', text: 'False' },
        ],
        matrixRows: [
            { id: 'r1', text: 'Sky is blue', correctColumnId: 'c1' },
            { id: 'r2', text: 'Fire is cold', correctColumnId: 'c2' },
        ],
    };
    const bank: TestQuestion = { id: 'qb', prompt: 'A {{cat}} sat.', type: 'cloze-bank', points: 1 };

    it('renders matrix given and correct answers', () => {
        const given = formatGivenAnswer(matrix, { questionId: 'qm', response: '{"r1":"c1"}' });
        expect(given).toBe('Sky is blue → True; Fire is cold → ___');
        expect(formatCorrectAnswer(matrix)).toBe('Sky is blue → True; Fire is cold → False');
    });

    it('renders cloze-bank like a cloze', () => {
        expect(formatGivenAnswer(bank, { questionId: 'qb', response: '{"0":"cat"}' })).toBe('A [cat] sat.');
        expect(formatCorrectAnswer(bank)).toBe('A [cat] sat.');
    });
});

describe('dictation answer text', () => {
    const dictation: TestQuestion = {
        id: 'qd',
        prompt: '',
        type: 'dictation',
        points: 2,
        dictationText: 'Hello there.',
    };
    it('uses the dictated text as the correct answer', () => {
        expect(formatCorrectAnswer(dictation)).toBe('Hello there.');
        expect(formatGivenAnswer(dictation, { questionId: 'qd', response: 'hello' })).toBe('hello');
    });
});

describe('key word transformation answer text', () => {
    it('shows each accepted answer with its marked parts', () => {
        const q: TestQuestion = {
            id: 'qk',
            prompt: '',
            type: 'key-word-transformation',
            points: 2,
            expectedAnswers: ['have worked // for years', 'have been working // for years'],
        };
        expect(formatCorrectAnswer(q)).toBe('have worked + for years / have been working + for years');
    });
});

describe('error-correction and sentence-builder answer text', () => {
    const errors: TestQuestion = {
        id: 'qe',
        prompt: '',
        type: 'error-correction',
        points: 2,
        errorPassage: 'He [[go|goes]] to school [[every]] day.',
    };
    const builder: TestQuestion = {
        id: 'qs',
        prompt: '',
        type: 'sentence-builder',
        points: 2,
        sentenceTargets: ['I go home'],
    };
    it('formats picks with corrections and the correct key', () => {
        expect(formatGivenAnswer(errors, { questionId: 'qe', response: '{"0":"goes","1":""}' })).toBe(
            'go → goes; every'
        );
        expect(formatCorrectAnswer(errors)).toBe('go → goes');
    });
    it('formats the placed sentence and accepted sentences', () => {
        expect(formatGivenAnswer(builder, { questionId: 'qs', response: '["I","go"]' })).toBe('I go');
        expect(formatCorrectAnswer(builder)).toBe('I go home');
    });
});

describe('error-correction alternatives and bad responses', () => {
    const q: TestQuestion = {
        id: 'qe',
        prompt: '',
        type: 'error-correction',
        points: 2,
        errorPassage: 'He [[play|plays|is playing]] [[football]].',
    };
    it('lists every accepted correction', () => {
        expect(formatCorrectAnswer(q)).toBe('play → plays / is playing');
    });
    it('treats wrong-shaped responses as no answer', () => {
        const none = formatGivenAnswer({ ...q, type: 'sentence-builder' }, { questionId: 'qe', response: '{"0":"I"}' });
        expect(none).not.toContain('{');
        expect(formatGivenAnswer(q, { questionId: 'qe', response: '[1,2]' })).toBe(
            formatGivenAnswer(q, { questionId: 'qe', response: '' })
        );
    });
});
