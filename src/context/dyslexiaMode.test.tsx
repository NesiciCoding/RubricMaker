import React, { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppProvider, useApp } from './AppContext';
import * as storage from '../store/storage';

vi.mock('../store/storage', () => ({
    loadStore: vi.fn(() => ({
        rubrics: [],
        students: [],
        classes: [],
        studentRubrics: [],
        attachments: [],
        gradeScales: [{ id: 'default-scale', name: 'Default', type: 'letter', ranges: [] }],
        settings: {
            defaultGradeScaleId: 'default-scale',
            theme: 'light',
            language: 'en',
            accentColor: '#3b82f6',
            defaultFormat: {
                criterionColWidth: 200,
                levelColWidth: 160,
                fontSize: 14,
                headerColor: '#1e3a5f',
                headerTextColor: '#ffffff',
                accentColor: '#3b82f6',
                fontFamily: 'Inter, system-ui, sans-serif',
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
    })),
    saveRubrics: vi.fn(),
    saveStudents: vi.fn(),
    saveClasses: vi.fn(),
    saveStudentRubrics: vi.fn(),
    saveAttachments: vi.fn(),
    saveGradeScales: vi.fn(),
    saveCommentSnippets: vi.fn(),
    saveSettings: vi.fn(),
    saveFavoriteStandards: vi.fn(),
    saveCommentBank: vi.fn(),
    saveExportTemplates: vi.fn(),
    savePeerReviews: vi.fn(),
    onStorageQuotaExceeded: vi.fn(),
    exportStore: vi.fn((state) => state),
    importFullBackup: vi.fn(() => true),
}));

// AppContext's DB-reconnect/OTP effects always dynamically import this module — mocked so
// tests don't pull in real @supabase/supabase-js and leave dangling imports past teardown.
vi.mock('../services/database', () => ({
    storageSync: {
        isConnected: () => false,
        getCurrentUserId: () => null,
        adapter: { getClient: () => null },
        onNetworkReconnect: () => () => {},
        onAuthChange: () => () => {},
        configure: () => Promise.resolve(false),
        setToastFn: () => {},
        hydrate: () => Promise.resolve({ data: null, error: null }),
        didWipeLocalData: () => false,
    },
}));

vi.mock('../services/microsoftGraph_deleted_placeholder', () => ({
    graphService: {
        getUserProfile: vi.fn().mockResolvedValue({ displayName: 'Test User' }),
        uploadFile: vi.fn().mockResolvedValue({}),
        downloadFile: vi.fn().mockResolvedValue(null),
    },
}));

describe('Dyslexia-friendly reading mode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.documentElement.style.removeProperty('--line-height');
        document.documentElement.style.removeProperty('--letter-spacing');
    });

    const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

    it('sets line-height/letter-spacing CSS vars and persists the setting when enabled', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        act(() => {
            result.current.updateSettings({ dyslexiaFriendlyMode: true });
        });

        expect(result.current.settings.dyslexiaFriendlyMode).toBe(true);
        expect(storage.saveSettings).toHaveBeenCalled();
        expect(document.documentElement.style.getPropertyValue('--line-height')).toBe('1.8');
        expect(document.documentElement.style.getPropertyValue('--letter-spacing')).toBe('0.04em');
    });

    it('removes the CSS vars when disabled again', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        act(() => {
            result.current.updateSettings({ dyslexiaFriendlyMode: true });
        });
        act(() => {
            result.current.updateSettings({ dyslexiaFriendlyMode: false });
        });

        expect(document.documentElement.style.getPropertyValue('--line-height')).toBe('');
        expect(document.documentElement.style.getPropertyValue('--letter-spacing')).toBe('');
    });

    it('sets dir="rtl" when the active language is Arabic, and "ltr" otherwise', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        expect(document.documentElement.dir).toBe('ltr');

        act(() => {
            result.current.updateSettings({ language: 'ar' });
        });
        expect(document.documentElement.dir).toBe('rtl');

        act(() => {
            result.current.updateSettings({ language: 'en' });
        });
        expect(document.documentElement.dir).toBe('ltr');
    });
});
