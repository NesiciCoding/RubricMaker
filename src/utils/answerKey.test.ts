import { describe, expect, it } from 'vitest';
import type { StudentTest, Test, TestAnswer, TestQuestion } from '../types';
import {
    acceptedAnswersOf,
    canAdoptAnswer,
    markAdoptedAnswersCorrect,
    markMatchingAnswersCorrect,
    normaliseAnswer,
    withAcceptedAnswer,
    withAdoptedAnswer,
} from './answerKey';

const shortAnswer: TestQuestion = {
    id: 'q1',
    type: 'short-answer',
    prompt: 'Capital of France?',
    points: 2,
    expectedAnswers: ['Paris'],
};

const open: TestQuestion = { id: 'q2', type: 'open', prompt: 'Explain why.', points: 5 };

const test: Test = {
    id: 'test',
    name: 'Capitals',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [shortAnswer, open],
};

function attempt(id: string, studentId: string, answers: TestAnswer[]): StudentTest {
    return {
        id,
        testId: 'test',
        studentId,
        answers,
        status: 'submitted',
        startedAt: '2026-01-01T09:00:00.000Z',
    };
}

describe('canAdoptAnswer', () => {
    it('only offers free-text question types', () => {
        expect(canAdoptAnswer(shortAnswer)).toBe(true);
        expect(canAdoptAnswer(open)).toBe(true);
        expect(canAdoptAnswer({ ...shortAnswer, type: 'key-word-transformation' })).toBe(true);
        expect(canAdoptAnswer({ ...shortAnswer, type: 'multiple-choice' })).toBe(false);
        expect(canAdoptAnswer({ ...shortAnswer, type: 'cloze' })).toBe(true);
        expect(canAdoptAnswer({ ...shortAnswer, type: 'cloze-dropdown' })).toBe(true);
    });
});

describe('normaliseAnswer', () => {
    it('ignores case and runs of whitespace', () => {
        expect(normaliseAnswer('  The   CAT sat ')).toBe('the cat sat');
    });
});

describe('acceptedAnswersOf', () => {
    it('falls back to the single expected answer', () => {
        expect(acceptedAnswersOf({ ...shortAnswer, expectedAnswers: undefined, expectedAnswer: 'Paris' })).toEqual([
            'Paris',
        ]);
        expect(acceptedAnswersOf(open)).toEqual([]);
    });
});

describe('withAcceptedAnswer', () => {
    it('appends the trimmed answer and stamps the test as edited', () => {
        const next = withAcceptedAnswer(test, 'q1', '  Lyon ');
        expect(next).not.toBe(test);
        expect(next.questions[0].expectedAnswers).toEqual(['Paris', 'Lyon']);
        expect(next.questions[1]).toBe(open);
        expect(next.updatedAt).toBeTruthy();
    });

    it('treats a differently cased or spaced copy as already present', () => {
        expect(withAcceptedAnswer(test, 'q1', ' paris ')).toBe(test);
    });

    it('is a no-op for an empty answer or an unknown question', () => {
        expect(withAcceptedAnswer(test, 'q1', '   ')).toBe(test);
        expect(withAcceptedAnswer(test, 'missing', 'Lyon')).toBe(test);
    });

    it('keeps an open question answer in the same list', () => {
        const next = withAcceptedAnswer(test, 'q2', 'Because it rained.');
        expect(next.questions[1].expectedAnswers).toEqual(['Because it rained.']);
    });
});

describe('markMatchingAnswersCorrect', () => {
    it('awards full points to an exact match, ignoring case and spacing', () => {
        const other = attempt('st2', 's2', [{ questionId: 'q1', response: '  paris ' }]);
        const result = markMatchingAnswersCorrect(test, 'q1', 'Paris', [other]);
        expect(result.matched).toBe(1);
        expect(result.attempts[0].answers[0].pointsEarned).toBe(2);
        expect(result.attempts[0].status).toBe('graded');
        expect(result.attempts[0].rawTotalPoints).toBe(2);
    });

    it('leaves a different answer, a decided answer and the source submission alone', () => {
        const wrong = attempt('st2', 's2', [{ questionId: 'q1', response: 'London' }]);
        const decided = attempt('st3', 's3', [{ questionId: 'q1', response: 'Paris', pointsEarned: 0 }]);
        const source = attempt('st4', 's4', [{ questionId: 'q1', response: 'Paris' }]);
        const result = markMatchingAnswersCorrect(test, 'q1', 'Paris', [wrong, decided, source], 'st4');
        expect(result.matched).toBe(0);
        expect(result.attempts).toEqual([]);
    });

    it('only rewrites the latest answer for the question in an attempt', () => {
        const retried = attempt('st2', 's2', [
            { questionId: 'q1', response: 'London' },
            { questionId: 'q1', response: 'Paris' },
        ]);
        const result = markMatchingAnswersCorrect(test, 'q1', 'Paris', [retried]);
        expect(result.attempts[0].answers[0].pointsEarned).toBeUndefined();
        expect(result.attempts[0].answers[1].pointsEarned).toBe(2);
    });

    it('does nothing without a usable question or points', () => {
        expect(markMatchingAnswersCorrect(test, 'missing', 'Paris', [])).toEqual({ attempts: [], matched: 0 });
        expect(markMatchingAnswersCorrect(test, 'q1', '   ', [])).toEqual({ attempts: [], matched: 0 });
        const noPoints: Test = { ...test, questions: [{ ...shortAnswer, points: 0 }] };
        expect(markMatchingAnswersCorrect(noPoints, 'q1', 'Paris', [])).toEqual({ attempts: [], matched: 0 });
    });
});

describe('cloze answer-key adoption', () => {
    const cloze: TestQuestion = {
        id: 'c1',
        type: 'cloze',
        prompt: 'She {{has}} a {{cat|kitten}}.',
        points: 2,
    };
    const clozeBank: TestQuestion = { ...cloze, id: 'c2', type: 'cloze-bank' };
    const clozeTest: Test = { ...test, questions: [cloze, clozeBank] };

    it('offers adoption for every gap type, dropdown included', () => {
        expect(canAdoptAnswer(cloze)).toBe(true);
        expect(canAdoptAnswer(clozeBank)).toBe(true);
        expect(canAdoptAnswer({ ...cloze, type: 'cloze-dropdown' })).toBe(true);
    });

    it('adds each typed gap answer as an extra alternative', () => {
        const next = withAdoptedAnswer(clozeTest, 'c1', JSON.stringify({ 0: 'had', 1: 'kitty' }));
        expect(next.questions[0].prompt).toBe('She {{has|had}} a {{cat|kitten|kitty}}.');
        expect(next.questions[1]).toBe(clozeBank);
    });

    it('leaves an answer already accepted alone, ignoring case and spacing', () => {
        expect(withAdoptedAnswer(clozeTest, 'c1', JSON.stringify({ 0: ' HAS ', 1: 'Cat' }))).toBe(clozeTest);
    });

    it('skips gaps the student left blank', () => {
        const next = withAdoptedAnswer(clozeTest, 'c1', JSON.stringify({ 0: '', 1: 'kitty' }));
        expect(next.questions[0].prompt).toBe('She {{has}} a {{cat|kitten|kitty}}.');
    });

    it('routes a short answer to the accepted-answer list', () => {
        expect(withAdoptedAnswer(test, 'q1', 'Lyon').questions[0].expectedAnswers).toEqual(['Paris', 'Lyon']);
    });

    it('marks other students whose gaps all match exactly', () => {
        const next = withAdoptedAnswer(clozeTest, 'c1', JSON.stringify({ 0: 'had', 1: 'kitty' }));
        const other = attempt('st2', 's2', [{ questionId: 'c1', response: JSON.stringify({ 0: 'had', 1: 'kitty' }) }]);
        const result = markAdoptedAnswersCorrect(next, 'c1', JSON.stringify({ 0: 'had', 1: 'kitty' }), [other]);
        expect(result.matched).toBe(1);
        expect(result.attempts[0].answers[0].pointsEarned).toBe(2);
        expect(result.attempts[0].rawTotalPoints).toBe(2);
    });

    it('does not mark a response where only some gaps match', () => {
        const other = attempt('st2', 's2', [{ questionId: 'c1', response: JSON.stringify({ 0: 'had', 1: 'cat' }) }]);
        expect(
            markAdoptedAnswersCorrect(clozeTest, 'c1', JSON.stringify({ 0: 'had', 1: 'kitty' }), [other]).matched
        ).toBe(0);
    });

    it('routes matching by question type and ignores an answerless response', () => {
        const other = attempt('st2', 's2', [{ questionId: 'q1', response: 'Paris' }]);
        expect(markAdoptedAnswersCorrect(test, 'q1', 'Paris', [other]).matched).toBe(1);
        expect(markAdoptedAnswersCorrect(clozeTest, 'c1', '{}', [other])).toEqual({ attempts: [], matched: 0 });
        expect(markAdoptedAnswersCorrect(test, 'missing', 'x', [other])).toEqual({ attempts: [], matched: 0 });
    });
});
