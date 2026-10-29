import { describe, expect, it } from 'vitest';
import type { Folder } from '../types';
import {
    ALL_FOLDERS,
    MAX_FOLDER_DEPTH,
    canNestFolder,
    childFolders,
    countInFolder,
    countInFolderTree,
    descendantFolderIds,
    filterByFolder,
    folderDepth,
    folderPath,
    folderPathLabel,
    foldersForKind,
    itemsInFolder,
    nextFolderOrder,
} from './folders';

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

describe('childFolders', () => {
    const tree = [
        folder({ id: 'root-a', displayOrder: 1 }),
        folder({ id: 'root-b', displayOrder: 0 }),
        folder({ id: 'a-child', parentId: 'root-a' }),
        folder({ id: 'a-child-2', parentId: 'root-a', displayOrder: 0 }),
        folder({ id: 'test-root', kind: 'test' }),
        folder({ id: 'test-child', kind: 'test', parentId: 'root-a' }),
    ];

    it('returns only the siblings at the requested level, in display order', () => {
        expect(childFolders(tree, 'rubric').map((f) => f.id)).toEqual(['root-b', 'root-a']);
        expect(childFolders(tree, 'rubric', 'root-a').map((f) => f.id)).toEqual(['a-child-2', 'a-child']);
    });

    it('never mixes the rubric and test trees, even when parent ids collide', () => {
        expect(childFolders(tree, 'test', 'root-a').map((f) => f.id)).toEqual(['test-child']);
    });

    it('returns nothing for a leaf folder', () => {
        expect(childFolders(tree, 'rubric', 'a-child')).toEqual([]);
    });
});

describe('folderPath / folderDepth', () => {
    const tree = [
        folder({ id: 'a', name: 'A' }),
        folder({ id: 'b', name: 'B', parentId: 'a' }),
        folder({ id: 'c', name: 'C', parentId: 'b' }),
        folder({ id: 'orphan', name: 'Orphan', parentId: 'gone' }),
    ];

    it('walks from the top-level folder down to the requested one', () => {
        expect(folderPath(tree, 'c').map((f) => f.name)).toEqual(['A', 'B', 'C']);
        expect(folderPath(tree, 'a').map((f) => f.name)).toEqual(['A']);
    });

    it('degrades to the part of the chain that still exists', () => {
        expect(folderPath(tree, 'orphan').map((f) => f.name)).toEqual(['Orphan']);
    });

    it('returns an empty path for an unknown id', () => {
        expect(folderPath(tree, 'missing')).toEqual([]);
        expect(folderDepth(tree, 'missing')).toBe(0);
    });

    it('counts levels from one, and protects against a parent cycle', () => {
        expect(folderDepth(tree, 'a')).toBe(1);
        expect(folderDepth(tree, 'c')).toBe(3);
        const cyclic = [folder({ id: 'x', parentId: 'y' }), folder({ id: 'y', parentId: 'x' })];
        expect(folderDepth(cyclic, 'x')).toBe(2);
    });
});

describe('folderPathLabel', () => {
    const tree = [
        folder({ id: 'a', name: 'Year 1' }),
        folder({ id: 'b', name: 'Essays', parentId: 'a' }),
        folder({ id: 'c', name: 'Drafts', parentId: 'b' }),
    ];

    it('joins the whole path so a card can name where it lives', () => {
        expect(folderPathLabel(tree, 'c')).toBe('Year 1 / Essays / Drafts');
        expect(folderPathLabel(tree, 'a')).toBe('Year 1');
    });

    it('is undefined for an unfiled item or a folder that no longer exists', () => {
        expect(folderPathLabel(tree, undefined)).toBeUndefined();
        expect(folderPathLabel(tree, 'gone')).toBeUndefined();
    });
});

describe('descendantFolderIds', () => {
    const tree = [
        folder({ id: 'a' }),
        folder({ id: 'b', parentId: 'a' }),
        folder({ id: 'c', parentId: 'b' }),
        folder({ id: 'd' }),
    ];

    it('reaches every level below the folder, without the folder itself', () => {
        expect(descendantFolderIds(tree, 'a')).toEqual(['b', 'c']);
        expect(descendantFolderIds(tree, 'c')).toEqual([]);
    });
});

describe('countInFolderTree', () => {
    const folders = [folder({ id: 'a' }), folder({ id: 'b', parentId: 'a' }), folder({ id: 'c' })];
    const items = [{ id: 'r1', folderId: 'a' }, { id: 'r2', folderId: 'b' }, { id: 'r3', folderId: 'c' }, { id: 'r4' }];

    it('counts what is filed in the folder and in its subfolders', () => {
        expect(countInFolderTree(items, folders, 'a')).toBe(2);
        expect(countInFolderTree(items, folders, 'b')).toBe(1);
        expect(countInFolderTree(items, folders, 'c')).toBe(1);
    });

    it('ignores unfiled items and empty trees', () => {
        expect(countInFolderTree(items, folders, 'missing')).toBe(0);
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

    it('only looks at siblings, so a subfolder starts its own sequence', () => {
        const folders = [folder({ id: 'parent' }), folder({ id: 'sibling', parentId: 'parent', displayOrder: 2 })];
        expect(nextFolderOrder(folders, 'rubric', 'parent')).toBe(3);
    });
});

describe('canNestFolder', () => {
    const tree = [
        folder({ id: 'a' }),
        folder({ id: 'b', parentId: 'a' }),
        folder({ id: 'c', parentId: 'b' }),
        folder({ id: 'd' }),
    ];

    it('allows a move into an unrelated folder, and back to the top level', () => {
        expect(canNestFolder(tree, 'a', 'd')).toBe(true);
        expect(canNestFolder(tree, 'c')).toBe(true);
    });

    it('refuses to make a folder its own parent or its own descendant', () => {
        expect(canNestFolder(tree, 'a', 'a')).toBe(false);
        expect(canNestFolder(tree, 'a', 'c')).toBe(false);
    });

    it('refuses a target that does not exist', () => {
        expect(canNestFolder(tree, 'a', 'gone')).toBe(false);
    });

    it('refuses a move that would push the subtree past the depth limit', () => {
        // `deep` sits at level 4 already, so nothing may go into it.
        const deepTree = [
            folder({ id: 'l1' }),
            folder({ id: 'l2', parentId: 'l1' }),
            folder({ id: 'l3', parentId: 'l2' }),
            folder({ id: 'l4', parentId: 'l3' }),
            folder({ id: 'other' }),
        ];
        expect(folderDepth(deepTree, 'l4')).toBe(MAX_FOLDER_DEPTH);
        expect(canNestFolder(deepTree, 'other', 'l4')).toBe(false);
        expect(canNestFolder(deepTree, 'other', 'l3')).toBe(true);
    });

    it('counts the whole moving subtree, not just the folder', () => {
        // Moving `a` (which holds b and c, two levels deep) under a level-2 folder would end at 5.
        const target = [folder({ id: 't1' }), folder({ id: 't2', parentId: 't1' })];
        expect(canNestFolder([...tree, ...target], 'a', 't2')).toBe(false);
        expect(canNestFolder([...tree, ...target], 'a', 't1')).toBe(true);
    });
});
