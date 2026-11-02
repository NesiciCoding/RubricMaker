import type { Folder, MaterialAccess, MaterialSharing, MaterialVisibility } from '../types';
import { folderPath } from './folders';

export const PRIVATE_SHARING: MaterialSharing = { visibility: 'private', access: 'view' };

export const MATERIAL_VISIBILITIES: MaterialVisibility[] = ['private', 'coteachers', 'school'];
export const MATERIAL_ACCESSES: MaterialAccess[] = ['view', 'edit'];

export type SharingSource = 'own' | 'folder' | 'default' | 'none';

export interface ResolvedSharing {
    sharing: MaterialSharing;
    source: SharingSource;
    /** The folder the setting comes from, when `source` is 'folder'. */
    folder?: Folder;
}

function isSharing(value: unknown): value is MaterialSharing {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
        MATERIAL_VISIBILITIES.includes(v.visibility as MaterialVisibility) &&
        MATERIAL_ACCESSES.includes(v.access as MaterialAccess)
    );
}

/**
 * Mirrors `material_sharing()` in migration 095: the nearest explicit setting wins — the item's
 * own, then each folder up the chain from `folderId`, then the owner's default, then private.
 */
export function resolveSharing(
    own: MaterialSharing | undefined,
    folderId: string | undefined,
    folders: Folder[],
    defaultSharing: MaterialSharing | undefined
): ResolvedSharing {
    if (isSharing(own)) return { sharing: own, source: 'own' };
    if (folderId) {
        const chain = folderPath(folders, folderId).reverse();
        const holder = chain.find((f) => isSharing(f.sharing));
        if (holder) return { sharing: holder.sharing!, source: 'folder', folder: holder };
    }
    if (isSharing(defaultSharing)) return { sharing: defaultSharing, source: 'default' };
    return { sharing: PRIVATE_SHARING, source: 'none' };
}

export function resolveFolderSharing(
    folder: Folder,
    folders: Folder[],
    defaultSharing: MaterialSharing | undefined
): ResolvedSharing {
    return resolveSharing(folder.sharing, folder.parentId, folders, defaultSharing);
}

/** Inherited sharing for an item or folder about to have its own setting removed. */
export function inheritedSharing(
    folderId: string | undefined,
    folders: Folder[],
    defaultSharing: MaterialSharing | undefined
): ResolvedSharing {
    return resolveSharing(undefined, folderId, folders, defaultSharing);
}

export function isShared(sharing: MaterialSharing): boolean {
    return sharing.visibility !== 'private';
}

/** One colleague's shared material, as returned by `list_shared_materials`. */
export interface SharedEntry<T> {
    item: T;
    ownerId: string;
    ownerName: string;
    access: MaterialAccess;
}

export interface SharedOwnerGroup<T> {
    ownerId: string;
    ownerName: string;
    items: SharedEntry<T>[];
    folders: Folder[];
}

/**
 * Groups shared items and folders by owner, sorted by owner name. An item whose folder isn't
 * visible to the viewer (a private folder holding an explicitly shared item) is listed unfiled,
 * so nothing shared is hidden behind a folder the viewer can't open.
 */
export function groupSharedByOwner<T extends { id: string; folderId?: string }>(
    items: SharedEntry<T>[],
    folders: SharedEntry<Folder>[]
): SharedOwnerGroup<T>[] {
    const groups = new Map<string, SharedOwnerGroup<T>>();
    const groupFor = (ownerId: string, ownerName: string) => {
        let g = groups.get(ownerId);
        if (!g) {
            g = { ownerId, ownerName, items: [], folders: [] };
            groups.set(ownerId, g);
        }
        return g;
    };
    for (const f of folders) groupFor(f.ownerId, f.ownerName).folders.push(f.item);
    for (const entry of items) {
        const g = groupFor(entry.ownerId, entry.ownerName);
        const folderVisible = !entry.item.folderId || g.folders.some((f) => f.id === entry.item.folderId);
        g.items.push(folderVisible ? entry : { ...entry, item: { ...entry.item, folderId: undefined } });
    }
    for (const g of groups.values()) {
        const ids = new Set(g.folders.map((f) => f.id));
        g.folders = g.folders.map((f) => (f.parentId && !ids.has(f.parentId) ? { ...f, parentId: undefined } : f));
    }
    return [...groups.values()]
        .filter((g) => g.items.length > 0)
        .sort((a, b) => a.ownerName.localeCompare(b.ownerName));
}

/** Folders that hold at least one item somewhere below them, so empty branches are not shown. */
export function nonEmptyFolderIds(folders: Folder[], items: { folderId?: string }[]): Set<string> {
    const keep = new Set<string>();
    for (const item of items) {
        if (!item.folderId) continue;
        for (const f of folderPath(folders, item.folderId)) keep.add(f.id);
    }
    return keep;
}
