// Generated from src/context/AppContext.tsx by the domain-split refactor.
import React, { createContext, useMemo, ReactNode } from 'react';
import {
    Action,
    AppContextValue,
    LOCAL_MODE_KEY,
    MIGRATION_DONE_KEY,
    PlatformCtx,
    flushToLocalStorage,
    useContextOrThrow,
} from '../storeCore';
import type { UserRole } from '../../types';
import { StoreData, clearLocalData, importFullBackup, loadPendingQueue, loadStore } from '../../store/storage';
import { mergeStoreData } from '../../utils/syncMerge';
import { saveSupabaseConfig } from '../../services/database/supabaseConfig';
import { getDb, loadDb } from '../../services/database/lazyDb';
import type { DatabaseConfig, DbUser, SyncResult } from '../../services/database';
import { clearAuditLogger, initAuditLogger, logAuditEvent } from '../../services/database/AuditLogger';

export type PlatformValue = Pick<
    AppContextValue,
    | 'dispatch'
    | 'showLanding'
    | 'isCheckingSession'
    | 'showMigrationPrompt'
    | 'microsoftUser'
    | 'enterLocalMode'
    | 'connectForOAuth'
    | 'dismissMigrationPrompt'
    | 'signInWithGoogle'
    | 'signInWithMicrosoftPersonal'
    | 'signInWithAzureAD'
    | 'signOutFromDatabase'
    | 'loginMicrosoft'
    | 'logoutMicrosoft'
    | 'syncToOneDrive'
    | 'restoreFromOneDrive'
    | 'getCurrentDatabaseUserId'
    | 'connectDatabase'
    | 'disconnectDatabase'
    | 'pushAllToDatabase'
    | 'pullFromDatabase'
    | 'fetchAllUsers'
    | 'updateUserRole'
    | 'updateMyProfile'
    | 'fetchSchools'
    | 'createSchool'
    | 'joinSchool'
    | 'updateSchool'
    | 'deleteSchool'
    | 'fetchSchoolMembers'
    | 'removeSchoolMember'
    | 'importBackup'
>;

const PlatformContext = createContext<PlatformValue | null>(null);

export type PlatformActions = Pick<
    PlatformValue,
    | 'connectDatabase'
    | 'disconnectDatabase'
    | 'pushAllToDatabase'
    | 'pullFromDatabase'
    | 'fetchAllUsers'
    | 'updateUserRole'
    | 'updateMyProfile'
    | 'enterLocalMode'
    | 'connectForOAuth'
    | 'dismissMigrationPrompt'
    | 'signInWithGoogle'
    | 'signInWithMicrosoftPersonal'
    | 'signInWithAzureAD'
    | 'signOutFromDatabase'
    | 'importBackup'
    | 'loginMicrosoft'
    | 'logoutMicrosoft'
    | 'syncToOneDrive'
    | 'restoreFromOneDrive'
    | 'fetchSchools'
    | 'createSchool'
    | 'joinSchool'
    | 'updateSchool'
    | 'deleteSchool'
    | 'fetchSchoolMembers'
    | 'removeSchoolMember'
    | 'getCurrentDatabaseUserId'
>;

export function createPlatformActions(ctx: PlatformCtx): PlatformActions {
    const { getState, dispatch, showToast, t, setLandingState, setShowMigrationPrompt, applyHydrated } = ctx;
    const connectDatabase = async (config: DatabaseConfig): Promise<boolean> => {
        const { storageSync } = await loadDb();
        const ok = await storageSync.configure(config);
        if (ok) {
            saveSupabaseConfig(config);
            storageSync.setToastFn(showToast);
            const _userId = storageSync.getCurrentUserId();
            const _client = storageSync.adapter.getClient();
            if (_client && _userId) initAuditLogger(_client, _userId);
            const { data: fresh, error: hydrateError } = await storageSync.hydrate();
            if (hydrateError) showToast(t('toast.sync_load_failed'), 'warning');
            if (fresh) {
                const base = storageSync.didWipeLocalData() ? loadStore() : getState();
                const merged = mergeStoreData(base, fresh, loadPendingQueue());
                // Not seeded: this is the teacher's own owner-scoped connect flow, so a
                // reflexive re-push of pulled data can't fail RLS the way it can for a
                // read-only (e.g. student) session — see applyHydrated above.
                applyHydrated(merged, false);
                try {
                    await flushToLocalStorage(merged);
                } catch {
                    showToast(t('toast.storage_full'), 'error');
                }
            }
        }
        return ok;
    };
    const disconnectDatabase = () => {
        clearAuditLogger();
        getDb()?.storageSync.disconnect();
    };
    const pushAllToDatabase = async () => {
        return (await loadDb()).storageSync.pushAll(getState());
    };
    const pullFromDatabase = async () => {
        const { storageSync } = await loadDb();
        const { data: fresh, error: hydrateError } = await storageSync.hydrate();
        if (hydrateError) showToast(t('toast.sync_load_failed'), 'warning');
        if (fresh) {
            const merged = mergeStoreData(getState(), fresh, loadPendingQueue());
            // Not seeded: same owner-scoped reasoning as connectDatabase above.
            applyHydrated(merged, false);
        }
    };
    const fetchAllUsers = async (): Promise<DbUser[]> => {
        return (await loadDb()).storageSync.fetchAllProfiles();
    };
    const updateUserRole = async (userId: string, role: UserRole): Promise<SyncResult> => {
        const { storageSync } = await loadDb();
        const result = await storageSync.updateUserRole(userId, role);
        if (result.success) {
            logAuditEvent('admin', 'role_change', 'user', userId, { role });
            if (userId === storageSync.getCurrentUserId()) {
                dispatch({ type: 'UPDATE_SETTINGS', payload: { userRole: role } });
            }
        }
        return result;
    };
    const updateMyProfile = async (updates: { displayName?: string }): Promise<SyncResult> => {
        return (await loadDb()).storageSync.updateMyProfile(updates);
    };
    const enterLocalMode = () => {
        localStorage.setItem(LOCAL_MODE_KEY, 'true');
        setLandingState('hide');
    };
    const connectForOAuth = async (config: DatabaseConfig): Promise<boolean> => {
        saveSupabaseConfig(config);
        return (await loadDb()).storageSync.initAuth(config);
    };
    const dismissMigrationPrompt = async (upload: boolean) => {
        setShowMigrationPrompt(false);
        localStorage.setItem(MIGRATION_DONE_KEY, 'true');
        if (upload) await (await loadDb()).storageSync.pushAll(getState());
    };
    const signInWithGoogle = async (): Promise<{ error?: string }> => {
        return (await loadDb()).storageSync.signInWithGoogle();
    };
    const signInWithMicrosoftPersonal = async (): Promise<{ error?: string }> => {
        return (await loadDb()).storageSync.signInWithMicrosoftPersonal();
    };
    const signInWithAzureAD = async (): Promise<{ error?: string }> => {
        return (await loadDb()).storageSync.signInWithAzureAD();
    };
    const signOutFromDatabase = async () => {
        const { storageSync } = await loadDb();
        await storageSync.signOut();
        clearAuditLogger();
        // Shared-device hygiene: wipe this account's data from localStorage so the
        // next person to open the app on this browser doesn't see it. Only safe when
        // everything has actually reached Supabase — a non-empty pending queue means
        // wiping would lose edits that exist nowhere else yet.
        if (loadPendingQueue().length === 0) {
            clearLocalData();
            dispatch({ type: 'SET_ALL', payload: loadStore() });
        } else {
            showToast(t('toast.signout_pending_writes'), 'warning');
        }
        if (localStorage.getItem(LOCAL_MODE_KEY) !== 'true') {
            setLandingState('show');
        }
    };
    const importBackup = async (json: string): Promise<boolean> => {
        const ok = importFullBackup(json);
        if (ok) {
            const newState = loadStore();
            dispatch({ type: 'SET_ALL', payload: newState });
            const db = getDb();
            if (db?.storageSync.isConnected()) {
                // pushAll returns SyncResult (never rejects on normal failures).
                // Log the error but let the caller receive true (restore succeeded).
                // The pending-queue will retry the cloud push on reconnect.
                const result = await db.storageSync.pushAll(newState);
                if (!result.success) {
                    console.warn('[importBackup] local restore succeeded; cloud sync failed', result.error);
                }
            }
        }
        return ok;
    };
    const loginMicrosoft = async () => {};
    const logoutMicrosoft = async () => {};
    const syncToOneDrive = async () => {};
    const restoreFromOneDrive = async () => {};
    const fetchSchools = async () => (await loadDb()).storageSync.fetchSchools();
    const createSchool = async (name: string, retentionYears: number) =>
        (await loadDb()).storageSync.createSchool(name, retentionYears);
    const joinSchool = async (schoolId: string) => (await loadDb()).storageSync.joinSchool(schoolId);
    const updateSchool = async (schoolId: string, updates: { name?: string; retentionYears?: number }) =>
        (await loadDb()).storageSync.updateSchool(schoolId, updates);
    const deleteSchool = async (schoolId: string) => (await loadDb()).storageSync.deleteSchool(schoolId);
    const fetchSchoolMembers = async (schoolId: string) => (await loadDb()).storageSync.fetchSchoolMembers(schoolId);
    const removeSchoolMember = async (schoolId: string, profileId: string) =>
        (await loadDb()).storageSync.removeSchoolMember(schoolId, profileId);
    const getCurrentDatabaseUserId = () => getDb()?.storageSync.getCurrentUserId() ?? null;
    return {
        connectDatabase,
        disconnectDatabase,
        pushAllToDatabase,
        pullFromDatabase,
        fetchAllUsers,
        updateUserRole,
        updateMyProfile,
        enterLocalMode,
        connectForOAuth,
        dismissMigrationPrompt,
        signInWithGoogle,
        signInWithMicrosoftPersonal,
        signInWithAzureAD,
        signOutFromDatabase,
        importBackup,
        loginMicrosoft,
        logoutMicrosoft,
        syncToOneDrive,
        restoreFromOneDrive,
        fetchSchools,
        createSchool,
        joinSchool,
        updateSchool,
        deleteSchool,
        fetchSchoolMembers,
        removeSchoolMember,
        getCurrentDatabaseUserId,
    };
}

export function usePlatformValue(
    state: StoreData,
    actions: PlatformActions,
    dispatch: React.Dispatch<Action>,
    landingState: 'checking' | 'show' | 'hide',
    showMigrationPrompt: boolean
): PlatformValue {
    return useMemo(
        () => ({
            dispatch,
            showLanding: landingState === 'show',
            isCheckingSession: landingState === 'checking',
            showMigrationPrompt,
            microsoftUser: null,
            ...actions,
        }),
        [actions, dispatch, landingState, showMigrationPrompt]
    );
}

export function PlatformProvider({
    ctx,
    state,
    landingState,
    showMigrationPrompt,
    children,
}: {
    ctx: PlatformCtx;
    state: StoreData;
    landingState: 'checking' | 'show' | 'hide';
    showMigrationPrompt: boolean;
    children: ReactNode;
}) {
    const actions = useMemo(() => createPlatformActions(ctx), [ctx]);
    const value = usePlatformValue(state, actions, ctx.dispatch, landingState, showMigrationPrompt);
    return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformValue {
    return useContextOrThrow(PlatformContext, 'usePlatform');
}
