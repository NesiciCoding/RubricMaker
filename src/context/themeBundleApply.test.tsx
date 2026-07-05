import React, { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppProvider, useApp } from './AppContext';
import { THEME_BUNDLES } from '../data/themes';
import * as storage from '../store/storage';
import type { AppSettings } from '../types';

// Mock storage so we don't write to localStorage/IndexedDB during tests.
vi.mock('../store/storage', () => ({
    loadStore: vi.fn(() => ({
        rubrics: [],
        students: [],
        classes: [],
        studentRubrics: [],
        attachments: [],
        gradeScales: [{ id: 'default-scale', name: 'Default', type: 'letter', ranges: [] }],
        commentSnippets: [],
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
    },
}));

vi.mock('../services/microsoftGraph_deleted_placeholder', () => ({
    graphService: {
        getUserProfile: vi.fn().mockResolvedValue({ displayName: 'Test User' }),
        uploadFile: vi.fn().mockResolvedValue({}),
        downloadFile: vi.fn().mockResolvedValue(null),
    },
}));

/** Mirrors SettingsPage's applyTheme(): a single updateSettings call that
 * spreads defaultFormat and overlays the bundle's font/header/accent. */
function applyTheme(
    updateSettings: (s: Partial<AppSettings>) => void,
    settings: AppSettings,
    theme: (typeof THEME_BUNDLES)[number]
) {
    updateSettings({
        accentColor: theme.accentColor,
        uiFontFamily: theme.uiFontFamily,
        colorPreset: theme.id,
        defaultFormat: {
            ...settings.defaultFormat,
            fontFamily: theme.exportFontFamily,
            headerColor: theme.exportHeaderColor,
        },
    });
}

describe('Theme bundle application', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

    it.each(THEME_BUNDLES)('applying the "$id" bundle updates settings to match the bundle', (theme) => {
        const { result } = renderHook(() => useApp(), { wrapper });

        act(() => {
            applyTheme(result.current.updateSettings, result.current.settings, theme);
        });

        expect(result.current.settings.accentColor).toBe(theme.accentColor);
        expect(result.current.settings.uiFontFamily).toBe(theme.uiFontFamily);
        expect(result.current.settings.colorPreset).toBe(theme.id);
        expect(result.current.settings.defaultFormat.fontFamily).toBe(theme.exportFontFamily);
        expect(result.current.settings.defaultFormat.headerColor).toBe(theme.exportHeaderColor);
        expect(storage.saveSettings).toHaveBeenCalled();
    });

    it('preserves all other defaultFormat fields when applying a theme (spread regression)', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        const before = result.current.settings.defaultFormat;
        const theme = THEME_BUNDLES[0];

        act(() => {
            applyTheme(result.current.updateSettings, result.current.settings, theme);
        });

        const after = result.current.settings.defaultFormat;
        expect(after.criterionColWidth).toBe(before.criterionColWidth);
        expect(after.levelColWidth).toBe(before.levelColWidth);
        expect(after.fontSize).toBe(before.fontSize);
        expect(after.headerTextColor).toBe(before.headerTextColor);
        expect(after.accentColor).toBe(before.accentColor);
        expect(after.showWeights).toBe(before.showWeights);
        expect(after.showPoints).toBe(before.showPoints);
        expect(after.showCalculatedGrade).toBe(before.showCalculatedGrade);
        expect(after.levelOrder).toBe(before.levelOrder);
        expect(after.headerTextAlign).toBe(before.headerTextAlign);
        expect(after.showBorders).toBe(before.showBorders);
        expect(after.rowStriping).toBe(before.rowStriping);
        expect(after.orientation).toBe(before.orientation);

        // Only fontFamily and headerColor should have changed.
        expect(after.fontFamily).toBe(theme.exportFontFamily);
        expect(after.headerColor).toBe(theme.exportHeaderColor);
    });

    it('switching between two bundles updates settings to the latest bundle', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        const [first, second] = THEME_BUNDLES;

        act(() => {
            applyTheme(result.current.updateSettings, result.current.settings, first);
        });
        expect(result.current.settings.colorPreset).toBe(first.id);

        act(() => {
            applyTheme(result.current.updateSettings, result.current.settings, second);
        });

        expect(result.current.settings.colorPreset).toBe(second.id);
        expect(result.current.settings.accentColor).toBe(second.accentColor);
        expect(result.current.settings.uiFontFamily).toBe(second.uiFontFamily);
        expect(result.current.settings.defaultFormat.fontFamily).toBe(second.exportFontFamily);
        expect(result.current.settings.defaultFormat.headerColor).toBe(second.exportHeaderColor);
    });
});
