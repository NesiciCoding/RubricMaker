import { describe, expect, it } from 'vitest';
import {
    autoScoreResponse,
    isAutoScorable,
    type ScorableQuestion,
} from '../../supabase/functions/_shared/testScoring.ts';

// Golden scores for every auto-scored question type. The same function scores the client view,
// submit-test's placement replay and next-placement-question's live run, so a change here changes
// all three at once — update a fixture only when the scoring rule itself is meant to change.

interface Fixture {
    name: string;
    question: ScorableQuestion;
    response: string;
    expected: number;
}

const mc: ScorableQuestion = {
    type: 'multiple-choice',
    points: 2,
    prompt: 'Capital of France?',
    options: [
        { id: 'a', isCorrect: true },
        { id: 'b', isCorrect: false },
    ],
};

const mr: ScorableQuestion = {
    type: 'multiple-response',
    points: 4,
    prompt: 'Pick the verbs',
    options: [
        { id: 'a', isCorrect: true },
        { id: 'b', isCorrect: true },
        { id: 'c', isCorrect: false },
        { id: 'd', isCorrect: false },
    ],
};

const cloze: ScorableQuestion = {
    type: 'cloze',
    points: 2,
    prompt: "She {{has|'s}} lived here {{since}} 2010.",
};

const clozeDropdown: ScorableQuestion = {
    type: 'cloze-dropdown',
    points: 2,
    prompt: 'I {{went|go|gone}} home and {{ate|eat}} dinner.',
};

const matching: ScorableQuestion = {
    type: 'matching',
    points: 3,
    prompt: 'Match',
    matchingPairs: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
};

const ordering: ScorableQuestion = {
    type: 'ordering',
    points: 4,
    prompt: 'Order',
    orderItems: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }, { id: 'i4' }],
};

const categorize: ScorableQuestion = {
    type: 'categorize',
    points: 2,
    prompt: 'Sort',
    categorizeItems: [
        { id: 'x', categoryId: 'noun' },
        { id: 'y', categoryId: 'verb' },
    ],
};

const hotText: ScorableQuestion = {
    type: 'hot-text',
    points: 4,
    prompt: 'Select the errors',
    hotTextPassage: 'He [[go]] to school [[every]] day and [[play]] [[football]].',
    hotTextCorrectIndices: [0, 2],
};

const fixtures: Fixture[] = [
    { name: 'multiple-choice correct', question: mc, response: 'a', expected: 2 },
    { name: 'multiple-choice wrong', question: mc, response: 'b', expected: 0 },
    { name: 'multiple-choice blank', question: mc, response: '', expected: 0 },

    { name: 'multiple-response exact', question: mr, response: '["a","b"]', expected: 4 },
    { name: 'multiple-response partial', question: mr, response: '["a","c"]', expected: 2 },
    { name: 'multiple-response malformed JSON', question: mr, response: '{nope', expected: 2 },
    {
        name: 'multiple-response partial, all-or-nothing',
        question: { ...mr, partialCredit: false },
        response: '["a"]',
        expected: 0,
    },

    {
        name: 'true-false correct',
        question: { type: 'true-false', points: 1, prompt: '', correctBoolean: false },
        response: 'false',
        expected: 1,
    },
    {
        name: 'true-false defaults to true',
        question: { type: 'true-false', points: 1, prompt: '' },
        response: 'true',
        expected: 1,
    },

    {
        name: 'short-answer case/whitespace-insensitive alternative',
        question: { type: 'short-answer', points: 3, prompt: '', expectedAnswers: ['colour', 'color'] },
        response: '  Color ',
        expected: 3,
    },
    {
        name: 'short-answer legacy expectedAnswer',
        question: { type: 'short-answer', points: 1, prompt: '', expectedAnswer: 'went' },
        response: 'goed',
        expected: 0,
    },
    {
        name: 'short-answer with no key',
        question: { type: 'short-answer', points: 1, prompt: '' },
        response: 'anything',
        expected: 0,
    },

    {
        name: 'numeric within tolerance',
        question: { type: 'numeric', points: 2, prompt: '', expectedNumericValue: 3.14, numericTolerance: 0.01 },
        response: '3.13',
        expected: 2,
    },
    {
        name: 'numeric blank never matches 0',
        question: { type: 'numeric', points: 2, prompt: '', expectedNumericValue: 0 },
        response: ' ',
        expected: 0,
    },

    { name: 'cloze all gaps, alternative accepted', question: cloze, response: '{"0":"\'S","1":"since"}', expected: 2 },
    { name: 'cloze one gap', question: cloze, response: '{"0":"has","1":"for"}', expected: 1 },
    {
        name: 'cloze one gap, all-or-nothing',
        question: { ...cloze, partialCredit: false },
        response: '{"0":"has"}',
        expected: 0,
    },
    {
        name: 'cloze-dropdown requires first option',
        question: clozeDropdown,
        response: '{"0":"went","1":"eat"}',
        expected: 1,
    },
    {
        name: 'cloze with no gaps',
        question: { type: 'cloze', points: 1, prompt: 'No gaps here' },
        response: '{}',
        expected: 0,
    },

    { name: 'matching two of three', question: matching, response: '{"p1":"p1","p2":"p3","p3":"p3"}', expected: 2 },
    { name: 'ordering half right', question: ordering, response: '["i1","i2","i4","i3"]', expected: 2 },
    { name: 'categorize one of two', question: categorize, response: '{"x":"noun","y":"noun"}', expected: 1 },

    { name: 'hot-text exact selection', question: hotText, response: '[0,2]', expected: 4 },
    { name: 'hot-text one wrong selection', question: hotText, response: '[0,2,3]', expected: 3 },
    {
        name: 'hot-text wrong selection, all-or-nothing',
        question: { ...hotText, partialCredit: false },
        response: '[0]',
        expected: 0,
    },

    {
        name: 'open is never auto-scored',
        question: { type: 'open', points: 5, prompt: '' },
        response: 'essay',
        expected: 0,
    },
    {
        name: 'audio-response is never auto-scored',
        question: { type: 'audio-response', points: 5, prompt: '' },
        response: 'rec',
        expected: 0,
    },
    {
        name: 'unknown type scores 0',
        question: { type: 'future-type', points: 5, prompt: '' },
        response: 'x',
        expected: 0,
    },
];

describe('autoScoreResponse golden fixtures', () => {
    it.each(fixtures)('$name', ({ question, response, expected }) => {
        expect(autoScoreResponse(question, response)).toBeCloseTo(expected, 10);
    });
});

describe('isAutoScorable', () => {
    it('excludes only open questions (routing, staircase and generator rely on this)', () => {
        expect(isAutoScorable({ type: 'open' })).toBe(false);
        expect(isAutoScorable({ type: 'cloze' })).toBe(true);
        expect(isAutoScorable({ type: 'audio-response' })).toBe(true);
    });
});
