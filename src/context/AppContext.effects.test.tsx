import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
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

// Captured callbacks so tests can drive the async effect handlers exactly like Supabase would.
const authHandlers = vi.hoisted(() => [] as Array<(user: unknown) => void>);
const reconnectHandlers = vi.hoisted(() => [] as Array<() => void>);
const realtimeHandlers = vi.hoisted(() => [] as Array<(tables: string[]) => void>);

const loadStoreValue = vi.hoisted(() => ({ current: null as ReturnType<typeof mockEmptyState> | null }));

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
    loadStore: vi.fn(() => loadStoreValue.current ?? mockEmptyState()),
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

vi.mock('../services/database', () => ({
    storageSync: {
        isConnected: vi.fn(() => false),
        getCurrentUserId: vi.fn(() => null),
        adapter: { getClient: vi.fn(() => null) },
        onNetworkReconnect: vi.fn((handler: () => void) => {
            reconnectHandlers.push(handler);
            return () => {};
        }),
        onRealtimeChange: vi.fn((handler: (tables: string[]) => void) => {
            realtimeHandlers.push(handler);
            return () => {};
        }),
        onAuthChange: vi.fn((handler: (user: unknown) => void) => {
            authHandlers.push(handler);
            return () => {};
        }),
        configure: vi.fn(() => Promise.resolve(true)),
        setToastFn: vi.fn(),
        hydrate: vi.fn(() => Promise.resolve({ data: null, error: null })),
        hydratePartial: vi.fn(() => Promise.resolve({ data: null, fullFallback: false })),
        hasSession: vi.fn(() => false),
        initAuth: vi.fn(() => Promise.resolve()),
        didWipeLocalData: vi.fn(() => false),
        disconnect: vi.fn(),
        pushAll: vi.fn(() => Promise.resolve({ success: true })),
        pushOne: vi.fn(() => Promise.resolve()),
        pushMany: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../services/database/supabaseConfig', () => ({
    loadSupabaseConfig: vi.fn(() => null),
    saveSupabaseConfig: vi.fn(),
    clearSupabaseConfig: vi.fn(),
}));

const CONFIG = { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'key' };

function renderProvider(loadStoreValue?: ReturnType<typeof mockEmptyState>) {
    if (loadStoreValue) vi.mocked(storage.loadStore).mockReturnValueOnce(loadStoreValue);
    let platform: ReturnType<typeof usePlatform> | null = null;
    function Probe() {
        platform = usePlatform();
        return (
            <div data-testid="landing">
                {platform.showLanding ? 'show' : platform.isCheckingSession ? 'checking' : 'hide'}
            </div>
        );
    }
    const view = render(
        <AppProvider>
            <Probe />
        </AppProvider>
    );
    return { view, getPlatform: () => platform! };
}

describe('AppContext startup effects', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockShowToast.mockClear();
        authHandlers.length = 0;
        reconnectHandlers.length = 0;
        realtimeHandlers.length = 0;
        localStorage.clear();
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.configure).mockResolvedValue(true);
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: null, error: null });
        vi.mocked(storageSync.hasSession).mockReturnValue(false);
        vi.mocked(storageSync.initAuth).mockResolvedValue(undefined);
        vi.mocked(storageSync.isConnected).mockReturnValue(false);
        vi.mocked(storageSync.didWipeLocalData).mockReturnValue(false);
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(null);
    });

    it('shows the landing page when no database config exists', () => {
        const { getPlatform } = renderProvider();
        expect(getPlatform().showLanding).toBe(true);
    });

    it('hides the landing page immediately in local mode', () => {
        localStorage.setItem('rm_local_mode', 'true');
        const { getPlatform } = renderProvider();
        expect(getPlatform().showLanding).toBe(false);
    });

    it('enters the app when a session already exists on startup', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);

        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(getPlatform().showLanding).toBe(false);
        expect(storageSync.configure).toHaveBeenCalledWith(CONFIG);
        expect(storageSync.setToastFn).toHaveBeenCalled();
    });

    it('shows the landing page when startup configure fails', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);
        vi.mocked(storageSync.configure).mockResolvedValue(false);

        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(getPlatform().showLanding).toBe(true);
    });

    it('shows the landing page when no session exists on startup', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);

        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(getPlatform().showLanding).toBe(true);
    });

    it('shows the landing page and logs when initAuth rejects', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.initAuth).mockRejectedValue(new Error('auth boom'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(getPlatform().showLanding).toBe(true);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('caches offline and hides the landing when navigator is offline', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);
        const originalOnLine = navigator.onLine;
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'info');
        expect(getPlatform().showLanding).toBe(false);

        Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine });
    });

    it('warns when startup hydrate reports an error', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: null, error: 'hydrate boom' });

        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'warning');
        expect(getPlatform().showLanding).toBe(false);
    });

    it('hydrates fresh data into state and shows the migration prompt when local data exists', async () => {
        // Guard against the offline test above leaving navigator.onLine false.
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);
        const fresh = { ...mockEmptyState(), students: [{ id: 's1', name: 'Sync', classId: 'c1' }] };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: fresh, error: null });
        const withLocalData = {
            ...mockEmptyState(),
            rubrics: [{ id: 'r1', name: 'Local', criteria: [] }],
        } as unknown as StoreData;
        loadStoreValue.current = withLocalData;
        try {
            const { getPlatform } = renderProvider();
            // The startup flow ends with a dynamic import (flushToLocalStorage ->
            // mediaStore), which settles after plain act() — poll until the prompt lands.
            await waitFor(
                () => {
                    expect(getPlatform().showLanding).toBe(false);
                    expect(getPlatform().showMigrationPrompt).toBe(true);
                },
                { timeout: 3000 }
            );
            expect(storage.saveStudents).toHaveBeenCalled();
        } finally {
            loadStoreValue.current = null;
        }
    });

    it('hydrates against the wiped store when didWipeLocalData is true', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);
        vi.mocked(storageSync.didWipeLocalData).mockReturnValue(true);
        const fresh = { ...mockEmptyState(), students: [{ id: 's1', name: 'Sync', classId: 'c1' }] };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: fresh, error: null });

        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(getPlatform().showLanding).toBe(false);
        // loadStore() (the wiped baseline) was used for the merge — migration prompt suppressed.
        expect(getPlatform().showMigrationPrompt).toBe(false);
    });

    it('does not show the migration prompt when no local data exists', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);

        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(getPlatform().showMigrationPrompt).toBe(false);
    });

    it('runs the full OTP login flow when a user signs in on the landing page', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        const fresh = { ...mockEmptyState(), classes: [{ id: 'c1', name: 'C' }] };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: fresh, error: null });

        // No session on startup → landing page shows; sessionHandled stays false.
        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(getPlatform().showLanding).toBe(true);

        // Now a sign-in arrives while the landing page is visible.
        await act(async () => {
            authHandlers.forEach((h) => h({ id: 'user-1' }));
        });
        expect(getPlatform().showLanding).toBe(false);
        expect(storageSync.configure).toHaveBeenCalled();
        expect(storage.saveClasses).toHaveBeenCalled();
    });

    it('skips the OTP handler for null users, already-connected sessions, or missing config', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        const configureCalls = () => vi.mocked(storageSync.configure).mock.calls.length;

        // No config at startup: the startup effect returns early without registering an
        // auth handler, so only the in-page OTP handler is listening — its guard clauses
        // can be exercised in isolation.
        renderProvider();
        await act(async () => {});

        // Null user → skip.
        await act(async () => {
            authHandlers.forEach((h) => h(null));
        });
        expect(configureCalls()).toBe(0);

        // Already connected → skip.
        vi.mocked(storageSync.isConnected).mockReturnValue(true);
        await act(async () => {
            authHandlers.forEach((h) => h({ id: 'user-2' }));
        });
        expect(configureCalls()).toBe(0);
        vi.mocked(storageSync.isConnected).mockReturnValue(false);

        // No config → skip (loadSupabaseConfig still returns null from beforeEach).
        await act(async () => {
            authHandlers.forEach((h) => h({ id: 'user-3' }));
        });
        expect(configureCalls()).toBe(0);
    });

    it('OTP configure failure returns to the landing page', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.configure).mockResolvedValue(false);

        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(getPlatform().showLanding).toBe(true);

        await act(async () => {
            authHandlers.forEach((h) => h({ id: 'user-1' }));
        });
        expect(getPlatform().showLanding).toBe(true);
    });

    it('re-hydrates when the network comes back online', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        const fresh = { ...mockEmptyState(), rubrics: [{ id: 'r1', name: 'Reconnect', criteria: [] }] };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: fresh, error: null });

        renderProvider();
        await act(async () => {});

        vi.mocked(storageSync.isConnected).mockReturnValue(true);
        await act(async () => {
            reconnectHandlers.forEach((h) => h());
        });
        expect(storageSync.hydrate).toHaveBeenCalled();
        expect(storage.saveRubrics).toHaveBeenCalled();
    });

    it('ignores reconnect events while disconnected', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };

        renderProvider();
        await act(async () => {});

        vi.mocked(storageSync.isConnected).mockReturnValue(false);
        const hydrateCalls = vi.mocked(storageSync.hydrate).mock.calls.length;
        await act(async () => {
            reconnectHandlers.forEach((h) => h());
        });
        expect(vi.mocked(storageSync.hydrate).mock.calls.length).toBe(hydrateCalls);
    });

    it('applies realtime partial hydrates and falls back to a full hydrate for unknown tables', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };

        // Partial hydrate with data → targeted applyFresh.
        const partial = { students: [{ id: 's1', name: 'Realtime', classId: 'c1' }] };
        vi.mocked(storageSync.hydratePartial).mockResolvedValue({ data: partial, fullFallback: false });

        renderProvider();
        await act(async () => {});

        vi.mocked(storageSync.isConnected).mockReturnValue(true);
        await act(async () => {
            realtimeHandlers.forEach((h) => h(['students']));
        });
        expect(storageSync.hydratePartial).toHaveBeenCalledWith(new Set(['students']));
        expect(storage.saveStudents).toHaveBeenCalled();

        // Unknown table → full fallback hydrate.
        const full = { ...mockEmptyState(), classes: [{ id: 'c1', name: 'Full' }] };
        vi.mocked(storageSync.hydratePartial).mockResolvedValue({ data: null, fullFallback: true });
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: full, error: null });
        await act(async () => {
            realtimeHandlers.forEach((h) => h(['unknown_table']));
        });
        expect(storageSync.hydrate).toHaveBeenCalled();
        expect(storage.saveClasses).toHaveBeenCalled();
    });

    it('delta-syncs single changes with pushOne and bulk changes with pushMany', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.isConnected).mockReturnValue(true);

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

        // One dispatch per collection so every diff getId callback runs (the effect
        // diffs all ~27 collections on each state change, but the id-getter arrows only
        // execute for collections that actually changed).
        act(() => {
            platform!.dispatch({ type: 'ADD_RUBRIC', payload: { id: 'r1', name: 'R', criteria: [] } as never });
            platform!.dispatch({ type: 'ADD_CLASS', payload: { id: 'c1', name: 'C' } as never });
            platform!.dispatch({ type: 'ADD_STUDENT', payload: { id: 's1', name: 'S', classId: 'c1' } as never });
            platform!.dispatch({
                type: 'SAVE_STUDENT_RUBRIC',
                payload: {
                    id: 'sr1',
                    rubricId: 'r1',
                    studentId: 's1',
                    entries: [],
                    overallComment: '',
                    isPeerReview: false,
                } as never,
            });
            platform!.dispatch({
                type: 'SAVE_PEER_REVIEW',
                payload: {
                    id: 'pr1',
                    rubricId: 'r1',
                    studentId: 's2',
                    reviewerId: 's1',
                    entries: [],
                    overallComment: '',
                    isPeerReview: true,
                } as never,
            });
            platform!.dispatch({
                type: 'ADD_ATTACHMENT',
                payload: {
                    id: 'a1',
                    name: 'A',
                    mimeType: 'docx',
                    size: 1,
                    dataUrl: 'd',
                    addedAt: '2024-01-01',
                } as never,
            });
            platform!.dispatch({
                type: 'ADD_GRADE_SCALE',
                payload: { id: 'gs2', name: 'GS', type: 'points', ranges: [] } as never,
            });
            platform!.dispatch({ type: 'ADD_COMMENT_BANK_ITEM', payload: { id: 'cb1', text: 'T', tags: [] } as never });
            platform!.dispatch({
                type: 'ADD_EXPORT_TEMPLATE',
                payload: { id: 'et1', name: 'T', dataUrl: 'd', levelHeaders: [], size: 1 } as never,
            });
            platform!.dispatch({
                type: 'ADD_FAVORITE_STANDARD',
                payload: { guid: 'fs1', description: 'd', standardSetTitle: '', jurisdictionTitle: '' } as never,
            });
            platform!.dispatch({
                type: 'SAVE_SELF_ASSESSMENT',
                payload: {
                    id: 'sa1',
                    rubricId: 'r1',
                    studentId: 's1',
                    ratings: [],
                    submittedAt: '2024-01-01',
                } as never,
            });
            platform!.dispatch({
                type: 'SAVE_SPEAKING_SESSION',
                payload: {
                    id: 'ss1',
                    rubricId: 'r1',
                    studentId: 's1',
                    criteria: [],
                    overallComment: '',
                    gradedAt: '2024-01-01',
                } as never,
            });
            platform!.dispatch({
                type: 'SAVE_ANALYSIS_RESULT',
                payload: {
                    id: 'ar1',
                    studentId: 's1',
                    rubricId: 'r1',
                    attachmentId: 'a1',
                    extractedText: '',
                    analyzedAt: '2024-01-01',
                    detectedItems: [],
                    grammarErrors: [],
                    grammarCheckerUsed: 'none',
                } as never,
            });
            platform!.dispatch({
                type: 'ADD_TEST',
                payload: { id: 't1', name: 'T', questions: [], requireSEB: false, shuffleQuestions: false } as never,
            });
            platform!.dispatch({
                type: 'SAVE_STUDENT_TEST',
                payload: {
                    id: 'st1',
                    testId: 't1',
                    studentId: 's1',
                    answers: [],
                    status: 'submitted',
                    startedAt: '2024-01-01',
                } as never,
            });
            platform!.dispatch({
                type: 'ADD_ESSAY_ASSIGNMENTS',
                payload: [
                    {
                        teacherKey: 'tk1',
                        studentId: 's1',
                        title: 'E',
                        prompt: 'P',
                        assignedAt: '2024-01-01',
                        createdAt: '2024-01-01',
                        rubricId: 'r1',
                    },
                ] as never,
            });
            platform!.dispatch({
                type: 'ADD_ESSAY_SUBMISSION',
                payload: {
                    id: 'esub1',
                    assignmentRubricId: 'r1',
                    assignmentStudentId: 's1',
                    teacherKey: 'tk1',
                    contentHtml: '',
                    wordCount: 0,
                    submittedAt: '2024-01-01',
                } as never,
            });
            platform!.dispatch({
                type: 'SAVE_USER_TEMPLATE',
                payload: { id: 'ut1', name: 'T', subject: '', criteria: [], savedAt: '2024-01-01' } as never,
            });
            platform!.dispatch({ type: 'ADD_FLASHCARD_DECK', payload: { id: 'd1', name: 'D', cards: [] } as never });
            platform!.dispatch({
                type: 'ADD_FLASHCARD_ASSIGNMENTS',
                payload: [
                    { deckId: 'd1', studentId: 's1', deckName: 'D', cardCount: 0, createdAt: '2024-01-01' },
                ] as never,
            });
            platform!.dispatch({
                type: 'SAVE_FLASHCARD_REVIEW',
                payload: {
                    id: 'd1:s1',
                    deckId: 'd1',
                    studentId: 's1',
                    cardStates: {},
                    updatedAt: '2024-01-01',
                } as never,
            });
            platform!.dispatch({
                type: 'ADD_STANDARD_MASTERY_TARGET',
                payload: {
                    id: 'mt1',
                    standardGuid: 'g1',
                    standardDescription: 'd',
                    standardSetTitle: '',
                    year: 1,
                    masteryLevel: 80,
                } as never,
            });
            platform!.dispatch({
                type: 'ADD_NEWS_FLASH',
                payload: { id: 'nf1', title: 'N', summary: 'S', kind: 'article', tags: [] } as never,
            });
            platform!.dispatch({
                type: 'SAVE_NEWS_FLASH_READ',
                payload: { id: 'nf1:s1', flashId: 'nf1', studentId: 's1', readAt: '2024-01-01' } as never,
            });
            platform!.dispatch({
                type: 'ADD_QUESTION_BANK_ITEM',
                payload: { id: 'q1', tags: [], createdAt: '2024-01-01' } as never,
            });
            platform!.dispatch({
                type: 'ADD_DOCUMENT_COMMENT',
                payload: {
                    id: 'dc1',
                    attachmentId: 'a1',
                    authorId: 't1',
                    text: 'X',
                    createdAt: '2024-01-01',
                    resolved: false,
                    anchor: { from: 0, to: 1 },
                } as never,
            });
            platform!.dispatch({
                type: 'DISMISS_NOTIFICATION',
                payload: {
                    id: 'od:s1',
                    type: 'overdue_grading',
                    entityId: 's1',
                    fingerprint: 'f',
                    dismissedAt: '2024-01-01',
                } as never,
            });
            platform!.dispatch({
                type: 'ADD_GRADING_TASKS',
                payload: [
                    { id: 'gt1', rubricId: 'r1', studentId: 's1', assignedToTeacher: 't1', assignedAt: '2024-01-01' },
                ] as never,
            });
        });

        // Spot-check the single-upsert pushOne, the composite-key entities, and the
        // settings upsert (each pushes with the exact id the diff resolved).
        expect(storageSync.pushOne).toHaveBeenCalledWith(
            'rubric',
            'upsert',
            expect.objectContaining({ id: 'r1' }),
            'r1'
        );
        expect(storageSync.pushOne).toHaveBeenCalledWith(
            'essayBatchAssignment',
            'upsert',
            expect.objectContaining({ teacherKey: 'tk1' }),
            'tk1:s1'
        );
        expect(storageSync.pushOne).toHaveBeenCalledWith(
            'flashcardAssignment',
            'upsert',
            expect.objectContaining({ deckId: 'd1' }),
            'd1:s1'
        );
        expect(storageSync.pushOne).toHaveBeenCalledWith(
            'notificationDismissal',
            'upsert',
            expect.objectContaining({ id: 'od:s1' }),
            'od:s1'
        );

        // Bulk upsert (one dispatch touching two rows) → pushMany.
        act(() => {
            platform!.dispatch({
                type: 'ADD_QUESTION_BANK_ITEMS',
                payload: [
                    { id: 'q2', tags: [], createdAt: '2024-01-01' },
                    { id: 'q3', tags: [], createdAt: '2024-01-01' },
                ] as never,
            });
        });
        expect(storageSync.pushMany).toHaveBeenCalledWith('questionBankItem', 'upsert', expect.any(Array), [
            'q2',
            'q3',
        ]);

        // Bulk delete → pushMany delete.
        act(() => {
            platform!.dispatch({ type: 'DELETE_QUESTION_BANK_ITEMS', ids: ['q2', 'q3'] } as never);
        });
        expect(storageSync.pushMany).toHaveBeenCalledWith('questionBankItem', 'delete', [], ['q2', 'q3']);

        // Single delete → pushOne delete.
        act(() => {
            platform!.dispatch({ type: 'DELETE_RUBRIC', id: 'r1' } as never);
        });
        expect(storageSync.pushOne).toHaveBeenCalledWith('rubric', 'delete', null, 'r1');

        // Settings change → pushOne settings.
        act(() => {
            platform!.dispatch({ type: 'UPDATE_SETTINGS', payload: { theme: 'light' } } as never);
        });
        expect(storageSync.pushOne).toHaveBeenCalledWith(
            'settings',
            'upsert',
            expect.objectContaining({ theme: 'light' })
        );
    });

    it('short-circuits configureAndEnter when the session was already handled', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);

        renderProvider();
        await act(async () => {});
        const configureCalls = vi.mocked(storageSync.configure).mock.calls.length;

        // A second auth event after startup ran configureAndEnter hits the
        // sessionHandled guard and returns without re-configuring.
        await act(async () => {
            authHandlers.forEach((h) => h({ id: 'user-later' }));
        });
        expect(vi.mocked(storageSync.configure).mock.calls.length).toBe(configureCalls);
    });

    it('startup auth handler bails when the config disappears', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);

        renderProvider();
        await act(async () => {});
        const configureCalls = vi.mocked(storageSync.configure).mock.calls.length;

        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(null);
        await act(async () => {
            authHandlers.forEach((h) => h({ id: 'user-no-config' }));
        });
        expect(vi.mocked(storageSync.configure).mock.calls.length).toBe(configureCalls);
    });

    it('logs and returns to the landing page when OTP/session configure rejects', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.configure).mockRejectedValue(new Error('configure boom'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // No session on startup → landing shows; configure only runs once an auth
        // event arrives, where both the startup and OTP handlers catch the rejection.
        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(getPlatform().showLanding).toBe(true);

        await act(async () => {
            authHandlers.forEach((h) => h({ id: 'user-1' }));
        });
        expect(errorSpy).toHaveBeenCalled();
        expect(getPlatform().showLanding).toBe(true);
        errorSpy.mockRestore();
        vi.mocked(storageSync.configure).mockResolvedValue(true);
    });

    it('OTP flow completes with no fresh data to hydrate', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);

        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(getPlatform().showLanding).toBe(true);

        // hydrate returns null → the merge is skipped but the flow still enters the app.
        await act(async () => {
            authHandlers.forEach((h) => h({ id: 'user-1' }));
        });
        expect(getPlatform().showLanding).toBe(false);
    });

    it('surfaces a storage_full toast when the startup flush fails', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);
        const fresh = { ...mockEmptyState(), students: [{ id: 's1', name: 'Sync', classId: 'c1' }] };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: fresh, error: null });
        vi.mocked(storage.saveRubrics).mockImplementation(() => {
            throw new Error('quota exceeded');
        });
        try {
            const { getPlatform } = renderProvider();
            await waitFor(() => expect(getPlatform().showLanding).toBe(false), { timeout: 3000 });
            expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
        } finally {
            vi.mocked(storage.saveRubrics).mockImplementation(() => {});
        }
    });

    it('realtime full-fallback hydrate with no data applies nothing', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hydratePartial).mockResolvedValue({ data: null, fullFallback: true });
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: null, error: null });

        renderProvider();
        await act(async () => {});

        vi.mocked(storageSync.isConnected).mockReturnValue(true);
        await act(async () => {
            realtimeHandlers.forEach((h) => h(['unknown_table']));
        });
        expect(storageSync.hydrate).toHaveBeenCalled();
    });

    it('seeds the audit logger from the stress-tracking effect when a client is available', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        const fake = {
            from: vi.fn(() => ({ insert: vi.fn(() => ({ then: vi.fn(() => Promise.resolve({ error: null })) })) })),
        };
        vi.mocked(storageSync.adapter.getClient).mockReturnValue(fake as never);
        vi.mocked(storageSync.getCurrentUserId).mockReturnValue('u1');

        renderProvider();
        await act(async () => {});
        // initAuditLogger ran without throwing (it just stores the client/actor pair).
        expect(storageSync.adapter.getClient).toHaveBeenCalled();
        vi.mocked(storageSync.adapter.getClient).mockReturnValue(null);
        vi.mocked(storageSync.getCurrentUserId).mockReturnValue(null);
    });

    it('writes theme, accent, font, RTL, and dyslexia styles to the document root', async () => {
        const withUiSettings = {
            ...mockEmptyState(),
            settings: {
                ...mockEmptyState().settings,
                accentColor: undefined,
                uiFontFamily: 'Inter',
                language: 'ar',
                dyslexiaFriendlyMode: true,
            },
        } as unknown as StoreData;
        const { view } = renderProvider(withUiSettings);
        const root = document.documentElement;

        // Accent unset → the removeProperty branch runs.
        expect(root.style.getPropertyValue('--accent')).toBe('');

        // Font set → --font applied and the Google Fonts link injected.
        expect(root.style.getPropertyValue('--font')).toContain('Inter');
        expect(document.getElementById('app-gfont')).not.toBeNull();

        // RTL language → dir flipped.
        expect(root.dir).toBe('rtl');

        // Dyslexia mode → line-height/letter-spacing set.
        expect(root.style.getPropertyValue('--line-height')).toBe('1.8');

        // Toggle dyslexia off via the store.
        act(() => {
            view.rerender(
                <AppProvider>
                    <div data-testid="x" />
                </AppProvider>
            );
        });
        // A fresh provider re-applies the same settings, so just assert the effect ran.
        expect(root.style.getPropertyValue('--line-height')).toBe('1.8');
    });

    it('applies the dyslexia styles only while the setting is enabled', () => {
        const { view } = renderProvider();
        const root = document.documentElement;
        // Default settings have no dyslexiaFriendlyMode → styles removed.
        expect(root.style.getPropertyValue('--line-height')).toBe('');

        // Flip the setting through a second provider render with the flag set.
        view.unmount();
        renderProvider({ ...mockEmptyState(), settings: { ...mockEmptyState().settings, dyslexiaFriendlyMode: true } });
        expect(root.style.getPropertyValue('--line-height')).toBe('1.8');
    });
});

describe('AppContext edge paths', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockShowToast.mockClear();
        authHandlers.length = 0;
        reconnectHandlers.length = 0;
        realtimeHandlers.length = 0;
        localStorage.clear();
        document.getElementById('app-gfont')?.remove();
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.configure).mockResolvedValue(true);
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: null, error: null });
        vi.mocked(storageSync.hydratePartial).mockResolvedValue({ data: null, fullFallback: false });
        vi.mocked(storageSync.hasSession).mockReturnValue(false);
        vi.mocked(storageSync.initAuth).mockResolvedValue(undefined);
        vi.mocked(storageSync.isConnected).mockReturnValue(false);
        vi.mocked(storageSync.didWipeLocalData).mockReturnValue(false);
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(null);
    });

    it('reuses an existing Google Fonts link when one is already injected', () => {
        document.getElementById('app-gfont')?.remove();
        const existing = document.createElement('link');
        existing.id = 'app-gfont';
        document.head.appendChild(existing);
        const withFont = {
            ...mockEmptyState(),
            settings: { ...mockEmptyState().settings, uiFontFamily: 'Nunito' },
        } as unknown as StoreData;
        try {
            renderProvider(withFont);
            const link = document.getElementById('app-gfont') as HTMLLinkElement | null;
            expect(link).toBe(existing);
            expect(link?.href).toContain('Nunito');
        } finally {
            existing.remove();
        }
    });

    it('degrades gracefully when the stored font is not a bundled Google font', () => {
        // A stale/corrupt stored value that isn't in the Google-font allow-list still
        // applies the CSS variable, but skips the stylesheet injection.
        document.getElementById('app-gfont')?.remove();
        const withUnknownFont = {
            ...mockEmptyState(),
            settings: {
                ...mockEmptyState().settings,
                uiFontFamily: 'Comic Sans MS',
            },
        } as unknown as StoreData;
        renderProvider(withUnknownFont);
        const root = document.documentElement;
        expect(root.style.getPropertyValue('--font')).toContain('Comic Sans MS');
        expect(document.getElementById('app-gfont')).toBeNull();
    });

    it('stops the startup flow when unmounted before the db chunk resolves', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);

        const { view } = renderProvider();
        act(() => view.unmount());
        await act(async () => {});
        // configureAndEnter never ran because the .then saw cancelled.
        expect(storageSync.configure).not.toHaveBeenCalled();
    });

    it('stops after initAuth resolves when unmounted in the meantime', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);

        let resolveInitAuth!: () => void;
        vi.mocked(storageSync.initAuth).mockReturnValue(
            new Promise<void>((r) => {
                resolveInitAuth = r;
            })
        );

        const { view } = renderProvider();
        await act(async () => {}); // loadDb resolves, initAuth left pending
        act(() => view.unmount());
        await act(async () => {
            resolveInitAuth();
        });
        expect(storageSync.configure).not.toHaveBeenCalled();
    });

    it('stops after initAuth rejects when unmounted in the meantime', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hasSession).mockReturnValue(true);

        let rejectInitAuth!: (e: Error) => void;
        vi.mocked(storageSync.initAuth).mockReturnValue(
            new Promise<void>((_, rej) => {
                rejectInitAuth = rej;
            })
        );
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const { view } = renderProvider();
        await act(async () => {});
        act(() => view.unmount());
        await act(async () => {
            rejectInitAuth(new Error('auth boom'));
        });
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('ignores auth-change events that carry no user', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };

        renderProvider();
        await act(async () => {});
        const configureCalls = vi.mocked(storageSync.configure).mock.calls.length;

        await act(async () => {
            authHandlers.forEach((h) => h(null));
        });
        expect(vi.mocked(storageSync.configure).mock.calls.length).toBe(configureCalls);
    });

    it('does nothing when a reconnect hydrate returns no data', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.isConnected).mockReturnValue(true);
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: null, error: null });

        renderProvider();
        await act(async () => {});

        await act(async () => {
            reconnectHandlers.forEach((h) => h());
        });
        // No crash and no state applied.
        expect(getSaveCalls('saveRubrics')).toBe(0);
    });

    it('ignores realtime events while disconnected', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.isConnected).mockReturnValue(false);

        renderProvider();
        await act(async () => {});

        await act(async () => {
            realtimeHandlers.forEach((h) => h(['students']));
        });
        expect(storageSync.hydratePartial).not.toHaveBeenCalled();
    });

    it('skips applyFresh when a partial hydrate has neither data nor a fallback', async () => {
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.isConnected).mockReturnValue(true);
        vi.mocked(storageSync.hydratePartial).mockResolvedValue({ data: null, fullFallback: false });

        renderProvider();
        await act(async () => {});

        const hydrateCalls = vi.mocked(storageSync.hydrate).mock.calls.length;
        await act(async () => {
            realtimeHandlers.forEach((h) => h(['students']));
        });
        expect(vi.mocked(storageSync.hydrate).mock.calls.length).toBe(hydrateCalls);
    });

    it('warns when the OTP hydrate reports an error', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: null, error: 'otp boom' });

        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(getPlatform().showLanding).toBe(true);

        await act(async () => {
            authHandlers.forEach((h) => h({ id: 'user-1' }));
        });
        expect(mockShowToast.mock.calls.filter((c) => c[1] === 'warning')).toHaveLength(2);
    });

    it('merges OTP hydrates against the wiped local store', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.didWipeLocalData).mockReturnValue(true);
        const fresh = { ...mockEmptyState(), classes: [{ id: 'c1', name: 'C' }] };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: fresh, error: null });

        const { getPlatform } = renderProvider();
        await act(async () => {});
        const loadStoreCalls = vi.mocked(storage.loadStore).mock.calls.length;

        await act(async () => {
            authHandlers.forEach((h) => h({ id: 'user-1' }));
        });
        expect(getPlatform().showLanding).toBe(false);
        // The wiped baseline was re-read via loadStore() rather than reusing the initial state.
        expect(vi.mocked(storage.loadStore).mock.calls.length).toBeGreaterThan(loadStoreCalls);
    });

    it('notifies the user when a quota-exceeded write lands while offline', () => {
        const originalOnLine = navigator.onLine;
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        try {
            renderProvider();
            const handler = vi.mocked(storage.onStorageQuotaExceeded).mock.calls[0]?.[0];
            expect(handler).toBeDefined();
            act(() => handler!());
            expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
        } finally {
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine });
        }
    });

    it('stays silent when a quota-exceeded write lands while connected', async () => {
        const originalOnLine = navigator.onLine;
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        vi.mocked(storageSync.isConnected).mockReturnValue(true);
        try {
            renderProvider();
            const handler = vi.mocked(storage.onStorageQuotaExceeded).mock.calls[0]?.[0];
            act(() => handler!());
            expect(mockShowToast).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine });
        }
    });

    it('warns when flushing the OTP hydrate to localStorage fails', async () => {
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue(CONFIG);
        const { storageSync } = (await import('../services/database')) as unknown as {
            storageSync: {
                isConnected: Mock;
                getCurrentUserId: Mock;
                configure: Mock;
                setToastFn: Mock;
                hydrate: Mock;
                hydratePartial: Mock;
                hasSession: Mock;
                initAuth: Mock;
                didWipeLocalData: Mock;
                disconnect: Mock;
                pushAll: Mock;
                pushOne: Mock;
                pushMany: Mock;
                onAuthChange: Mock;
                onNetworkReconnect: Mock;
                onRealtimeChange: Mock;
                adapter: { getClient: Mock };
            };
        };
        const fresh = { ...mockEmptyState(), rubrics: [{ id: 'r1', name: 'R', criteria: [] }] };
        vi.mocked(storageSync.hydrate).mockResolvedValue({ data: fresh, error: null });
        vi.mocked(storage.saveRubrics).mockImplementation(() => {
            throw new Error('quota exceeded');
        });

        const { getPlatform } = renderProvider();
        await act(async () => {});
        expect(getPlatform().showLanding).toBe(true);

        await act(async () => {
            authHandlers.forEach((h) => h({ id: 'user-1' }));
        });
        expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
    });
});

function getSaveCalls(fn: 'saveRubrics'): number {
    return vi.mocked(storage[fn]).mock.calls.length;
}
