import { describe, it, expect } from 'vitest';
import { sortByDisplayOrder, reorderDisplayOrder, displayOrderAfter } from './displayOrder';

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

    it('falls back to empty string createdAt for items missing both order and date', () => {
        const items = [{ id: 'a' }, { id: 'b' }] as Array<{ id: string; displayOrder?: number; createdAt?: string }>;
        expect(sortByDisplayOrder(items).map((i) => i.id)).toEqual(['a', 'b']);
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

describe('displayOrderAfter', () => {
    const item = (id: string, displayOrder?: number) => ({ id, displayOrder });

    it('takes the midpoint to the next placed item without moving anything', () => {
        const sorted = [item('a', 0), item('b', 1), item('c', 2)];
        expect(displayOrderAfter(sorted, 0)).toEqual({ order: 0.5, updates: [] });
    });

    it('goes one past the last placed item', () => {
        const sorted = [item('a', 0), item('b', 1), item('c')];
        expect(displayOrderAfter(sorted, 1)).toEqual({ order: 2, updates: [] });
    });

    it('numbers unplaced items up to the source after the highest position', () => {
        const sorted = [item('a', 5), item('b'), item('c'), item('d')];
        const { order, updates } = displayOrderAfter(sorted, 2);
        expect(updates.map(([i, o]) => [i.id, o])).toEqual([
            ['b', 6],
            ['c', 7],
        ]);
        expect(order).toBe(8);
    });

    it('starts from 0 when nothing is placed yet', () => {
        const sorted = [item('a'), item('b')];
        expect(displayOrderAfter(sorted, 0)).toEqual({ order: 1, updates: [[sorted[0], 0]] });
    });

    it('ties with the source when the next item already shares its position', () => {
        const sorted = [item('a', 1), item('b', 1)];
        expect(displayOrderAfter(sorted, 0)).toEqual({ order: 1, updates: [] });
    });
});
