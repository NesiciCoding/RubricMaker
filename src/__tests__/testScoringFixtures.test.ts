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

function tolerantFixtures(): Fixture[] {
    const sa = (answerTolerance: ScorableQuestion['answerTolerance'], ans = "I don't know"): ScorableQuestion => ({
        type: 'short-answer',
        points: 2,
        prompt: '',
        expectedAnswers: [ans],
        answerTolerance,
    });
    return [
        {
            name: 'punctuation: apostrophe inside a word is dropped',
            question: sa({ punctuation: true }),
            response: 'I dont know',
            expected: 2,
        },
        {
            name: 'punctuation: hyphen inside a word is dropped',
            question: sa({ punctuation: true }, 'co-operate'),
            response: 'cooperate',
            expected: 2,
        },
        {
            name: 'slips: the typed side may be under five letters',
            question: sa({ slips: true }, 'since'),
            response: 'sinc',
            expected: 2,
        },
        {
            name: 'tolerance off: curly quote misses',
            question: sa(undefined),
            response: 'I don\u2019t know',
            expected: 0,
        },
        {
            name: 'punctuation: curly quote, trailing dot, spaces',
            question: sa({ punctuation: true }),
            response: ' I  don\u2019t know. ',
            expected: 2,
        },
        {
            name: 'contractions: expanded form',
            question: sa({ contractions: true }),
            response: 'I do not know',
            expected: 2,
        },
        {
            name: 'contractions: only listed forms expand',
            question: sa({ contractions: true }, 'she is happy'),
            response: "she's happy",
            expected: 0,
        },
        {
            name: 'contractions: cannot',
            question: sa({ contractions: true }, "can't"),
            response: 'cannot',
            expected: 2,
        },
        {
            name: 'spelling: British vs American',
            question: sa({ spelling: true }, 'favourite colour'),
            response: 'favorite color',
            expected: 2,
        },
        {
            name: 'spelling off: no equivalence',
            question: sa({ punctuation: true }, 'colour'),
            response: 'color',
            expected: 0,
        },
        {
            name: 'slips: one typo in a 5+ letter word',
            question: sa({ slips: true }, 'because'),
            response: 'becuse',
            expected: 2,
        },
        {
            name: 'slips: transposition is two edits',
            question: sa({ slips: true }, 'because'),
            response: 'becuase',
            expected: 0,
        },
        { name: 'slips: short words stay exact', question: sa({ slips: true }, 'went'), response: 'want', expected: 0 },
        {
            name: 'slips: word count must match',
            question: sa({ slips: true }, 'a lot of people'),
            response: 'a lot people',
            expected: 0,
        },
        {
            name: 'cloze open gap honours tolerance',
            question: { ...cloze, answerTolerance: { slips: true } },
            response: '{"0":"has","1":"sinse"}',
            expected: 2,
        },
        {
            name: 'cloze-dropdown ignores tolerance',
            question: { ...clozeDropdown, answerTolerance: { slips: true } },
            response: '{"0":"wnet","1":"ate"}',
            expected: 1,
        },
    ];
}

const matrix: ScorableQuestion = {
    type: 'matrix',
    points: 3,
    prompt: 'True, false or not given?',
    matrixRows: [
        { id: 'r1', correctColumnId: 'true' },
        { id: 'r2', correctColumnId: 'false' },
        { id: 'r3', correctColumnId: 'ng' },
    ],
};

const clozeBank: ScorableQuestion = {
    type: 'cloze-bank',
    points: 2,
    prompt: 'The {{cat}} sat on the {{mat|rug}}.',
};

const dictation: ScorableQuestion = {
    type: 'dictation',
    points: 4,
    prompt: '',
    dictationText: "She doesn't like coffee.",
};

const kwt: ScorableQuestion = {
    type: 'key-word-transformation',
    points: 2,
    prompt: '',
    expectedAnswers: ['have worked // for ten years', 'have been working // for years'],
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

    // Tolerant matching (A5) — opt-in per question
    ...tolerantFixtures(),

    { name: 'matrix all rows', question: matrix, response: '{"r1":"true","r2":"false","r3":"ng"}', expected: 3 },
    { name: 'matrix partial credit', question: matrix, response: '{"r1":"true","r2":"true"}', expected: 1 },
    {
        name: 'matrix all-or-nothing',
        question: { ...matrix, partialCredit: false },
        response: '{"r1":"true","r2":"false"}',
        expected: 0,
    },
    { name: 'matrix wrong-shape JSON', question: matrix, response: '["true"]', expected: 0 },
    { name: 'matrix with no rows', question: { type: 'matrix', points: 1, prompt: '' }, response: '{}', expected: 0 },
    {
        name: 'cloze-bank all gaps, alternative accepted',
        question: clozeBank,
        response: '{"0":"cat","1":"rug"}',
        expected: 2,
    },
    { name: 'cloze-bank one gap wrong tile', question: clozeBank, response: '{"0":"dog","1":"mat"}', expected: 1 },
    { name: 'cloze-bank blank', question: clozeBank, response: '{}', expected: 0 },

    {
        name: 'dictation exact, case and punctuation ignored',
        question: dictation,
        response: "she doesn't like coffee",
        expected: 4,
    },
    { name: 'dictation one wrong word', question: dictation, response: "She doesn't like tea.", expected: 3 },
    { name: 'dictation one missing word', question: dictation, response: 'She like coffee', expected: 3 },
    {
        name: 'dictation extra word costs a word',
        question: dictation,
        response: "She really doesn't like coffee",
        expected: 3,
    },
    { name: 'dictation blank', question: dictation, response: '', expected: 0 },
    { name: 'dictation floors at zero', question: dictation, response: 'a b c d e f g h', expected: 0 },
    {
        name: 'dictation all-or-nothing',
        question: { ...dictation, partialCredit: false },
        response: "She doesn't like tea",
        expected: 0,
    },
    {
        name: 'dictation contractions only when opted in',
        question: dictation,
        response: 'She does not like coffee',
        expected: 2,
    },
    {
        name: 'dictation contractions opted in',
        question: { ...dictation, answerTolerance: { contractions: true } },
        response: 'She does not like coffee',
        expected: 4,
    },
    {
        name: 'dictation minor slip opted in',
        question: { ...dictation, answerTolerance: { slips: true } },
        response: "She doesn't like cofee",
        expected: 4,
    },
    {
        name: 'dictation with no target',
        question: { type: 'dictation', points: 2, prompt: '' },
        response: 'x',
        expected: 0,
    },

    { name: 'kwt both chunks', question: kwt, response: 'have worked for ten years', expected: 2 },
    {
        name: 'kwt punctuation and case ignored',
        question: kwt,
        response: 'Have worked for ten years.',
        expected: 2,
    },
    { name: 'kwt second accepted answer', question: kwt, response: 'have been working for years', expected: 2 },
    { name: 'kwt one chunk', question: kwt, response: 'have worked since 2015', expected: 1 },
    { name: 'kwt chunks must be in order', question: kwt, response: 'for ten years have worked', expected: 1 },
    {
        name: 'kwt over the word limit scores zero',
        question: kwt,
        response: 'they have worked for ten long years',
        expected: 0,
    },
    { name: 'kwt under the word limit scores zero', question: kwt, response: 'worked', expected: 0 },
    {
        name: 'kwt custom word limit',
        question: { ...kwt, answerWordLimit: { min: 2, max: 7 } },
        response: 'they have worked for ten years',
        expected: 2,
    },
    {
        name: 'kwt all-or-nothing',
        question: { ...kwt, partialCredit: false },
        response: 'have worked since 2015',
        expected: 0,
    },
    {
        name: 'kwt single-chunk answer',
        question: { ...kwt, expectedAnswers: ['in spite of'] },
        response: 'in spite of',
        expected: 2,
    },
    {
        name: 'kwt slips opt-in',
        question: { ...kwt, answerTolerance: { slips: true } },
        response: 'have wurked for ten years',
        expected: 2,
    },
    { name: 'kwt blank', question: kwt, response: '', expected: 0 },
    {
        name: 'kwt requires the key word when one is set',
        question: { ...kwt, keyWord: 'since' },
        response: 'have worked for ten years',
        expected: 0,
    },
    {
        name: 'kwt key word present',
        question: { ...kwt, keyWord: 'for' },
        response: 'have worked for ten years',
        expected: 2,
    },
    {
        name: 'kwt stray punctuation does not count as a word',
        question: kwt,
        response: 'have worked - for ten years .',
        expected: 2,
    },
    {
        name: 'kwt with no key',
        question: { type: 'key-word-transformation', points: 2, prompt: '' },
        response: 'a b',
        expected: 0,
    },

    // Valid JSON of the wrong shape scores as unanswered instead of throwing.
    { name: 'multiple-response non-array JSON', question: mr, response: '5', expected: 2 },
    { name: 'hot-text object instead of array', question: hotText, response: '{}', expected: 2 },
    { name: 'cloze null response', question: cloze, response: 'null', expected: 0 },
    { name: 'cloze non-string gap value', question: cloze, response: '{"0":5,"1":"since"}', expected: 1 },
    { name: 'matching null response', question: matching, response: 'null', expected: 0 },
    { name: 'categorize array instead of object', question: categorize, response: '["noun"]', expected: 0 },
    { name: 'ordering object instead of array', question: ordering, response: '{"0":"i1"}', expected: 0 },

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
