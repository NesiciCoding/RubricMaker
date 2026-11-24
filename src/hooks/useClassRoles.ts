import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { loadDb } from '../services/database/lazyDb';
import { loadSupabaseConfig } from '../services/database/supabaseConfig';
import type { ClassRoles } from '../utils/rosterScope';

type Roles = Record<string, 'viewer' | 'editor'>;

interface State {
    userId: string | null;
    roles: Roles;
    status: 'idle' | 'loading' | 'ready' | 'error';
}

let state: State = { userId: null, roles: {}, status: 'idle' };
const listeners = new Set<() => void>();

function set(next: State) {
    state = next;
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

async function load(userId: string) {
    set({ userId, roles: state.userId === userId ? state.roles : {}, status: 'loading' });
    try {
        const { storageSync } = await loadDb();
        const roles = await storageSync.adapter.fetchMyClassRoles();
        if (state.userId === userId) set({ userId, roles, status: 'ready' });
    } catch {
        if (state.userId === userId) set({ userId, roles: {}, status: 'error' });
    }
}

/** Test seam. */
export function resetClassRolesCache() {
    set({ userId: null, roles: {}, status: 'idle' });
}

/**
 * Keeps the cache in step with the signed-in user without importing the database module: this hook
 * is read by the app-wide roster provider, and a static import of `services/database` would drag
 * @supabase/supabase-js (~450KB) into the entry chunk. With no Supabase config there is nothing to
 * fetch, so offline installs never load the module at all.
 */
function useClassRolesSubscription() {
    useEffect(() => {
        if (!loadSupabaseConfig()) return;
        let cancelled = false;
        let unsubscribe: (() => void) | undefined;
        void loadDb()
            .then(({ storageSync }) => {
                if (cancelled) return;
                const sync = () => {
                    const uid = storageSync.isConnected() ? storageSync.getCurrentUserId() : null;
                    if (!uid) {
                        if (state.userId) set({ userId: null, roles: {}, status: 'idle' });
                        return;
                    }
                    if (state.userId !== uid || state.status === 'idle') void load(uid);
                };
                sync();
                unsubscribe = storageSync.subscribe(sync);
            })
            .catch(() => {
                // No database available: every class counts as the caller's own.
            });
        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, []);
}

/** My co-teacher roles by class id, or null while offline/unknown. */
export function useMyClassRoles(): ClassRoles {
    const current = useSyncExternalStore(subscribe, () => state);
    useClassRolesSubscription();
    return current.userId ? current.roles : null;
}

/**
 * Whether I may change grades and test results for a student in `classId`. Only a class shared
 * with me as "Can view" is read-only (migration 096 refuses those writes); my own classes, and
 * everything while offline, stay editable.
 */
export function useCanEditStudentWork() {
    const roles = useMyClassRoles();
    return useCallback((classId: string | undefined) => !classId || roles?.[classId] !== 'viewer', [roles]);
}

/**
 * Whether I may change roster fields (name, class, track, year…) of a student in `classId`.
 * Students are owner-only rows (`students_owner_all`, migration 026): any co-taught class — even
 * as "Can edit" — refuses the write, and the rejected push would sit in the pending queue forever,
 * shielding a divergent local copy from hydrate. My own classes, and everything offline, stay editable.
 */
export function useCanEditRoster() {
    const roles = useMyClassRoles();
    return useCallback((classId: string | undefined) => !classId || !roles?.[classId], [roles]);
}
