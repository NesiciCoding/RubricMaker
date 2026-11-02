import { describe, it, expect } from 'vitest';
import type { Folder, MaterialSharing } from '../types';
import {
    PRIVATE_SHARING,
    groupSharedByOwner,
    inheritedSharing,
    isShared,
    nonEmptyFolderIds,
    resolveFolderSharing,
    resolveSharing,
    type SharedEntry,
} from './materialSharing';

const school: MaterialSharing = { visibility: 'school', access: 'edit' };
const co: MaterialSharing = { visibility: 'coteachers', access: 'view' };
const priv: MaterialSharing = { visibility: 'private', access: 'view' };

const folder = (id: string, extra: Partial<Folder> = {}): Folder => ({
    id,
    name: id.toUpperCase(),
    kind: 'rubric',
    createdAt: '2026-01-01',
    ...extra,
});

const folders = [
    folder('top', { sharing: school }),
    folder('mid', { parentId: 'top' }),
    folder('leaf', { parentId: 'mid' }),
];

describe('resolveSharing', () => {
    it('prefers the item’s own setting', () => {
        expect(resolveSharing(priv, 'leaf', folders, co)).toEqual({ sharing: priv, source: 'own' });
    });

    it('falls back to the nearest folder up the chain', () => {
        const r = resolveSharing(undefined, 'leaf', folders, co);
        expect(r.source).toBe('folder');
        expect(r.sharing).toBe(school);
        expect(r.folder?.id).toBe('top');
    });

    it('takes the closest folder when several have a setting', () => {
        const withMid = folders.map((f) => (f.id === 'mid' ? { ...f, sharing: co } : f));
        expect(resolveSharing(undefined, 'leaf', withMid, undefined).folder?.id).toBe('mid');
    });

    it('uses the teacher default when no folder has a setting', () => {
        expect(resolveSharing(undefined, undefined, folders, co)).toEqual({ sharing: co, source: 'default' });
        expect(resolveSharing(undefined, 'gone', folders, co).source).toBe('default');
    });

    it('is private when nothing is set, and ignores malformed settings', () => {
        expect(resolveSharing(undefined, undefined, [], undefined)).toEqual({
            sharing: PRIVATE_SHARING,
            source: 'none',
        });
        const bad = { visibility: 'world', access: 'view' } as unknown as MaterialSharing;
        expect(resolveSharing(bad, undefined, [], bad).source).toBe('none');
        expect(resolveSharing(null as unknown as MaterialSharing, undefined, [], undefined).source).toBe('none');
    });

    it('resolves a folder from its parent chain, and inherited sharing skips the own setting', () => {
        expect(resolveFolderSharing(folders[2], folders, undefined).folder?.id).toBe('top');
        expect(resolveFolderSharing(folders[0], folders, co).source).toBe('own');
        expect(inheritedSharing('mid', folders, co).sharing).toBe(school);
    });

    it('isShared is false only for private', () => {
        expect(isShared(priv)).toBe(false);
        expect(isShared(co)).toBe(true);
    });
});

describe('groupSharedByOwner', () => {
    const entry = <T>(item: T, ownerId: string, ownerName: string): SharedEntry<T> => ({
        item,
        ownerId,
        ownerName,
        access: 'view',
    });

    it('groups by owner, sorted by name, and unfiles items whose folder is not visible', () => {
        const groups = groupSharedByOwner<{ id: string; folderId?: string }>(
            [
                entry({ id: 'r1', folderId: 'f1' }, 'z', 'Zoe'),
                entry({ id: 'r2', folderId: 'hidden' }, 'z', 'Zoe'),
                entry({ id: 'r3' }, 'a', 'Ann'),
            ],
            [entry(folder('f1'), 'z', 'Zoe'), entry(folder('f2', { parentId: 'hiddenParent' }), 'z', 'Zoe')]
        );
        expect(groups.map((g) => g.ownerName)).toEqual(['Ann', 'Zoe']);
        const zoe = groups[1];
        expect(zoe.items.map((e) => e.item.folderId)).toEqual(['f1', undefined]);
        expect(zoe.folders.find((f) => f.id === 'f2')?.parentId).toBeUndefined();
    });

    it('drops owners who only share empty folders', () => {
        expect(groupSharedByOwner([], [entry(folder('f1'), 'z', 'Zoe')])).toEqual([]);
    });
});

describe('nonEmptyFolderIds', () => {
    it('keeps every folder on the path to a filed item', () => {
        expect([...nonEmptyFolderIds(folders, [{ folderId: 'mid' }, {}])].sort()).toEqual(['mid', 'top']);
    });
});
