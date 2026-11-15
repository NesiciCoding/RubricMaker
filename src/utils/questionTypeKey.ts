import type { TestQuestionType } from '../types';

const slug = (type: TestQuestionType) => type.replace(/-/g, '_');

export const questionTypeLabelKey = (type: TestQuestionType) => `tests.question_type_${slug(type)}`;

/** One-line description shown under the type's name in the picker. */
export const questionTypeDescKey = (type: TestQuestionType) => `tests.question_type_${slug(type)}_desc`;

export const questionTypeHelpKey = (type: TestQuestionType, audience: 'teacher' | 'student', part: 'title' | 'body') =>
    `tests.help.${slug(type)}_${audience}_${part}`;

/** Instruction line shown above a cloze question instead of its prompt. */
export const clozeInstructionKey = (type: TestQuestionType) => {
    if (type === 'cloze-dropdown') return 'tests.taking.cloze_dropdown_instruction';
    if (type === 'cloze-bank') return 'tests.taking.cloze_bank_instruction';
    return 'tests.taking.cloze_instruction';
};
