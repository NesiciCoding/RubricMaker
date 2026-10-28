import { describe, expect, it } from 'vitest';
import type { Folder } from '../types';
import { ALL_FOLDERS, countInFolder, filterByFolder, foldersForKind, itemsInFolder, nextFolderOrder } from './folders';

function folder(overrides: Partial<Folder> = {}): Folder {
    return {
        id: 'f1',
        name: 'Year 1',
        kind: 'rubric',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('foldersForKind', () => {
    it('keeps the rubric and test trees separate', () => {
        const folders = [folder(), folder({ id: 'f2', kind: 'test', name: 'Unit tests' })];
        expect(foldersForKind(folders, 'rubric').map((f) => f.id)).toEqual(['f1']);
        expect(foldersForKind(folders, 'test').map((f) => f.id)).toEqual(['f2']);
    });

    it('orders manually placed folders first, then by creation', () => {
        const folders = [
            folder({ id: 'a', createdAt: '2026-03-01T00:00:00.000Z' }),
            folder({ id: 'b', displayOrder: 0, createdAt: '2026-03-02T00:00:00.000Z' }),
            folder({ id: 'c', displayOrder: 1, createdAt: '2026-03-03T00:00:00.000Z' }),
        ];
        expect(foldersForKind(folders, 'rubric').map((f) => f.id)).toEqual(['b', 'c', 'a']);
    });
});

describe('filterByFolder', () => {
    const items = [{ id: 'r1', folderId: 'f1' }, { id: 'r2' }, { id: 'r3', folderId: 'f2' }];

    it('returns everything for the all-folders sentinel', () => {
        expect(filterByFolder(items, ALL_FOLDERS)).toHaveLength(3);
    });

    it('returns only the selected folder', () => {
        expect(filterByFolder(items, 'f1').map((i) => i.id)).toEqual(['r1']);
    });

    it('returns nothing for a folder with no contents', () => {
        expect(filterByFolder(items, 'missing')).toEqual([]);
    });
});

describe('itemsInFolder / countInFolder', () => {
    const items = [{ id: 'r1', folderId: 'f1' }, { id: 'r2', folderId: 'f1' }, { id: 'r3' }];

    it('collects the items filed under a folder', () => {
        expect(itemsInFolder(items, 'f1').map((i) => i.id)).toEqual(['r1', 'r2']);
        expect(countInFolder(items, 'f1')).toBe(2);
        expect(countInFolder(items, 'missing')).toBe(0);
    });
});

describe('nextFolderOrder', () => {
    it('appends after the highest position of the same kind', () => {
        const folders = [folder({ displayOrder: 4 }), folder({ id: 't', kind: 'test', displayOrder: 9 })];
        expect(nextFolderOrder(folders, 'rubric')).toBe(5);
    });

    it('starts at zero when nothing is placed yet', () => {
        expect(nextFolderOrder([], 'rubric')).toBe(0);
    });
});
