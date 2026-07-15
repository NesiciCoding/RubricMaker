import { nanoid } from './nanoid';
import type { TestQuestion } from '../types';

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
