import type { TestQuestionType } from '../types';

const slug = (type: TestQuestionType) => type.replace(/-/g, '_');

export const questionTypeLabelKey = (type: TestQuestionType) => `tests.question_type_${slug(type)}`;

export const questionTypeHelpKey = (type: TestQuestionType, audience: 'teacher' | 'student', part: 'title' | 'body') =>
    `tests.help.${slug(type)}_${audience}_${part}`;
