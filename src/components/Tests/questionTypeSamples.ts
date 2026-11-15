import type { TestQuestion, TestQuestionType } from '../../types';

export interface QuestionTypeSample {
    question: TestQuestion;
    /** A plausible in-progress answer, so a preview shows the control in use rather than empty. */
    value: string;
}

const base = (type: TestQuestionType, prompt: string): TestQuestion => ({
    id: `preview-${type}`,
    type,
    prompt,
    points: 1,
});

/**
 * One tiny, realistic item per type, rendered behind each card in the type picker. These are
 * teaching samples (like the CEFR descriptors in src/data), so they stay in English rather
 * than going through i18n — the answer controls around them are translated.
 */
export const QUESTION_TYPE_SAMPLES: Record<TestQuestionType, QuestionTypeSample> = {
    'multiple-choice': {
        question: {
            ...base('multiple-choice', 'The weather was ___ yesterday.'),
            options: [
                { id: 'a', text: 'lovely', isCorrect: true },
                { id: 'b', text: 'loveliness', isCorrect: false },
                { id: 'c', text: 'lovelying', isCorrect: false },
            ],
        },
        value: 'a',
    },
    'multiple-response': {
        question: {
            ...base('multiple-response', 'Choose two things the writer recommends.'),
            options: [
                { id: 'a', text: 'hiring a local guide', isCorrect: true },
                { id: 'b', text: 'booking late in the season', isCorrect: false },
                { id: 'c', text: 'packing light', isCorrect: true },
            ],
        },
        value: '["a","c"]',
    },
    'true-false': {
        question: { ...base('true-false', 'The tour starts at eight o’clock.'), correctBoolean: false },
        value: 'false',
    },
    matching: {
        question: {
            ...base('matching', 'Match each word with its meaning.'),
            matchingPairs: [
                { id: 'm1', left: 'commute', right: 'travel to work' },
                { id: 'm2', left: 'shift', right: 'a work period' },
                { id: 'm3', left: 'overtime', right: 'hours worked extra' },
            ],
        },
        value: '{"m1":"m1","m2":"m2"}',
    },
    ordering: {
        question: {
            ...base('ordering', 'Put the steps in the correct order.'),
            orderItems: [
                { id: 'o1', text: 'First, heat the oil.' },
                { id: 'o2', text: 'Add the onions.' },
                { id: 'o3', text: 'Stir for five minutes.' },
            ],
        },
        value: '["o1","o2","o3"]',
    },
    categorize: {
        question: {
            ...base('categorize', 'Categorise each expression.'),
            categories: [
                { id: 'c1', label: 'Formal' },
                { id: 'c2', label: 'Informal' },
            ],
            categorizeItems: [
                { id: 'i1', text: 'commence', categoryId: 'c1' },
                { id: 'i2', text: 'kick off', categoryId: 'c2' },
                { id: 'i3', text: 'purchase', categoryId: 'c1' },
            ],
        },
        value: '{"i1":"c1","i2":"c2"}',
    },
    'hot-text': {
        question: {
            ...base('hot-text', 'Click the two phrases that describe the station’s age.'),
            hotTextPassage:
                'The station [[was built]] in 1892 and [[still serves]] the coast line, which [[opened]] later.',
            hotTextCorrectIndices: [0, 1],
        },
        value: '[0,1]',
    },
    matrix: {
        question: {
            ...base('matrix', 'Tick True, False or Not given for each statement.'),
            matrixColumns: [
                { id: 'col1', text: 'True' },
                { id: 'col2', text: 'False' },
                { id: 'col3', text: 'Not given' },
            ],
            matrixRows: [
                { id: 'r1', text: 'The station was built in 1892.', correctColumnId: 'col1' },
                { id: 'r2', text: 'It cost four million pounds.', correctColumnId: 'col3' },
            ],
        },
        value: '{"r1":"col1"}',
    },
    'short-answer': {
        question: { ...base('short-answer', 'How long does the journey take?'), expectedAnswer: 'two hours' },
        value: 'two hours',
    },
    numeric: {
        question: {
            ...base('numeric', 'Round the mean to one decimal place.'),
            expectedNumericValue: 3.8,
            numericTolerance: 0.1,
        },
        value: '3.8',
    },
    open: {
        question: base('open', 'Write an email to a friend about your new job (120–150 words).'),
        value: 'Hi Sam,\n\nI started the new job on Monday and…',
    },
    dictation: {
        question: {
            ...base('dictation', 'Listen and type the sentence you hear.'),
            dictationText: 'She arrived late because the bus was cancelled.',
        },
        value: 'She arrived late because the bus was cancelled.',
    },
    cloze: {
        question: base('cloze', 'She has been living here {{since}} 2019 and {{does|did}} not regret it.'),
        value: '{"0":"since"}',
    },
    'cloze-dropdown': {
        question: base(
            'cloze-dropdown',
            'The museum is {{open|opened|opening}} every day {{except|besides|apart}} Mondays.'
        ),
        value: '{"0":"open"}',
    },
    'cloze-bank': {
        question: {
            ...base('cloze-bank', 'He {{passed}} the ball to his sister, who {{kicked}} it into the net.'),
            bankDistractors: ['threw', 'caught'],
        },
        value: '{"0":"passed"}',
    },
    'key-word-transformation': {
        question: {
            ...base('key-word-transformation', 'The film was so boring that we left early.'),
            keyWord: 'SUCH',
            gappedSentence: 'It was ___ film that we left early.',
            answerWordLimit: { min: 2, max: 5 },
        },
        value: 'such a boring',
    },
    'error-correction': {
        question: {
            ...base('error-correction', 'Find the mistakes and type the correction.'),
            errorPassage: 'I [[have seen|saw]] him yesterday at the station.',
        },
        value: '{"0":"saw"}',
    },
    'sentence-builder': {
        question: {
            ...base('sentence-builder', 'Put the words in the correct order.'),
            sentenceTargets: ['I have never been so tired'],
        },
        value: '["I","have","never"]',
    },
    'audio-response': {
        question: {
            ...base('audio-response', 'Look at the photo and answer the questions below.'),
            cueBullets: ['Describe what you can see in the photo.', 'Say what the people are likely to do next.'],
            maxRecordingSeconds: 60,
        },
        value: '',
    },
};
