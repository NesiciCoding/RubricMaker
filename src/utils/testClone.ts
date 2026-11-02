import type { Test } from '../types';
import { nanoid } from './nanoid';

export type TestInput = Omit<Test, 'id' | 'createdAt' | 'updatedAt'>;

// A copy gets fresh question/option ids and carries no sharing setting or list position of its own.
export function cloneTestForCopy(source: Test, overrides: Partial<TestInput> = {}): TestInput {
    const {
        id: _id,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        displayOrder: _displayOrder,
        sharing: _sharing,
        ...rest
    } = source;
    return {
        ...rest,
        questions: source.questions.map((q) => ({
            ...q,
            id: nanoid(),
            options: q.options?.map((o) => ({ ...o, id: nanoid() })),
        })),
        ...overrides,
    };
}
