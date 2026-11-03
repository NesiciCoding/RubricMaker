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

const saveChains: Record<SharedKind, Promise<unknown>> = { rubric: Promise.resolve(), test: Promise.resolve() };

function replaceItem(kind: SharedKind, item: Rubric | Test) {
    const current = cache[kind];
    setState(kind, {
        ...current,
        items: current.items.map((e) => (e.item.id === item.id ? { ...e, item } : e)),
    });
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

async function load(kind: SharedKind, userId: string, background = false) {
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
        // A background live-refresh failure (e.g. a transient network blip) shouldn't wipe an
        // already-loaded cache and blank every picker — keep serving the stale items instead.
        setState(
            kind,
            background ? { ...cache[kind], status: 'ready' } : { status: 'error', items: [], folders: [], userId }
        );
    }
}

/** Test seam: forget everything cached so each test starts from a clean slate. */
export function resetSharedMaterialsCache() {
    setState('rubric', { ...EMPTY, items: [], folders: [] });
    setState('test', { ...EMPTY, items: [], folders: [] });
}

// Live refresh when a colleague's shared/co-taught rubric, test or folder changes (StorageSync's
// owner_id<>me realtime binding — see onSharedMaterialChange). Registered once, lazily, the first
// time any component mounts useSharedMaterials; a folder's kind isn't in the event (just the table
// name), so refresh whichever of the two caches is already loaded. Optional chaining: storageSync
// mocks in existing tests don't all stub this method.
let sharedMaterialListenerAttached = false;
function ensureSharedMaterialListener() {
    if (sharedMaterialListenerAttached) return;
    sharedMaterialListenerAttached = true;
    try {
        storageSync.onSharedMaterialChange?.((tables: string[]) => {
            const kinds = new Set<SharedKind>();
            for (const table of tables) {
                if (table === 'rubrics') kinds.add('rubric');
                else if (table === 'tests') kinds.add('test');
                else if (table === 'folders') {
                    kinds.add('rubric');
                    kinds.add('test');
                }
            }
            for (const kind of kinds) {
                const userId = cache[kind].userId;
                if (userId) void load(kind, userId, true);
            }
        });
    } catch {
        // Some tests mock services/database without a storageSync export at all — nothing to
        // subscribe to in that case, and the module-level cache this hook serves is otherwise
        // unaffected.
    }
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
        ensureSharedMaterialListener();
    }, []);

    useEffect(() => {
        if (!userId || !enabled) return;
        if (cache[kind].userId !== userId || cache[kind].status === 'idle') void load(kind, userId);
    }, [kind, userId, enabled]);

    const refresh = useCallback(() => {
        if (userId) void load(kind, userId);
    }, [kind, userId]);

    const save = useCallback(
        async (item: ItemOf<K>): Promise<{ success: boolean; error?: string }> => {
            // Optimistic: the next edit (e.g. a second norm change on the score sheet) must build on
            // this one, not on the stale copy. Saves run one at a time so they land in order.
            const previous = cache[kind].items.find((e) => e.item.id === item.id)?.item;
            replaceItem(kind, item);
            const run = saveChains[kind].then(() =>
                storageSync.adapter
                    .updateSharedMaterial(kind, item)
                    .catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : String(e) }))
            );
            saveChains[kind] = run;
            const result = await run;
            const stillOurs = cache[kind].items.some((e) => e.item === item);
            if (!result.success && previous && stillOurs) replaceItem(kind, previous);
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

/**
 * The teacher's own rubric/test when they have it, otherwise a colleague's one they can read
 * (shared with them, or used in a class they co-teach). `loading` stays true until the shared
 * list has arrived, so pages can wait instead of reporting "not found".
 */
export function useOwnOrSharedItem<K extends SharedKind>(kind: K, id: string | undefined, own: ItemOf<K> | undefined) {
    const shared = useSharedMaterials(kind, !!id && !own);
    const entry = own || !id ? undefined : shared.items.find((e) => e.item.id === id);
    return {
        item: own ?? entry?.item,
        entry,
        loading:
            !own && !entry && !!id && shared.connected && (shared.status === 'idle' || shared.status === 'loading'),
    };
}
