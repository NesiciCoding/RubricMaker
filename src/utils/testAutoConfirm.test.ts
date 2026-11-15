import { describe, expect, it } from 'vitest';
import type { StudentTest, Test, TestQuestion } from '../types';
import { autoGradeVerdict, type ScorableQuestion } from '../../supabase/functions/_shared/testScoring.ts';
import { answerReviewState, attemptNeedsReview } from './testAutoConfirm';

const mc: TestQuestion = {
    id: 'mc',
    type: 'multiple-choice',
    prompt: 'Pick',
    points: 2,
    options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
    ],
};
const sa: TestQuestion = {
    id: 'sa',
    type: 'short-answer',
    prompt: 'Capital of France?',
    points: 1,
    expectedAnswers: ['Paris'],
};

describe('autoGradeVerdict', () => {
    it('is confident for option questions, right or wrong', () => {
        expect(autoGradeVerdict(mc, 'a')).toEqual({ score: 2, confident: true });
        expect(autoGradeVerdict(mc, 'b')).toEqual({ score: 0, confident: true });
    });

    it('is confident for an exact short answer and for a clearly wrong one', () => {
        expect(autoGradeVerdict(sa, ' paris ')).toEqual({ score: 1, confident: true });
        expect(autoGradeVerdict(sa, 'London').confident).toBe(true);
    });

    it('flags a short answer that is close to an accepted one', () => {
        expect(autoGradeVerdict(sa, 'Pariss')).toMatchObject({ confident: false, reason: 'near-miss' });
        expect(autoGradeVerdict(sa, 'the Paris')).toMatchObject({ confident: false, reason: 'near-miss' });
    });

    it('needs manual grading without an answer model', () => {
        expect(autoGradeVerdict({ ...sa, expectedAnswers: [] }, 'Paris')).toMatchObject({
            confident: false,
            reason: 'no-answer-model',
        });
        expect(
            autoGradeVerdict({ ...mc, options: [{ id: 'a', isCorrect: false }] } as ScorableQuestion, 'a').reason
        ).toBe('no-answer-model');
    });

    it('never auto-confirms open questions', () => {
        expect(autoGradeVerdict({ ...sa, type: 'open' }, 'long essay').reason).toBe('manual-type');
    });

    it('flags a numeric answer that is not a plain number', () => {
        const num: TestQuestion = { ...sa, type: 'numeric', expectedNumericValue: 3.5 };
        expect(autoGradeVerdict(num, '3,5')).toMatchObject({ confident: false, reason: 'unparseable' });
        expect(autoGradeVerdict(num, '3.5').confident).toBe(true);
    });
});

describe('typed cloze and key-word transformation', () => {
    const cloze: TestQuestion = {
        id: 'c',
        type: 'cloze',
        prompt: 'A {{cat|kitten}} sat on the {{carpet}}.',
        points: 2,
    };
    const kwt: TestQuestion = {
        id: 'k',
        type: 'key-word-transformation',
        prompt: 'She started learning',
        keyWord: 'SINCE',
        points: 2,
        expectedAnswers: ['has been learning // since'],
    };

    it('confirms cloze answers that are all right or clearly wrong', () => {
        expect(autoGradeVerdict(cloze, JSON.stringify({ 0: 'cat', 1: 'carpet' }))).toEqual({
            score: 2,
            confident: true,
        });
        expect(autoGradeVerdict(cloze, JSON.stringify({ 0: 'dog', 1: '' })).confident).toBe(true);
    });

    it('flags a cloze gap that is a near miss', () => {
        expect(autoGradeVerdict(cloze, JSON.stringify({ 0: 'cat', 1: 'carpett' }))).toMatchObject({
            confident: false,
            reason: 'near-miss',
        });
    });

    it('needs manual grading for a cloze gap without alternatives', () => {
        expect(autoGradeVerdict({ ...cloze, prompt: 'A {{}} sat' }, '{}').reason).toBe('no-answer-model');
    });

    it('confirms a full key-word answer and a clearly wrong one', () => {
        expect(autoGradeVerdict(kwt, 'has been learning since').confident).toBe(true);
        expect(autoGradeVerdict(kwt, 'is fond of tea').confident).toBe(true);
    });

    it('flags partial and near-miss key-word answers', () => {
        expect(autoGradeVerdict(kwt, 'has been learning').confident).toBe(false);
        expect(autoGradeVerdict(kwt, 'has been learnin since').reason).toBe('near-miss');
    });
});

describe('answerReviewState / attemptNeedsReview', () => {
    const test = { questions: [mc, sa, { ...sa, id: 'essay', type: 'open' as const }] } as Test;
    const attempt = (answers: StudentTest['answers']) => ({ answers }) as StudentTest;

    it('auto-confirms, decides and queues', () => {
        expect(answerReviewState(test, mc, { questionId: 'mc', response: 'a' }).state).toBe('auto-confirmed');
        expect(answerReviewState(test, mc, { questionId: 'mc', response: 'a', pointsEarned: 1 }).state).toBe('decided');
        expect(answerReviewState(test, sa, { questionId: 'sa', response: 'Pariss' }).state).toBe('needs-review');
    });

    it('queues everything again when auto-confirm is switched off', () => {
        const off = { ...test, autoConfirmScores: false };
        expect(answerReviewState(off, mc, { questionId: 'mc', response: 'a' }).state).toBe('needs-review');
    });

    it('only needs review while an unresolved answer remains', () => {
        expect(attemptNeedsReview(test, attempt([{ questionId: 'mc', response: 'a' }]))).toBe(false);
        expect(attemptNeedsReview(test, attempt([{ questionId: 'essay', response: 'text' }]))).toBe(true);
        expect(attemptNeedsReview(test, attempt([{ questionId: 'essay', response: 'text', pointsEarned: 1 }]))).toBe(
            false
        );
    });
});
