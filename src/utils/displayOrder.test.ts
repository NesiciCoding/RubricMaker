import { describe, it, expect } from 'vitest';
import { sortByDisplayOrder, reorderDisplayOrder } from './displayOrder';

describe('sortByDisplayOrder', () => {
    it('sorts by displayOrder when set, falling back to createdAt for unset items placed last', () => {
        const items = [
            { id: 'a', createdAt: '2024-01-01', displayOrder: 2 },
            { id: 'b', createdAt: '2023-01-01', displayOrder: undefined },
            { id: 'c', createdAt: '2024-01-02', displayOrder: 0 },
            { id: 'd', createdAt: '2022-01-01', displayOrder: undefined },
        ];
        expect(sortByDisplayOrder(items).map((i) => i.id)).toEqual(['c', 'a', 'd', 'b']);
    });
});

describe('reorderDisplayOrder', () => {
    it('moves the item and reassigns sequential order to the whole list', () => {
        const sorted = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        const result = reorderDisplayOrder(sorted, 0, 2);
        expect(result.map(([item, order]) => [item.id, order])).toEqual([
            ['b', 0],
            ['c', 1],
            ['a', 2],
        ]);
    });
});
