// Generated from src/context/AppContext.tsx by the domain-split refactor.
import React, { createContext, useMemo, ReactNode } from 'react';
import { Action, AppContextValue, PlatformCtx, flushToLocalStorage, useContextOrThrow } from '../storeCore';
import type { UserRole } from '../../types';
import {
    clearLocalData,
    importFullBackup,
    isLocalMode,
    loadPendingQueue,
    loadStore,
    markMigrationDone,
    isMigrationPending,
    skipMigrationForSession,
    setLocalMode,
} from '../../store/storage';
import { mergeStoreData } from '../../utils/syncMerge';
import { saveSupabaseConfig } from '../../services/database/supabaseConfig';
import { getDb, loadDb } from '../../services/database/lazyDb';
import type { DatabaseConfig, DbUser, SyncResult } from '../../services/database';
import { clearAuditLogger, initAuditLogger } from '../../services/database/AuditLogger';

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
        // The role_change audit entry is written by a database trigger (migration 081), only when
        // the row really changed — an RLS-blocked update also returns success here.
        if (result.success) {
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
        setLocalMode();
        setLandingState('hide');
    };
    const connectForOAuth = async (config: DatabaseConfig): Promise<boolean> => {
        saveSupabaseConfig(config);
        return (await loadDb()).storageSync.initAuth(config);
    };
    // Only a successful upload ends the migration: a failed push keeps the prompt open (the
    // caller shows the error) and "Skip for now" lasts for this session only.
    const dismissMigrationPrompt = async (upload: boolean): Promise<SyncResult> => {
        if (!upload) {
            skipMigrationForSession();
            setShowMigrationPrompt(false);
            return { success: true };
        }
        let result: SyncResult;
        try {
            result = await (await loadDb()).storageSync.pushAll(getState());
        } catch (e) {
            result = { success: false, error: e instanceof Error ? e.message : String(e) };
        }
        if (!result.success) return result;
        markMigrationDone();
        setShowMigrationPrompt(false);
        showToast(t('migration.upload_success'), 'success');
        return result;
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
        // In local mode (or a session that never connected) localStorage is the only copy,
        // so it must survive a sign-out (#623). Read before signOut() drops the connection.
        const cloudBacked = !isLocalMode() && storageSync.isConnected();
        await storageSync.signOut();
        clearAuditLogger();
        // Shared-device hygiene: wipe this account's data from localStorage so the
        // next person to open the app on this browser doesn't see it. Only safe when
        // everything has actually reached Supabase — a non-empty pending queue means
        // wiping would lose edits that exist nowhere else yet.
        // Local data that was never uploaded (migration skipped or failed) isn't in the pending
        // queue either, so it is kept too.
        const unmigrated = isMigrationPending();
        if (cloudBacked && loadPendingQueue().length === 0 && !unmigrated) {
            clearLocalData();
            dispatch({ type: 'SET_ALL', payload: loadStore() });
        } else if (cloudBacked) {
            showToast(t(unmigrated ? 'toast.signout_unmigrated_local' : 'toast.signout_pending_writes'), 'warning');
        }
        if (!isLocalMode()) {
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
    landingState,
    showMigrationPrompt,
    children,
}: {
    ctx: PlatformCtx;
    landingState: 'checking' | 'show' | 'hide';
    showMigrationPrompt: boolean;
    children: ReactNode;
}) {
    const actions = useMemo(() => createPlatformActions(ctx), [ctx]);
    const value = usePlatformValue(actions, ctx.dispatch, landingState, showMigrationPrompt);
    return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformValue {
    return useContextOrThrow(PlatformContext, 'usePlatform');
}
