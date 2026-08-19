import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppProvider, usePlatform } from './AppContext';
import * as storage from '../store/storage';
import { DEFAULT_FORMAT } from '../types';

vi.mock('../hooks/useToast', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}));

// loadDb rejects, so every AppProvider effect that awaits it lands in its .catch guard.
vi.mock('../services/database/lazyDb', () => ({
    loadDb: vi.fn(() => Promise.reject(new Error('db chunk failed to load'))),
    getDb: vi.fn(() => null),
}));

const mockEmptyState = vi.hoisted(() => () => ({
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
            levelOrder: 'best-first',
        },
    },
    favoriteStandards: [],
    commentBank: [],
    exportTemplates: [],
    peerReviews: [],
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

vi.mock('../services/database/supabaseConfig', () => ({
    loadSupabaseConfig: vi.fn(() => null),
    saveSupabaseConfig: vi.fn(),
    clearSupabaseConfig: vi.fn(),
}));

describe('AppProvider when the database chunk fails to load', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('shows the landing page and logs the startup failure', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        // With a config present, the startup effect also reaches loadDb (which rejects).
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue({
            supabaseUrl: 'https://example.supabase.co',
            supabaseAnonKey: 'key',
        });

        let platform: ReturnType<typeof usePlatform> | null = null;
        function Probe() {
            platform = usePlatform();
            return <div data-testid="landing">{platform.showLanding ? 'show' : 'hide'}</div>;
        }
        render(
            <AppProvider>
                <Probe />
            </AppProvider>
        );
        await waitFor(() => expect(platform!.showLanding).toBe(true), { timeout: 3000 });

        // The startup, reconnect, and OTP effects each catch the loadDb rejection.
        expect(errorSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
        errorSpy.mockRestore();
    });

    it('skips its error handlers when the provider unmounts before loadDb settles', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const supabaseConfig = await import('../services/database/supabaseConfig');
        vi.mocked(supabaseConfig.loadSupabaseConfig).mockReturnValue({
            supabaseUrl: 'https://example.supabase.co',
            supabaseAnonKey: 'key',
        });

        let platform: ReturnType<typeof usePlatform> | null = null;
        function Probe() {
            platform = usePlatform();
            return <div data-testid="landing">{platform.showLanding ? 'show' : 'hide'}</div>;
        }
        const view = render(
            <AppProvider>
                <Probe />
            </AppProvider>
        );
        // Unmount synchronously — before the rejection callbacks run — so every
        // effect's `.catch` guard sees cancelled and stays silent.
        act(() => view.unmount());
        await act(async () => {});

        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
