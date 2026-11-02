import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { storageSync } from '../services/database';
import type { Folder, Rubric, Test } from '../types';
import type { SharedEntry } from '../utils/materialSharing';
import { useDbStatus } from './useDbStatus';

export type SharedKind = 'rubric' | 'test';
type ItemOf<K extends SharedKind> = K extends 'rubric' ? Rubric : Test;

export interface SharedMaterialsState<T> {
    status: 'idle' | 'loading' | 'ready' | 'error';
    items: SharedEntry<T>[];
    folders: SharedEntry<Folder>[];
    /** The signed-in user the cache was loaded for, so a different account never sees it. */
    userId: string | null;
}

const EMPTY = { status: 'idle', items: [], folders: [], userId: null } as const;

const cache: Record<SharedKind, SharedMaterialsState<Rubric | Test>> = {
    rubric: { ...EMPTY, items: [], folders: [] },
    test: { ...EMPTY, items: [], folders: [] },
};
const listeners = new Set<() => void>();

function setState(kind: SharedKind, next: SharedMaterialsState<Rubric | Test>) {
    cache[kind] = next;
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

async function load(kind: SharedKind, userId: string) {
    const sameUser = cache[kind].userId === userId;
    setState(
        kind,
        sameUser
            ? { ...cache[kind], status: 'loading' }
            : { ...EMPTY, items: [], folders: [], status: 'loading', userId }
    );
    try {
        const { items, folders } = await storageSync.adapter.fetchSharedMaterials(kind);
        if (cache[kind].userId !== userId) return;
        setState(kind, { status: 'ready', items, folders, userId });
    } catch {
        if (cache[kind].userId !== userId) return;
        setState(kind, { status: 'error', items: [], folders: [], userId });
    }
}

/** Test seam: forget everything cached so each test starts from a clean slate. */
export function resetSharedMaterialsCache() {
    setState('rubric', { ...EMPTY, items: [], folders: [] });
    setState('test', { ...EMPTY, items: [], folders: [] });
}

/**
 * Colleagues' rubrics or tests shared with the signed-in teacher (co-teachers, school, per-person
 * shares, or everything in the school for an admin). Kept outside AppContext on purpose: these
 * rows belong to other teachers, so they must never enter the owner-scoped sync, local cache or
 * backups. Empty while offline or signed out.
 */
export function useSharedMaterials<K extends SharedKind>(kind: K, enabled = true) {
    const db = useDbStatus();
    const userId = db.isConnected ? db.userId : null;
    const state = useSyncExternalStore(subscribe, () => cache[kind]) as SharedMaterialsState<ItemOf<K>>;

    useEffect(() => {
        if (!userId || !enabled) return;
        if (cache[kind].userId !== userId || cache[kind].status === 'idle') void load(kind, userId);
    }, [kind, userId, enabled]);

    const refresh = useCallback(() => {
        if (userId) void load(kind, userId);
    }, [kind, userId]);

    const save = useCallback(
        async (item: ItemOf<K>): Promise<{ success: boolean; error?: string }> => {
            const result = await storageSync.adapter.updateSharedMaterial(kind, item);
            if (result.success) {
                const current = cache[kind];
                setState(kind, {
                    ...current,
                    items: current.items.map((e) => (e.item.id === item.id ? { ...e, item } : e)),
                });
            }
            return result;
        },
        [kind]
    );

    const visible = userId && state.userId === userId;
    return {
        status: visible ? state.status : ('idle' as const),
        items: visible ? state.items : [],
        folders: visible ? state.folders : [],
        connected: !!userId,
        refresh,
        save,
    };
}
