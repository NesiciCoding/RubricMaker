import React, { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppProvider, useSettings } from './AppContext';
import * as storage from '../store/storage';
import i18n, { i18nReady } from '../i18n';

vi.mock('../store/storage', () => ({
    loadCachedStudentRubrics: vi.fn(async () => []),
    isMigrationDone: vi.fn(() => false),
    markMigrationDone: vi.fn(),
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
    onVoiceFeedbackDropped: vi.fn(),
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

describe('Dyslexia-friendly reading mode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.documentElement.style.removeProperty('--line-height');
        document.documentElement.style.removeProperty('--letter-spacing');
    });

    const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

    it('sets line-height/letter-spacing CSS vars and persists the setting when enabled', () => {
        const { result } = renderHook(() => useSettings(), { wrapper });

        act(() => {
            result.current.updateSettings({ dyslexiaFriendlyMode: true });
        });

        expect(result.current.settings.dyslexiaFriendlyMode).toBe(true);
        expect(storage.saveSettings).toHaveBeenCalled();
        expect(document.documentElement.style.getPropertyValue('--line-height')).toBe('1.8');
        expect(document.documentElement.style.getPropertyValue('--letter-spacing')).toBe('0.04em');
    });

    it('removes the CSS vars when disabled again', () => {
        const { result } = renderHook(() => useSettings(), { wrapper });

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
        const { result } = renderHook(() => useSettings(), { wrapper });

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

// #615: the language used to be applied only while the Settings page was open, so students (who have
// no Settings page) always got the browser's language, and opening Settings forced the default 'en'.
describe('Interface language', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

    beforeEach(async () => {
        await i18nReady;
        await i18n.changeLanguage('nl');
    });

    it('keeps the browser language while settings only hold the default English', () => {
        renderHook(() => useSettings(), { wrapper });
        expect(i18n.language).toBe('nl');
        expect(document.documentElement.lang).toBe('nl');
    });

    it('applies a chosen language on every route, and follows a later change', async () => {
        const { result } = renderHook(() => useSettings(), { wrapper });

        await act(async () => {
            result.current.updateSettings({ language: 'fr', languageChosen: true });
        });
        expect(i18n.language).toBe('fr');
        expect(document.documentElement.lang).toBe('fr');

        await act(async () => {
            result.current.updateSettings({ language: 'en', languageChosen: true });
        });
        expect(i18n.language).toBe('en');
        expect(document.documentElement.lang).toBe('en');
    });

    it('replaces an unshipped browser language with a chosen English, so dates and numbers follow it', async () => {
        await i18n.changeLanguage('pt-BR');
        const { result } = renderHook(() => useSettings(), { wrapper });
        await act(async () => {
            result.current.updateSettings({ language: 'en', languageChosen: true });
        });
        expect(i18n.language).toBe('en');
    });

    it('keeps a regional variant of the chosen language', async () => {
        await i18n.changeLanguage('nl-BE');
        const { result } = renderHook(() => useSettings(), { wrapper });
        await act(async () => {
            result.current.updateSettings({ language: 'nl', languageChosen: true });
        });
        expect(i18n.language).toBe('nl-BE');
    });

    it('does not re-apply a stale chosen language once reset to Automatic (#955)', async () => {
        const { result } = renderHook(() => useSettings(), { wrapper });
        await act(async () => {
            result.current.updateSettings({ language: 'fr', languageChosen: true });
        });
        expect(i18n.language).toBe('fr');

        // settings.language is still the stale 'fr' once reset to Automatic (LanguageSelect itself
        // re-detects the browser language; this effect's job is simply to stop forcing 'fr').
        const changeLanguageSpy = vi.spyOn(i18n, 'changeLanguage');
        await act(async () => {
            result.current.updateSettings({ languageChosen: false });
        });
        expect(changeLanguageSpy).not.toHaveBeenCalled();
        changeLanguageSpy.mockRestore();
    });
});
