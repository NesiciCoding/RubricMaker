import { plainQuestionPromptText } from './clozeParse';
import type { QuestionBankItem, TestQuestion } from '../types';

/** Every question carried by a bank item — one for a question, all of them for a section bundle. */
export function questionsOf(item: QuestionBankItem): Omit<TestQuestion, 'sectionId'>[] {
    if (item.kind === 'section' && item.section) return item.section.questions;
    return item.question ? [item.question] : [];
}

/**
 * The bank item that already uses one of the candidate's prompts, if any. Matching is on the
 * plain-text prompt (rich-text markup ignored) and case-insensitive, because the same question
 * re-imported or re-saved from a test rarely keeps identical markup. `ignoreId` excludes the
 * item being edited, so saving an unchanged item never reports itself as a duplicate.
 */
export function findDuplicatePromptItem(
    items: QuestionBankItem[],
    candidate: QuestionBankItem,
    ignoreId?: string
): QuestionBankItem | undefined {
    const prompts = new Set(
        questionsOf(candidate)
            .map((q) => plainQuestionPromptText(q).trim().toLowerCase())
            .filter(Boolean)
    );
    if (prompts.size === 0) return undefined;
    return items.find(
        (other) =>
            other.id !== ignoreId &&
            questionsOf(other).some((q) => prompts.has(plainQuestionPromptText(q).trim().toLowerCase()))
    );
}
