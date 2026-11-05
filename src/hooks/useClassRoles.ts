import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { storageSync } from '../services/database';
import { useDbStatus } from './useDbStatus';

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

/** My co-teacher roles by class id, or null while offline/unknown. */
function useMyClassRoles(): Roles | null {
    const db = useDbStatus();
    const userId = db.isConnected ? db.userId : null;
    const current = useSyncExternalStore(subscribe, () => state);

    useEffect(() => {
        if (userId && (state.userId !== userId || state.status === 'idle')) void load(userId);
    }, [userId]);

    return userId && current.userId === userId ? current.roles : null;
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
