import type { TestQuestionType } from '../types';

/** Every question type, in the order the builder and filters list them. */
export const QUESTION_TYPES: TestQuestionType[] = [
    'multiple-choice',
    'multiple-response',
    'true-false',
    'short-answer',
    'open',
    'cloze',
    'cloze-dropdown',
    'cloze-bank',
    'matrix',
    'dictation',
    'key-word-transformation',
    'error-correction',
    'sentence-builder',
    'matching',
    'ordering',
    'categorize',
    'hot-text',
    'numeric',
    'audio-response',
];

export type QuestionTypeGroupId = 'pick' | 'type' | 'gaps' | 'efl' | 'speak';

interface QuestionTypeGroup {
    id: QuestionTypeGroupId;
    types: TestQuestionType[];
}

/**
 * The picker groups types by what a student does, not by how the data is stored — a name
 * alone doesn't tell you what "hot text" or "grid" looks like. Every type belongs to exactly
 * one group (pinned by questionTypes.test.ts).
 */
export const QUESTION_TYPE_GROUPS: QuestionTypeGroup[] = [
    {
        id: 'pick',
        types: [
            'multiple-choice',
            'multiple-response',
            'true-false',
            'matching',
            'ordering',
            'categorize',
            'hot-text',
            'matrix',
        ],
    },
    { id: 'type', types: ['short-answer', 'numeric', 'open', 'dictation'] },
    { id: 'gaps', types: ['cloze', 'cloze-dropdown', 'cloze-bank'] },
    { id: 'efl', types: ['key-word-transformation', 'error-correction', 'sentence-builder'] },
    { id: 'speak', types: ['audio-response'] },
];

export const groupForType = (type: TestQuestionType): QuestionTypeGroupId =>
    QUESTION_TYPE_GROUPS.find((group) => group.types.includes(type))?.id ?? 'pick';
