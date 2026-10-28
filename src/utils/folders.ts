import type { Folder, FolderKind } from '../types';
import { sortByDisplayOrder } from './displayOrder';

/** Sentinel for the unfiltered view: every item, filed or not. */
export const ALL_FOLDERS = 'all';

export function foldersForKind(folders: Folder[], kind: FolderKind): Folder[] {
    return sortByDisplayOrder(folders.filter((folder) => folder.kind === kind));
}

/** Items filed under `selection`; `ALL_FOLDERS` keeps the whole list. */
export function filterByFolder<T extends { folderId?: string }>(items: T[], selection: string): T[] {
    if (selection === ALL_FOLDERS) return items;
    return items.filter((item) => item.folderId === selection);
}

export function itemsInFolder<T extends { folderId?: string }>(items: T[], folderId: string): T[] {
    return items.filter((item) => item.folderId === folderId);
}

export function countInFolder<T extends { folderId?: string }>(items: T[], folderId: string): number {
    return itemsInFolder(items, folderId).length;
}

/** Sorts a new folder after every existing one of its kind. */
export function nextFolderOrder(folders: Folder[], kind: FolderKind): number {
    return (
        folders.reduce((max, folder) => (folder.kind === kind ? Math.max(max, folder.displayOrder ?? -1) : max), -1) + 1
    );
}
