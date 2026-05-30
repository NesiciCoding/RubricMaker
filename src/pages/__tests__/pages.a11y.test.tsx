/**
 * Accessibility audits for key pages using axe-core (via jest-axe).
 *
 * These tests catch structural a11y issues (missing labels, bad ARIA roles,
 * broken heading hierarchy) that manual review and unit tests miss.
 * Colour-contrast is skipped because jsdom has no rendering engine.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { axe } from 'jest-axe';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Student, Rubric, StudentRubric } from '../../types';

// ─── Shared mock data ──────────────────────────────────────────────────────────

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'light',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockRubric: Rubric = {
    id: 'r1',
    name: 'Test Rubric',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        rubrics: [mockRubric],
        students: [mockStudent],
        classes: [mockClass],
        studentRubrics: [] as StudentRubric[],
        selfAssessments: [],
        settings: mockSettings,
        updateSettings: vi.fn(),
        enterLocalMode: vi.fn(),
        connectForOAuth: vi.fn(() => Promise.resolve(true)),
        showMigrationPrompt: false,
        dismissMigrationPrompt: vi.fn(),
        getActiveGradeScale: vi.fn(),
    }),
}));

vi.mock('../../services/database', () => ({
    loadSupabaseConfig: vi.fn(() => null),
    storageSync: {
        adapter: {
            fetchAuthProviders: vi.fn(() => Promise.resolve(null)),
            signInWithEmail: vi.fn(() => Promise.resolve({ error: null })),
            verifyOtp: vi.fn(() => Promise.resolve({ error: null })),
        },
        subscribe: vi.fn(() => vi.fn()),
        onAuthChange: vi.fn(() => vi.fn()),
        isConnected: vi.fn(() => false),
        getStatus: vi.fn(() => 'idle'),
        getLastSyncAt: vi.fn(() => null),
        getCurrentUserId: vi.fn(() => null),
        signInWithGoogle: vi.fn(() => Promise.resolve({})),
        signInWithMicrosoftPersonal: vi.fn(() => Promise.resolve({})),
        signInWithAzureAD: vi.fn(() => Promise.resolve({})),
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

vi.mock('../../data/cefrDescriptors', () => ({
    CEFR_LEVELS: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    CEFR_SKILLS: ['reading', 'writing', 'listening', 'speaking_production', 'speaking_interaction'],
    CEFR_SKILL_LABELS: {
        reading: { en: 'Reading', nl: 'Lezen' },
        writing: { en: 'Writing', nl: 'Schrijven' },
        listening: { en: 'Listening', nl: 'Luisteren' },
        speaking_production: { en: 'Speaking', nl: 'Spreken' },
        speaking_interaction: { en: 'Interaction', nl: 'Interactie' },
    },
    CEFR_LEVEL_COLORS: { A1: '#22c55e', A2: '#16a34a', B1: '#3b82f6', B2: '#2563eb', C1: '#f59e0b', C2: '#d97706' },
    CEFR_DESCRIPTORS: [],
    getCefrDescriptors: vi.fn(() => []),
}));

vi.mock('../../data/voTracks', () => ({
    VO_TRACKS: [],
    VO_TRACK_LABELS: {},
    VO_TRACK_COLORS: {},
    VO_TRACK_DEFAULT_CEFR: {},
}));

vi.mock('../../utils/cefrStudentAggregator', () => ({
    getCefrStudentOverview: vi.fn(() => ({
        cells: [],
        standardSets: [],
        skillsWithRubricData: 0,
        overallConfidenceRate: 0,
        standardsCovered: 0,
    })),
}));

// ─── Helper ────────────────────────────────────────────────────────────────────

function renderPage(element: React.ReactElement, route = '/', path = '/') {
    return render(
        <MemoryRouter initialEntries={[route]}>
            <Routes>
                <Route path={path} element={element} />
            </Routes>
        </MemoryRouter>
    );
}

// axe with rules that require a real rendering engine or full app shell disabled.
//
// color-contrast: jsdom has no rendering engine — computed styles are not available.
// region: fires when page components are rendered in isolation without the app layout
//         shell (sidebar + topbar) that provides the surrounding <main> landmark.
//         This is a test-isolation artifact, not a real violation in the deployed app.
const axeOptions = {
    rules: {
        'color-contrast': { enabled: false },
        region: { enabled: false },
    },
};

// ─── LandingPage ──────────────────────────────────────────────────────────────

describe('LandingPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: LandingPage } = await import('../LandingPage');
        renderPage(<LandingPage />);
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── NotFoundPage ─────────────────────────────────────────────────────────────

describe('NotFoundPage — a11y', () => {
    it('has no axe violations', async () => {
        const { default: NotFoundPage } = await import('../NotFoundPage');
        renderPage(<NotFoundPage />);
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── CefrOverviewPage ─────────────────────────────────────────────────────────

describe('CefrOverviewPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations on initial render (no student selected)', async () => {
        const { default: CefrOverviewPage } = await import('../CefrOverviewPage');
        renderPage(<CefrOverviewPage />);
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});
