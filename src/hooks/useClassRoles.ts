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

/**
 * Whether I may change grades and test results for a student in `classId`. Only a class shared
 * with me as "Can view" is read-only (migration 096 refuses those writes); my own classes, and
 * everything while offline, stay editable.
 */
export function useCanEditStudentWork() {
    const db = useDbStatus();
    const userId = db.isConnected ? db.userId : null;
    const current = useSyncExternalStore(subscribe, () => state);

    useEffect(() => {
        if (userId && (state.userId !== userId || state.status === 'idle')) void load(userId);
    }, [userId]);

    const roles = userId && current.userId === userId ? current.roles : null;
    return useCallback((classId: string | undefined) => !classId || roles?.[classId] !== 'viewer', [roles]);
}
