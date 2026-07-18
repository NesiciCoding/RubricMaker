import { nanoid } from './nanoid';
import type { TestQuestion, TestSection, QuestionBankItem } from '../types';

/**
 * Regenerates the question's own id plus every nested option/pair/item id.
 * Required when inserting a bank question into a test — reusing the stored
 * ids would collide if the same bank item is inserted twice (into the same
 * test, or into two tests that then get merged in one aggregator view).
 */
export function cloneQuestionWithFreshIds(question: TestQuestion): TestQuestion {
    const categoryIdMap = new Map((question.categories ?? []).map((c) => [c.id, nanoid()]));
    return {
        ...question,
        id: nanoid(),
        sectionId: undefined,
        options: question.options?.map((o) => ({ ...o, id: nanoid() })),
        matchingPairs: question.matchingPairs?.map((p) => ({ ...p, id: nanoid() })),
        orderItems: question.orderItems?.map((i) => ({ ...i, id: nanoid() })),
        categories: question.categories?.map((c) => ({ ...c, id: categoryIdMap.get(c.id)! })),
        categorizeItems: question.categorizeItems?.map((i) => ({
            ...i,
            id: nanoid(),
            categoryId: categoryIdMap.get(i.categoryId) ?? i.categoryId,
        })),
    };
}

/**
 * Instantiates a fresh, freshly-id'd copy of a bank item ready to insert into a test.
 * Both the Test Builder's "insert from bank" action and the test generator call this
 * one function, so bundle-cloning logic exists in exactly one place.
 */
export function cloneBankItemIntoTest(item: QuestionBankItem): { questions: TestQuestion[]; section?: TestSection } {
    if (item.kind === 'section') {
        if (!item.section) throw new Error(`Bank item ${item.id} is kind: 'section' but has no section payload`);
        const sectionId = nanoid();
        const questions = item.section.questions.map((q) => ({
            ...cloneQuestionWithFreshIds({ ...q, sectionId: undefined } as TestQuestion),
            sectionId,
        }));
        const section: TestSection = {
            id: sectionId,
            title: item.section.title,
            content: item.section.content,
            audioUrl: item.section.audioUrl,
            cefrLevel: item.cefrLevel,
        };
        return { questions, section };
    }
    if (!item.question) throw new Error(`Bank item ${item.id} has no question payload`);
    return { questions: [cloneQuestionWithFreshIds({ ...item.question, sectionId: undefined } as TestQuestion)] };
}
