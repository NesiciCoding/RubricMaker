import React, { ReactNode } from 'react';
import { render, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AppProvider, usePlatform } from './AppContext';
import { useStoreSelector } from './useStore';
import * as storage from '../store/storage';
import type { StoreData } from '../store/storage';
import { DEFAULT_FORMAT } from '../types';

const mockShowToast = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

const mockEmptyState = vi.hoisted(() => (): StoreData => ({
    rubrics: [],
    students: [],
    classes: [],
    studentRubrics: [],
    attachments: [],
    gradeScales: [{ id: 'gs1', name: 'Default', type: 'letter', ranges: [] }],
    settings: {
        defaultGradeScaleId: 'gs1',
        theme: 'dark',
        language: 'en',
        accentColor: '#3b82f6',
        defaultFormat: {
            criterionColWidth: 200,
            levelColWidth: 160,
            fontSize: 14,
            headerColor: '#1e3a5f',
            headerTextColor: '#ffffff',
            accentColor: '#3b82f6',
            fontFamily: 'Inter',
            showWeights: true,
            showPoints: true,
            showCalculatedGrade: true,
            levelOrder: 'best-first',
            headerTextAlign: 'center',
            showBorders: true,
            rowStriping: false,
            orientation: 'portrait',
        },
    },
    favoriteStandards: [],
    commentBank: [],
    exportTemplates: [],
    peerReviews: [],
    selfAssessments: [],
    speakingSessions: [],
    analysisResults: [],
    essayTemplates: [],
    messages: [],
    essayAssignments: [],
    essaySubmissions: [],
    userTemplates: [],
    flashcardDecks: [],
    flashcardAssignments: [],
    flashcardReviews: [],
    standardMasteryTargets: [],
    newsFlashes: [],
    newsFlashReads: [],
    questionBank: [],
    documentComments: [],
    notificationDismissals: [],
    gradingTasks: [],
    tests: [],
    studentTests: [],
}));

vi.mock('../store/storage', () => ({
    LOCAL_MODE_KEY: 'rm_local_mode',
    MIGRATION_DONE_KEY: 'rm_migration_done',
    isMigrationDone: vi.fn(() => false),
    markMigrationDone: vi.fn(),
    loadStore: vi.fn(mockEmptyState),
    loadPendingQueue: vi.fn(() => []),
    sanitizeClassYears: vi.fn((cls) => cls),
    clearLocalData: vi.fn(),
    importFullBackup: vi.fn(() => true),
    setLocalMode: vi.fn(),
    isLocalMode: vi.fn(() => false),
    onStorageQuotaExceeded: vi.fn(),
    exportStore: vi.fn((s) => s),
    loadRubricVersions: vi.fn(() => []),
    upsertRubricVersion: vi.fn(() => ({ versions: [], evictedIds: [] })),
    deleteRubricVersions: vi.fn(),
    stripAudioForOfflineCache: vi.fn((srs) => srs),
    saveRubrics: vi.fn(),
    saveStudents: vi.fn(),
    saveClasses: vi.fn(),
    saveStudentRubrics: vi.fn(),
    saveAttachments: vi.fn(),
    saveGradeScales: vi.fn(),
    saveSettings: vi.fn(),
    saveFavoriteStandards: vi.fn(),
    saveCommentBank: vi.fn(),
    saveExportTemplates: vi.fn(),
    savePeerReviews: vi.fn(),
    saveSelfAssessments: vi.fn(),
    saveSpeakingSessions: vi.fn(),
    saveAnalysisResults: vi.fn(),
    saveEssayAssignments: vi.fn(),
    saveEssaySubmissions: vi.fn(),
    saveEssayTemplates: vi.fn(),
    saveGradingTasks: vi.fn(),
    saveMessages: vi.fn(),
    saveNewsFlashes: vi.fn(),
    saveNewsFlashReads: vi.fn(),
    saveNotificationDismissals: vi.fn(),
    saveQuestionBank: vi.fn(),
    saveDocumentComments: vi.fn(),
    saveUserTemplates: vi.fn(),
    saveFlashcardDecks: vi.fn(),
    saveFlashcardAssignments: vi.fn(),
    saveFlashcardReviews: vi.fn(),
    saveStandardMasteryTargets: vi.fn(),
    saveTests: vi.fn(),
    saveStudentTests: vi.fn(),
}));

// A fake Supabase-ish client shaped so AuditLogger's fire-and-forget insert never throws.
const fakeClient = vi.hoisted(() => ({
    from: vi.fn(() => ({
        insert: vi.fn(() => ({
            then: vi.fn(() => Promise.resolve({ error: null })),
        })),
    })),
}));

vi.mock('../services/database', () => ({
    storageSync: {
        isConnected: vi.fn(() => false),
        getCurrentUserId: vi.fn(() => null),
        adapter: { getClient: vi.fn(() => null) },
        onNetworkReconnect: () => () => {},
        onRealtimeChange: () => () => {},
        onAuthChange: () => () => {},
        configure: vi.fn(() => Promise.resolve(true)),
        setToastFn: vi.fn(),
        hydrate: vi.fn(() => Promise.resolve({ data: null, error: null })),
        hydratePartial: vi.fn(() => Promise.resolve({ data: null, fullFallback: false })),
        hasSession: () => false,
        initAuth: vi.fn(() => Promise.resolve()),
        didWipeLocalData: vi.fn(() => false),
        disconnect: vi.fn(),
        pushAll: vi.fn(() => Promise.resolve({ success: true })),
        pushOne: vi.fn(() => Promise.resolve()),
        pushMany: vi.fn(() => Promise.resolve()),
        fetchAllProfiles: vi.fn(() => Promise.resolve([])),
        updateUserRole: vi.fn(() => Promise.resolve({ success: true })),
        updateMyProfile: vi.fn(() => Promise.resolve({ success: true })),
        signInWithGoogle: vi.fn(() => Promise.resolve({})),
        signInWithMicrosoftPersonal: vi.fn(() => Promise.resolve({})),
        signInWithAzureAD: vi.fn(() => Promise.resolve({})),
        signOut: vi.fn(() => Promise.resolve()),
        fetchSchools: vi.fn(() => Promise.resolve([])),
        createSchool: vi.fn(() => Promise.resolve({ id: 'sch1' })),
        joinSchool: vi.fn(() => Promise.resolve()),
        updateSchool: vi.fn(() => Promise.resolve()),
        deleteSchool: vi.fn(() => Promise.resolve()),
        fetchSchoolMembers: vi.fn(() => Promise.resolve([])),
        removeSchoolMember: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../services/database/supabaseConfig', () => ({
    loadSupabaseConfig: vi.fn(() => null),
    saveSupabaseConfig: vi.fn(),
    clearSupabaseConfig: vi.fn(),
}));

describe('platform actions', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockShowToast.mockClear();
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };
        vi.mocked(storageSync.configure).mockResolvedValue(true);
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: null, error: null });
        vi.mocked(storageSync.pushAll).mockResolvedValue({ success: true });
        vi.mocked(storageSync.updateUserRole).mockResolvedValue({ success: true });
        vi.mocked(storageSync.adapter.getClient).mockReturnValue(null);
        vi.mocked(storageSync.getCurrentUserId).mockReturnValue(null);
        vi.mocked(storage.importFullBackup).mockReturnValue(true);
        vi.mocked(storage.loadPendingQueue).mockReturnValue([]);
    });

    it('connectDatabase configures, hydrates, and merges fresh data into state', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };

        const fresh = { ...mockEmptyState(), students: [{ id: 's1', name: 'Remote', classId: 'c1' }] };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: fresh, error: null });

        let platform: ReturnType<typeof usePlatform> | null = null;
        function Probe() {
            platform = usePlatform();
            const students = useStoreSelector((s) => s.students);
            return <div data-testid="students">{students.length}</div>;
        }
        const { getByTestId } = render(
            <AppProvider>
                <Probe />
            </AppProvider>
        );
        expect(getByTestId('students').textContent).toBe('0');

        let ok = false;
        await act(async () => {
            ok = await platform!.connectDatabase({
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'key',
            });
        });
        expect(ok).toBe(true);
        expect(storageSync.configure).toHaveBeenCalled();

        // The hydrated students made it into the same store.
        expect(getByTestId('students').textContent).toBe('1');
    });

    it('warns when flushing the connect hydrate to localStorage fails', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };

        const fresh = { ...mockEmptyState(), students: [{ id: 's1', name: 'Remote', classId: 'c1' }] };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: fresh, error: null });
        vi.mocked(storage.saveStudents).mockImplementation(() => {
            throw new Error('quota exceeded');
        });

        let platform: ReturnType<typeof usePlatform> | null = null;
        function Probe() {
            platform = usePlatform();
            return null;
        }
        render(
            <AppProvider>
                <Probe />
            </AppProvider>
        );

        await act(async () => {
            await platform!.connectDatabase({
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'key',
            });
        });
        expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
    });

    it('connectDatabase returns false when configure fails', async () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };
        vi.mocked(storageSync.configure).mockResolvedValue(false);

        let ok = true;
        await act(async () => {
            ok = await result.current.connectDatabase({
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'key',
            });
        });
        expect(ok).toBe(false);
    });

    it('connectDatabase warns when the fresh hydrate reports an error', async () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: null, error: 'boom' });

        await act(async () => {
            await result.current.connectDatabase({
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'key',
            });
        });
        expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'warning');
    });

    it('connectDatabase seeds the audit logger when a client and user are present', async () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };
        vi.mocked(storageSync.adapter.getClient).mockReturnValue(fakeClient as never);
        vi.mocked(storageSync.getCurrentUserId).mockReturnValue('u1');

        await act(async () => {
            await result.current.connectDatabase({
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'key',
            });
        });
        expect(storageSync.adapter.getClient).toHaveBeenCalled();
    });

    it('disconnectDatabase clears the audit logger and disconnects', async () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };
        // Let the reconnect effect resolve loadDb() so getDb() is populated.
        await act(async () => {});

        act(() => {
            result.current.disconnectDatabase();
        });
        expect(storageSync.disconnect).toHaveBeenCalled();
    });

    it('pushAllToDatabase and pullFromDatabase round-trip through the adapter', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };

        let platform: ReturnType<typeof usePlatform> | null = null;
        function Probe() {
            platform = usePlatform();
            const rubrics = useStoreSelector((s) => s.rubrics);
            return <div data-testid="rubrics">{rubrics.length}</div>;
        }
        render(
            <AppProvider>
                <Probe />
            </AppProvider>
        );

        let pushResult: { success: boolean } | undefined;
        await act(async () => {
            pushResult = await platform!.pushAllToDatabase();
        });
        expect(storageSync.pushAll).toHaveBeenCalled();
        expect(pushResult?.success).toBe(true);

        const fresh = { ...mockEmptyState(), rubrics: [{ id: 'r1', name: 'R', criteria: [] }] };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: fresh, error: null });
        await act(async () => {
            await platform!.pullFromDatabase();
        });
        expect(storageSync.hydrate).toHaveBeenCalled();
        // pullFromDatabase applies the merged snapshot into the same store.
        await act(async () => {});
    });

    it('pullFromDatabase warns when the hydrate reports an error and skips an empty hydrate', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };

        let platform: ReturnType<typeof usePlatform> | null = null;
        function Probe() {
            platform = usePlatform();
            return null;
        }
        render(
            <AppProvider>
                <Probe />
            </AppProvider>
        );
        await act(async () => {});

        // Hydrate error → warning toast, no merge.
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: null, error: 'boom' });
        await act(async () => {
            await platform!.pullFromDatabase();
        });
        expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'warning');

        // Fresh-but-null hydrate → no-op.
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: null, error: null });
        await act(async () => {
            await platform!.pullFromDatabase();
        });
    });

    it('connectDatabase hydrates against the wiped store when didWipeLocalData is true', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };
        vi.mocked(storageSync.didWipeLocalData).mockReturnValue(true);
        const fresh = { ...mockEmptyState(), students: [{ id: 's1', name: 'Remote', classId: 'c1' }] };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: fresh, error: null });
        // The loadStore() branch of the didWipe ternary is exercised.
        vi.mocked(storage.loadStore).mockReturnValueOnce(mockEmptyState());

        let platform: ReturnType<typeof usePlatform> | null = null;
        function Probe() {
            platform = usePlatform();
            return null;
        }
        render(
            <AppProvider>
                <Probe />
            </AppProvider>
        );

        await act(async () => {
            await platform!.connectDatabase({
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'key',
            });
        });
        expect(storage.loadStore).toHaveBeenCalled();
        vi.mocked(storageSync.didWipeLocalData).mockReturnValue(false);
    });

    it('signOutFromDatabase keeps the landing hidden in local mode', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };
        // Local mode at startup hides the landing; a sign-out must NOT flip it back.
        localStorage.setItem('rm_local_mode', 'true');
        vi.mocked(storage.isLocalMode).mockReturnValue(true);

        let platform: ReturnType<typeof usePlatform> | null = null;
        function Probe() {
            platform = usePlatform();
            return null;
        }
        render(
            <AppProvider>
                <Probe />
            </AppProvider>
        );

        await act(async () => {
            await platform!.signOutFromDatabase();
        });
        expect(storageSync.signOut).toHaveBeenCalled();
        expect(platform!.showLanding).toBe(false);
        vi.mocked(storage.isLocalMode).mockReturnValue(false);
        localStorage.removeItem('rm_local_mode');
    });

    it('manages users and profiles', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };

        let platform: ReturnType<typeof usePlatform> | null = null;
        function Probe() {
            platform = usePlatform();
            const role = useStoreSelector((s) => s.settings.userRole);
            return <div data-testid="role">{role ?? 'none'}</div>;
        }
        const { getByTestId } = render(
            <AppProvider>
                <Probe />
            </AppProvider>
        );

        await act(async () => {
            await platform!.fetchAllUsers();
        });
        expect(storageSync.fetchAllProfiles).toHaveBeenCalled();

        await act(async () => {
            await platform!.updateMyProfile({ displayName: 'New' });
        });
        expect(storageSync.updateMyProfile).toHaveBeenCalledWith({ displayName: 'New' });

        // Role change for another user: no local dispatch.
        vi.mocked(storageSync.getCurrentUserId).mockReturnValue('u1');
        await act(async () => {
            await platform!.updateUserRole('u2', 'teacher');
        });
        expect(storageSync.updateUserRole).toHaveBeenCalledWith('u2', 'teacher');
        expect(getByTestId('role').textContent).toBe('none');

        // Role change for self: settings update is dispatched.
        await act(async () => {
            await platform!.updateUserRole('u1', 'teacher');
        });
        expect(getByTestId('role').textContent).toBe('teacher');

        // Failed role change: no dispatch.
        vi.mocked(storageSync.updateUserRole).mockResolvedValue({ success: false, error: 'nope' });
        await act(async () => {
            await platform!.updateUserRole('u1', 'student');
        });
        expect(getByTestId('role').textContent).toBe('teacher');
    });

    it('enterLocalMode flags local mode and hides the landing page', () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });

        act(() => {
            result.current.enterLocalMode();
        });
        expect(storage.setLocalMode).toHaveBeenCalled();
        expect(result.current.showLanding).toBe(false);
    });

    it('connectForOAuth saves the config and initializes auth', async () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };

        await act(async () => {
            await result.current.connectForOAuth({
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'key',
            });
        });
        expect(storageSync.initAuth).toHaveBeenCalled();
    });

    it('dismissMigrationPrompt optionally uploads all data', async () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };

        await act(async () => {
            await result.current.dismissMigrationPrompt(false);
        });
        expect(storageSync.pushAll).not.toHaveBeenCalled();

        await act(async () => {
            await result.current.dismissMigrationPrompt(true);
        });
        expect(storageSync.pushAll).toHaveBeenCalled();
    });

    it('delegates OAuth sign-ins to the adapter', async () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };

        await act(async () => {
            await result.current.signInWithGoogle();
        });
        expect(storageSync.signInWithGoogle).toHaveBeenCalled();
        await act(async () => {
            await result.current.signInWithMicrosoftPersonal();
        });
        expect(storageSync.signInWithMicrosoftPersonal).toHaveBeenCalled();
        await act(async () => {
            await result.current.signInWithAzureAD();
        });
        expect(storageSync.signInWithAzureAD).toHaveBeenCalled();
    });

    it('signOutFromDatabase wipes local data when the pending queue is empty and shows the landing page', async () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };

        await act(async () => {
            await result.current.signOutFromDatabase();
        });
        expect(storageSync.signOut).toHaveBeenCalled();
        expect(storage.clearLocalData).toHaveBeenCalled();
        expect(result.current.showLanding).toBe(true);
    });

    it('signOutFromDatabase warns when the pending queue is not empty', async () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        vi.mocked(storage.loadPendingQueue).mockReturnValue([
            { id: '1', entity: 'rubric', action: 'upsert', payload: {}, queuedAt: '2024-01-01' },
        ]);

        await act(async () => {
            await result.current.signOutFromDatabase();
        });
        expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'warning');
        expect(storage.clearLocalData).not.toHaveBeenCalled();
    });

    it('importBackup restores state and pushes to the cloud when connected', async () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };

        // Not connected: local restore only.
        let ok = false;
        await act(async () => {
            ok = await result.current.importBackup('{"rubrics":[]}');
        });
        expect(ok).toBe(true);
        expect(storage.importFullBackup).toHaveBeenCalledWith('{"rubrics":[]}');
        expect(storageSync.pushAll).not.toHaveBeenCalled();

        // Connected: local restore + cloud push.
        vi.mocked(storageSync.isConnected).mockReturnValue(true);
        await act(async () => {
            await result.current.importBackup('{"rubrics":[]}');
        });
        expect(storageSync.pushAll).toHaveBeenCalled();

        // Failed import: false.
        vi.mocked(storage.importFullBackup).mockReturnValue(false);
        await act(async () => {
            ok = await result.current.importBackup('garbage');
        });
        expect(ok).toBe(false);
    });

    it('importBackup warns when the connected cloud push fails', async () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };
        vi.mocked(storageSync.isConnected).mockReturnValue(true);
        vi.mocked(storageSync.pushAll).mockResolvedValue({ success: false, error: 'cloud down' });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await act(async () => {
            await result.current.importBackup('{"rubrics":[]}');
        });
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('OneDrive actions are no-ops and school methods delegate to the adapter', async () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: Record<string, Mock> & { adapter: { getClient: Mock } };
        };

        await act(async () => {
            await result.current.loginMicrosoft();
            await result.current.logoutMicrosoft();
            await result.current.syncToOneDrive();
            await result.current.restoreFromOneDrive();
        });

        await act(async () => {
            await result.current.fetchSchools();
        });
        expect(storageSync.fetchSchools).toHaveBeenCalled();

        await act(async () => {
            await result.current.createSchool('School', 2);
        });
        expect(storageSync.createSchool).toHaveBeenCalledWith('School', 2);

        await act(async () => {
            await result.current.joinSchool('sch1');
        });
        expect(storageSync.joinSchool).toHaveBeenCalledWith('sch1');

        await act(async () => {
            await result.current.updateSchool('sch1', { name: 'Renamed' });
        });
        expect(storageSync.updateSchool).toHaveBeenCalledWith('sch1', { name: 'Renamed' });

        await act(async () => {
            await result.current.deleteSchool('sch1');
        });
        expect(storageSync.deleteSchool).toHaveBeenCalledWith('sch1');

        await act(async () => {
            await result.current.fetchSchoolMembers('sch1');
        });
        expect(storageSync.fetchSchoolMembers).toHaveBeenCalledWith('sch1');

        await act(async () => {
            await result.current.removeSchoolMember('sch1', 'p1');
        });
        expect(storageSync.removeSchoolMember).toHaveBeenCalledWith('sch1', 'p1');
    });

    it('getCurrentDatabaseUserId returns the current user id or null', () => {
        const { result } = renderHook(() => usePlatform(), { wrapper });
        expect(result.current.getCurrentDatabaseUserId()).toBeNull();
    });
});
