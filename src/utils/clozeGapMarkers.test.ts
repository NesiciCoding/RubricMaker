import { describe, expect, it } from 'vitest';
import type { StudentTest, Test, TestQuestion } from '../types';
import {
    clozeGapToSyntax,
    gapCorrectAnswers,
    parseClozeGaps,
    scoreCloze,
    splitClozeOptions,
} from '../../supabase/functions/_shared/testScoring';
import { addDropdownCorrectAnswer, addDropdownDistractor, plainQuestionPromptText } from './clozeParse';
import { testQuestionIssues } from './testQuestionIssues';
import { markAdoptedAnswersCorrect, withAdoptedAnswer } from './answerKey';

const dropdown: TestQuestion = {
    id: 'd1',
    type: 'cloze-dropdown',
    points: 1,
    prompt: "She {{=doesn't|=does not|~don't}} like it.",
};

const dropdownTest: Test = {
    id: 'test',
    name: 'Dropdown',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [dropdown],
};

function attempt(id: string, answer: string): StudentTest {
    return {
        id,
        testId: 'test',
        studentId: 's1',
        answers: [{ questionId: 'd1', response: JSON.stringify({ 0: answer }) }],
        status: 'submitted',
        startedAt: '2026-01-01T09:00:00.000Z',
    };
}

describe('cloze option markers', () => {
    it('reads = as a correct answer and ~ as a wrong option', () => {
        expect(splitClozeOptions('=cat|~dog|bird')).toEqual({
            alternatives: ['cat', 'dog', 'bird'],
            roles: ['correct', 'wrong', null],
        });
    });

    it('leaves a prompt without markers exactly as it was', () => {
        const [gap] = parseClozeGaps('A {{cat|kitten}} B');
        expect(gap.alternatives).toEqual(['cat', 'kitten']);
        expect(gap.roles).toBeUndefined();
    });

    it('accepts every unmarked alternative for a typed gap and only the first for a legacy dropdown', () => {
        const [gap] = parseClozeGaps('A {{cat|kitten}} B');
        expect(gapCorrectAnswers(gap, false)).toEqual(['cat', 'kitten']);
        expect(gapCorrectAnswers(gap, true)).toEqual(['cat']);
    });

    it('accepts every marked alternative except the ~ ones', () => {
        const [gap] = parseClozeGaps("She {{=doesn't|=does not|~don't}} like it.");
        expect(gapCorrectAnswers(gap, true)).toEqual(["doesn't", 'does not']);
    });

    it('round-trips a marked gap through its stored syntax', () => {
        const gap = {
            index: 0,
            alternatives: ["doesn't", 'does not', "don't"],
            roles: ['correct', 'correct', 'wrong'] as const,
        };
        const [parsed] = parseClozeGaps(clozeGapToSyntax({ ...gap, roles: [...gap.roles] }));
        expect(parsed.alternatives).toEqual(gap.alternatives);
        expect(parsed.roles).toEqual([...gap.roles]);
    });
});

describe('dropdown scoring with several correct answers', () => {
    it('scores every correct option and rejects a distractor', () => {
        expect(scoreCloze(dropdown, JSON.stringify({ 0: 'does not' }))).toBe(1);
        expect(scoreCloze(dropdown, JSON.stringify({ 0: "doesn't" }))).toBe(1);
        expect(scoreCloze(dropdown, JSON.stringify({ 0: "don't" }))).toBe(0);
    });

    it('keeps the legacy single-answer dropdown behaviour', () => {
        const legacy = { type: 'cloze-dropdown', points: 1, prompt: 'Pick {{one|two}}' };
        expect(scoreCloze(legacy, JSON.stringify({ 0: 'one' }))).toBe(1);
        expect(scoreCloze(legacy, JSON.stringify({ 0: 'two' }))).toBe(0);
    });
});

describe('dropdown adoption and editing helpers', () => {
    it('upgrades a legacy gap when a second correct answer is added', () => {
        expect(addDropdownCorrectAnswer('Pick {{one|two}}', 0, 'three')).toBe('Pick {{=one|~two|=three}}');
    });

    it('adds a distractor without making it correct', () => {
        const prompt = addDropdownDistractor('Pick {{=one|=two}}', 0, 'three');
        expect(prompt).toBe('Pick {{=one|=two|~three}}');
        expect(gapCorrectAnswers(parseClozeGaps(prompt)[0], true)).toEqual(['one', 'two']);
    });

    it('appends an accepted answer as a new correct option', () => {
        const next = withAdoptedAnswer(dropdownTest, 'd1', JSON.stringify({ 0: 'never' }));
        expect(next.questions[0].prompt).toBe("She {{=doesn't|=does not|~don't|=never}} like it.");
    });

    it('leaves an already accepted dropdown answer alone', () => {
        expect(withAdoptedAnswer(dropdownTest, 'd1', JSON.stringify({ 0: 'DOES NOT' }))).toBe(dropdownTest);
    });

    it('marks other students who picked the newly accepted option', () => {
        const next = withAdoptedAnswer(dropdownTest, 'd1', JSON.stringify({ 0: 'never' }));
        const result = markAdoptedAnswersCorrect(next, 'd1', JSON.stringify({ 0: 'never' }), [attempt('st2', 'never')]);
        expect(result.matched).toBe(1);
        expect(result.attempts[0].answers[0].pointsEarned).toBe(1);
    });

    it('also marks a differently marked correct option for the same gap', () => {
        const next = withAdoptedAnswer(dropdownTest, 'd1', JSON.stringify({ 0: 'never' }));
        const result = markAdoptedAnswersCorrect(next, 'd1', JSON.stringify({ 0: 'never' }), [
            attempt('st2', 'does not'),
        ]);
        expect(result.matched).toBe(1);
    });
});

describe('dropdown prompt text and validation', () => {
    it('reads a gap as its first correct answer', () => {
        expect(plainQuestionPromptText(dropdown)).toBe("She doesn't like it.");
    });

    it('flags a gap whose every option is a distractor', () => {
        expect(testQuestionIssues({ ...dropdown, prompt: 'She {{~a|~b}} it.' })).toContain('no_correct_gap_answer');
        expect(testQuestionIssues(dropdown)).toEqual([]);
        expect(testQuestionIssues({ ...dropdown, prompt: 'She {{a|b}} it.' })).toEqual([]);
    });
});

describe('review follow-ups', () => {
    it('keeps an unmarked accepted option correct when a distractor is added', () => {
        const prompt = addDropdownDistractor('Pick {{=one|two}}', 0, 'three');
        expect(prompt).toBe('Pick {{=one|=two|~three}}');
        expect(gapCorrectAnswers(parseClozeGaps(prompt)[0], true)).toEqual(['one', 'two']);
    });

    it('does not apply typed-answer tolerance to dropdown options', () => {
        const question = {
            type: 'cloze-dropdown',
            points: 1,
            prompt: 'Pick {{=house|~horse}}',
            answerTolerance: { slips: true },
        };
        expect(scoreCloze(question, JSON.stringify({ 0: 'horse' }))).toBe(0);
        expect(scoreCloze(question, JSON.stringify({ 0: 'house' }))).toBe(1);
    });

    it('requires every gap to match before propagating a partially filled adoption', () => {
        const question: TestQuestion = {
            id: 'c9',
            type: 'cloze',
            prompt: 'She {{has}} a {{cat|kitten}}.',
            points: 2,
        };
        const test: Test = { ...dropdownTest, questions: [question] };
        const other: StudentTest = {
            id: 'st9',
            testId: 'test',
            studentId: 's9',
            answers: [{ questionId: 'c9', response: JSON.stringify({ 0: 'had', 1: 'dog' }) }],
            status: 'submitted',
            startedAt: '2026-01-01T09:00:00.000Z',
        };
        const next = withAdoptedAnswer(test, 'c9', JSON.stringify({ 0: 'had', 1: '' }));
        expect(markAdoptedAnswersCorrect(next, 'c9', '{"0":"had","1":""}', [other]).matched).toBe(0);
    });
});
