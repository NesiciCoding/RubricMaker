import type { Folder, FolderKind } from '../types';
import { sortByDisplayOrder } from './displayOrder';

/** Sentinel for the unfiltered view: every item, filed or not. */
export const ALL_FOLDERS = 'all';

/**
 * How deep folders may nest. Each extra level costs a click to walk back up, and the folder bar
 * has to stay readable, so the tree stops here rather than growing without bound.
 */
export const MAX_FOLDER_DEPTH = 4;

export function foldersForKind(folders: Folder[], kind: FolderKind): Folder[] {
    return sortByDisplayOrder(folders.filter((folder) => folder.kind === kind));
}

/** The folders directly inside `parentId` (top level when it is undefined), siblings in order. */
export function childFolders(folders: Folder[], kind: FolderKind, parentId?: string): Folder[] {
    return sortByDisplayOrder(folders.filter((folder) => folder.kind === kind && folder.parentId === parentId));
}

/**
 * The chain from a top-level folder down to `folderId`, inclusive; empty when the id is unknown.
 * A folder whose parent went missing (a stale `parentId` from a deleted ancestor) still reports
 * the part of its chain that exists, so the breadcrumb never comes back blank.
 */
export function folderPath(folders: Folder[], folderId: string): Folder[] {
    const path: Folder[] = [];
    const seen = new Set<string>();
    let current = folders.find((folder) => folder.id === folderId);
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        path.unshift(current);
        current = current.parentId ? folders.find((folder) => folder.id === current!.parentId) : undefined;
    }
    return path;
}

/**
 * The folder's full path as one label — “Year 1 / Essays” — so a card can say where it lives
 * without the reader having to walk the tree. Undefined when the item is unfiled.
 */
export function folderPathLabel(folders: Folder[], folderId?: string): string | undefined {
    if (!folderId) return undefined;
    const path = folderPath(folders, folderId);
    return path.length > 0 ? path.map((folder) => folder.name).join(' / ') : undefined;
}

/** 1 for a top-level folder, 2 for its child, and 0 for an id that is not in `folders`. */
export function folderDepth(folders: Folder[], folderId: string): number {
    return folderPath(folders, folderId).length;
}

/** Every folder below `folderId`, but not the folder itself. */
export function descendantFolderIds(folders: Folder[], folderId: string): string[] {
    const descendants: string[] = [];
    const queue = [folderId];
    const seen = new Set(queue);
    while (queue.length > 0) {
        const parentId = queue.shift()!;
        for (const folder of folders) {
            if (folder.parentId !== parentId || seen.has(folder.id)) continue;
            seen.add(folder.id);
            descendants.push(folder.id);
            queue.push(folder.id);
        }
    }
    return descendants;
}

export function itemsInFolder<T extends { folderId?: string }>(items: T[], folderId: string): T[] {
    return items.filter((item) => item.folderId === folderId);
}

export function countInFolder<T extends { folderId?: string }>(items: T[], folderId: string): number {
    return itemsInFolder(items, folderId).length;
}

/**
 * Items filed under `folderId` or under any folder inside it. This is what a folder tile shows:
 * a folder that only holds subfolders would otherwise look empty from the outside.
 */
export function countInFolderTree<T extends { folderId?: string }>(
    items: T[],
    folders: Folder[],
    folderId: string
): number {
    const ids = new Set([folderId, ...descendantFolderIds(folders, folderId)]);
    return items.filter((item) => item.folderId !== undefined && ids.has(item.folderId)).length;
}

/** Items filed under `selection`; `ALL_FOLDERS` keeps the whole list. */
export function filterByFolder<T extends { folderId?: string }>(items: T[], selection: string): T[] {
    if (selection === ALL_FOLDERS) return items;
    return items.filter((item) => item.folderId === selection);
}

/** Sorts a new folder after every existing sibling — same kind, same parent. */
export function nextFolderOrder(folders: Folder[], kind: FolderKind, parentId?: string): number {
    return (
        childFolders(folders, kind, parentId).reduce((max, folder) => Math.max(max, folder.displayOrder ?? -1), -1) + 1
    );
}

/**
 * Whether `folderId` may move into `parentId`. A folder cannot become its own ancestor, and nesting
 * past `MAX_FOLDER_DEPTH` is refused; everything else is allowed, including moving to the top level
 * (`parentId === undefined`).
 */
export function canNestFolder(folders: Folder[], folderId: string, parentId?: string): boolean {
    if (parentId === undefined) return true;
    if (parentId === folderId) return false;
    if (descendantFolderIds(folders, folderId).includes(parentId)) return false;
    const targetDepth = folderDepth(folders, parentId);
    if (targetDepth === 0) return false;
    // The moving folder brings its whole subtree along, so the deepest descendant decides.
    const subtreeHeight = Math.max(
        0,
        ...descendantFolderIds(folders, folderId).map((id) => folderDepth(folders, id) - folderDepth(folders, folderId))
    );
    return targetDepth + 1 + subtreeHeight <= MAX_FOLDER_DEPTH;
}
