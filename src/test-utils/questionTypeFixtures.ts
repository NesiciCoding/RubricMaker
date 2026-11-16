import type { TestQuestion, TestQuestionType } from '../types';

/**
 * One question per type, for proving the builder's student-view preview renders exactly what the
 * student runner renders. Test-only data: nothing here is imported by the app.
 */
export interface QuestionTypeFixture {
    type: TestQuestionType;
    question: TestQuestion;
    /** Strings both surfaces must show (labels, instructions) — never real playback. */
    expectText?: string[];
}

const HINT = 'Read the sentence out loud before you answer.';

const base = (type: TestQuestionType, prompt: string): TestQuestion => ({
    id: `fixture-${type}`,
    type,
    prompt,
    points: 2,
    hint: HINT,
});

export const QUESTION_TYPE_FIXTURES: QuestionTypeFixture[] = [
    {
        type: 'multiple-choice',
        question: {
            ...base('multiple-choice', '<p>Which word is a verb?</p>'),
            imageUrl: 'https://example.com/verbs.png',
            audioUrl: 'https://example.com/verbs.mp3',
            options: [
                { id: 'mc-a', text: 'run', isCorrect: true },
                { id: 'mc-b', text: 'blue', isCorrect: false },
                { id: 'mc-c', text: 'slowly', isCorrect: false },
            ],
        },
    },
    {
        type: 'multiple-response',
        question: {
            // No hint: the preview must simply render none where the student gets none.
            ...base('multiple-response', '<p>Select every plural noun.</p>'),
            hint: undefined,
            options: [
                { id: 'mr-a', text: 'cats', isCorrect: true },
                { id: 'mr-b', text: 'dogs', isCorrect: true },
                { id: 'mr-c', text: 'cat', isCorrect: false },
            ],
        },
    },
    {
        type: 'true-false',
        question: { ...base('true-false', '<p>“Ran” is the past tense of “run”.</p>'), correctBoolean: true },
        expectText: ['tests.true_false_true', 'tests.true_false_false'],
    },
    {
        type: 'short-answer',
        question: {
            ...base('short-answer', '<p>Write the past tense of “go”.</p>'),
            audioUrl: 'https://example.com/verbs.mp3',
            expectedAnswer: 'went',
        },
        expectText: ['tests.taking.short_answer_placeholder'],
    },
    {
        type: 'open',
        question: { ...base('open', '<p>Describe your favourite season.</p>') },
        expectText: ['tests.taking.open_answer_placeholder'],
    },
    {
        type: 'cloze',
        question: { ...base('cloze', 'He {{went}} home after school.') },
        expectText: ['tests.taking.cloze_instruction'],
    },
    {
        type: 'cloze-dropdown',
        question: { ...base('cloze-dropdown', 'She {{went|go|gone}} home after school.') },
        expectText: ['tests.taking.cloze_dropdown_instruction'],
    },
    {
        type: 'cloze-bank',
        question: {
            ...base('cloze-bank', 'They {{went}} home after school.'),
            bankDistractors: ['go', 'gone'],
        },
        expectText: ['tests.taking.cloze_bank_instruction', 'tests.taking.cloze_bank_tiles_label'],
    },
    {
        type: 'matrix',
        question: {
            ...base('matrix', '<p>Answer true or false for each statement.</p>'),
            imageUrl: 'https://example.com/table.png',
            matrixColumns: [
                { id: 'col-true', text: 'True' },
                { id: 'col-false', text: 'False' },
            ],
            matrixRows: [
                { id: 'row-1', text: 'Water boils at 100°C.', correctColumnId: 'col-true' },
                { id: 'row-2', text: 'The sun is a planet.', correctColumnId: 'col-false' },
            ],
        },
    },
    {
        type: 'dictation',
        question: {
            ...base('dictation', '<p>Listen and write the sentence.</p>'),
            audioUrl: 'https://example.com/sentence.mp3',
            dictationText: 'The cat sat on the mat.',
            maxPlays: 2,
        },
        // The player and its label, not real playback.
        expectText: ['tests.taking.dictation_play', 'tests.taking.audio_plays_left'],
    },
    {
        type: 'key-word-transformation',
        question: {
            ...base('key-word-transformation', '<p>Complete the second sentence.</p>'),
            keyWord: 'MANAGE',
            gappedSentence: 'He ___ to finish on time.',
        },
        expectText: ['tests.taking.kwt_answer_label'],
    },
    {
        type: 'error-correction',
        question: {
            ...base('error-correction', '<p>Find and correct the mistake.</p>'),
            errorPassage: 'She [[go|went]] to school yesterday.',
        },
        expectText: ['tests.taking.error_correction_instruction'],
    },
    {
        type: 'sentence-builder',
        question: {
            ...base('sentence-builder', '<p>Build the sentence.</p>'),
            sentenceTargets: ['The cat sat on the mat.'],
        },
        expectText: ['tests.taking.sentence_builder_tiles'],
    },
    {
        type: 'matching',
        question: {
            ...base('matching', '<p>Match each word to its meaning.</p>'),
            matchingPairs: [
                { id: 'pair-1', left: 'ubiquitous', right: 'everywhere' },
                { id: 'pair-2', left: 'meticulous', right: 'very careful' },
            ],
        },
        expectText: ['tests.taking.matching_select_placeholder'],
    },
    {
        type: 'ordering',
        question: {
            ...base('ordering', '<p>Put the steps in order.</p>'),
            orderItems: [
                { id: 'ord-1', text: 'First, open the book.' },
                { id: 'ord-2', text: 'Then, read the page.' },
                { id: 'ord-3', text: 'Finally, close it.' },
            ],
        },
        expectText: ['tests.taking.move_item_up'],
    },
    {
        type: 'categorize',
        question: {
            ...base('categorize', '<p>Sort each word into a group.</p>'),
            categories: [
                { id: 'cat-verb', label: 'Verb' },
                { id: 'cat-noun', label: 'Noun' },
            ],
            categorizeItems: [
                { id: 'ci-1', text: 'run', categoryId: 'cat-verb' },
                { id: 'ci-2', text: 'table', categoryId: 'cat-noun' },
            ],
        },
        expectText: ['tests.taking.categorize_select_placeholder'],
    },
    {
        type: 'hot-text',
        question: {
            ...base('hot-text', '<p>Select the adjective.</p>'),
            hotTextPassage: 'The [[quick]] brown fox jumps.',
            hotTextCorrectIndices: [0],
        },
        expectText: ['tests.taking.hot_text_instruction'],
    },
    {
        type: 'numeric',
        question: { ...base('numeric', '<p>How many days are in six weeks?</p>'), expectedNumericValue: 42 },
        expectText: ['tests.taking.numeric_placeholder'],
    },
    {
        type: 'audio-response',
        question: {
            ...base('audio-response', '<p>Describe your weekend in one minute.</p>'),
            audioUrl: 'https://example.com/cue.mp3',
            maxRecordingSeconds: 30,
            prepSeconds: 10,
            cueBullets: ['Say where you went', 'Say who you were with'],
        },
        expectText: ['tests.taking.start_recording', 'tests.taking.max_recording_note'],
    },
];
