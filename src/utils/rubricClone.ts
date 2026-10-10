import type { Rubric } from '../types';
import { nanoid } from './nanoid';

export type RubricInput = Omit<Rubric, 'id' | 'createdAt' | 'updatedAt'>;

// A copy starts private and unplaced, with fresh ids for every nested record; vocabulary links
// follow the criteria and sub-items they pointed at so the copy never refers back to the source.
export function cloneRubricForCopy(source: Rubric, overrides: Partial<RubricInput> = {}): RubricInput {
    const ids = new Map<string, string>();
    const freshId = (oldId: string) => {
        const id = nanoid();
        ids.set(oldId, id);
        return id;
    };
    const remap = (oldId: string | undefined) => (oldId ? (ids.get(oldId) ?? oldId) : oldId);

    const criteria = source.criteria.map((c) => ({
        ...c,
        id: freshId(c.id),
        levels: c.levels.map((l) => ({
            ...l,
            id: nanoid(),
            subItems: l.subItems.map((si) => ({ ...si, id: freshId(si.id) })),
        })),
    }));
    const {
        id: _id,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        displayOrder: _displayOrder,
        sharedWithSchool: _sharedWithSchool,
        vocabularyItems,
        ...rest
    } = source;
    return {
        ...rest,
        criteria,
        ...(vocabularyItems && {
            vocabularyItems: vocabularyItems.map((v) => ({
                ...v,
                id: nanoid(),
                linkedCriterionId: remap(v.linkedCriterionId),
                linkedSubItemId: remap(v.linkedSubItemId),
            })),
        }),
        attachmentIds: [],
        ...overrides,
    };
}
