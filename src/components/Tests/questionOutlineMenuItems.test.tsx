import { describe, expect, it, vi } from 'vitest';
import type { TestQuestion, TestSection } from '../../types';
import { questionOutlineMenuItems } from './questionOutlineMenuItems';

const sections: TestSection[] = [
    { id: 's1', title: 'Reading', content: '' },
    { id: 's2', title: 'Writing', content: '' },
];
const labels = {
    duplicate: 'Duplicate',
    insertFromBank: 'Insert',
    moveTo: (title: string) => `Move to ${title}`,
    noSection: 'No section',
    remove: 'Delete',
};
const actions = {
    duplicate: vi.fn(),
    insertFromBankAfter: vi.fn(),
    moveToSection: vi.fn(),
    remove: vi.fn(),
};

function items(question: Partial<TestQuestion>) {
    return questionOutlineMenuItems({
        question: { id: 'q', type: 'open', prompt: '', points: 1, ...question } as TestQuestion,
        sections,
        labels,
        ...actions,
    });
}

describe('questionOutlineMenuItems', () => {
    it('offers every section except the one the question is already in', () => {
        expect(items({ sectionId: 's1' }).map((i) => i.label)).toEqual([
            'Duplicate',
            'Insert',
            'Move to No section',
            'Move to Writing',
            'Delete',
        ]);
    });

    it('treats a question with an unknown section as uncategorised', () => {
        const moves = items({ sectionId: 'gone' }).filter((i) => i.key.startsWith('move-'));
        expect(moves.map((i) => i.label)).toEqual(['Move to Reading', 'Move to Writing']);
    });

    it('moves to "no section" with an undefined id and marks Delete dangerous', () => {
        const list = items({ sectionId: 's2' });
        list.find((i) => i.key === 'move-none')?.onSelect();
        expect(actions.moveToSection).toHaveBeenCalledWith(undefined);
        expect(list.filter((i) => i.danger).map((i) => i.key)).toEqual(['delete']);
    });
});
