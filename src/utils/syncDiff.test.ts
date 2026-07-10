import { describe, it, expect } from 'vitest';
import { diffCollection } from './syncDiff';

interface Item {
    id: string;
    name: string;
}

describe('diffCollection', () => {
    it('returns nothing when the array reference is unchanged', () => {
        const arr: Item[] = [{ id: '1', name: 'a' }];
        expect(diffCollection(arr, arr, (x) => x.id)).toEqual({ upserted: [], deletedIds: [] });
    });

    it('skips items whose reference is unchanged, even in a new array', () => {
        const shared: Item = { id: '1', name: 'a' };
        const prev = [shared];
        const curr = [shared, { id: '2', name: 'b' }];
        const { upserted, deletedIds } = diffCollection(prev, curr, (x) => x.id);
        expect(upserted).toEqual([{ id: '2', name: 'b' }]);
        expect(deletedIds).toEqual([]);
    });

    it('detects a deep-equal-but-new-reference item as unchanged', () => {
        const prev = [{ id: '1', name: 'a' }];
        const curr = [{ id: '1', name: 'a' }]; // same content, different object
        const { upserted } = diffCollection(prev, curr, (x) => x.id);
        expect(upserted).toEqual([]);
    });

    it('detects an actual content change', () => {
        const prev = [{ id: '1', name: 'a' }];
        const curr = [{ id: '1', name: 'b' }];
        const { upserted } = diffCollection(prev, curr, (x) => x.id);
        expect(upserted).toEqual([{ id: '1', name: 'b' }]);
    });

    it('detects a removed item', () => {
        const prev = [
            { id: '1', name: 'a' },
            { id: '2', name: 'b' },
        ];
        const curr = [{ id: '1', name: 'a' }];
        const { upserted, deletedIds } = diffCollection(prev, curr, (x) => x.id);
        expect(upserted).toEqual([]);
        expect(deletedIds).toEqual(['2']);
    });
});
