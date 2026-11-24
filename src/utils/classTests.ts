import type { Class } from '../types';

/**
 * A class with `testId` added to or removed from its linked tests. Tests are assigned per class
 * through this link (`Class.testIds`) — the same explicit link rubrics use via `Class.rubricIds`.
 */
export function toggleClassTest(cls: Class, testId: string, linked: boolean): Class {
    const current = cls.testIds ?? [];
    return {
        ...cls,
        testIds: linked ? current.filter((id) => id !== testId) : [...current, testId],
    };
}
