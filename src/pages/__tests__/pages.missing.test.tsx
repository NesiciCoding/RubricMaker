/**
 * Tests for pages that had 0% coverage: LandingPage, CefrOverviewPage, NotFoundPage.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Student, Rubric, StudentRubric } from '../../types';

// ─── Shared mock data ──────────────────────────────────────────────────────────

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
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

// ─── Hoisted mock refs ────────────────────────────────────────────────────────

const mockEnterLocalMode = vi.hoisted(() => vi.fn());

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
        enterLocalMode: mockEnterLocalMode,
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
    getTrackBadgeColor: vi.fn(() => '#000'),
    getEffectiveVoTrack: vi.fn((s, c) => s?.voTrack ?? c?.voTrack),
}));

vi.mock('../../utils/cefrStudentAggregator', () => ({
    getCefrStudentOverview: vi.fn(() => ({
        cells: [],
        standardSets: [],
        skillsWithRubricData: 0,
        overallConfidenceRate: 0,
        standardsCovered: 0,
        practiceCefrProgress: [],
    })),
    highestLevelForSkill: vi.fn(() => null),
    overallLevel: vi.fn(() => null),
    aggregateCefrProgress: vi.fn(() => []),
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

// ─── LandingPage ──────────────────────────────────────────────────────────────

describe('LandingPage', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders without crash', async () => {
        const { default: LandingPage } = await import('../LandingPage');
        const { container } = renderPage(<LandingPage />);
        expect(container.firstChild).toBeTruthy();
    });

    it('shows the RubricMaker title', async () => {
        const { default: LandingPage } = await import('../LandingPage');
        renderPage(<LandingPage />);
        expect(screen.getByText('RubricMaker')).toBeInTheDocument();
    });

    it('shows the Teacher Login card', async () => {
        const { default: LandingPage } = await import('../LandingPage');
        renderPage(<LandingPage />);
        expect(screen.getByText('Teacher Login')).toBeInTheDocument();
    });

    it('shows the Try-out / Offline card', async () => {
        const { default: LandingPage } = await import('../LandingPage');
        renderPage(<LandingPage />);
        expect(screen.getByText('Try-out / Offline')).toBeInTheDocument();
    });

    it('shows the Student Login card', async () => {
        const { default: LandingPage } = await import('../LandingPage');
        renderPage(<LandingPage />);
        expect(screen.getByText('Student Login')).toBeInTheDocument();
    });

    it('clicking "Continue without account" calls enterLocalMode', async () => {
        const { default: LandingPage } = await import('../LandingPage');
        renderPage(<LandingPage />);
        fireEvent.click(screen.getByRole('button', { name: /continue without account/i }));
        expect(mockEnterLocalMode).toHaveBeenCalled();
    });

    it('toggles the Self-hosted / advanced section', async () => {
        const { default: LandingPage } = await import('../LandingPage');
        renderPage(<LandingPage />);
        const toggleBtn = screen.getAllByText(/self-hosted/i)[0].closest('button') as HTMLButtonElement;
        fireEvent.click(toggleBtn);
        expect(screen.getByPlaceholderText(/your-project\.supabase\.co/i)).toBeInTheDocument();
        fireEvent.click(toggleBtn);
        expect(screen.queryByPlaceholderText(/your-project\.supabase\.co/i)).not.toBeInTheDocument();
    });

    it('shows an error when configure is clicked with whitespace-only fields', async () => {
        const { default: LandingPage } = await import('../LandingPage');
        renderPage(<LandingPage />);
        const toggleBtn = screen.getAllByText(/self-hosted/i)[0].closest('button') as HTMLButtonElement;
        fireEvent.click(toggleBtn);
        // Enter whitespace so the button is enabled (non-empty string) but trim() fails validation
        const urlInput = screen.getByPlaceholderText(/your-project\.supabase\.co/i);
        const keyInput = screen.getByPlaceholderText(/anon key/i);
        fireEvent.change(urlInput, { target: { value: '   ' } });
        fireEvent.change(keyInput, { target: { value: '   ' } });
        const connectBtn = screen.getByRole('button', { name: /use this supabase instance/i });
        fireEvent.click(connectBtn);
        expect(screen.getByText(/both fields are required/i)).toBeInTheDocument();
    });
});

// ─── CefrOverviewPage ─────────────────────────────────────────────────────────

describe('CefrOverviewPage', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders without crash', async () => {
        const { default: CefrOverviewPage } = await import('../CefrOverviewPage');
        const { container } = renderPage(<CefrOverviewPage />);
        expect(container.firstChild).toBeTruthy();
    });

    it('renders the page title key', async () => {
        const { default: CefrOverviewPage } = await import('../CefrOverviewPage');
        renderPage(<CefrOverviewPage />);
        expect(screen.getByText('cefrOverview.page_title')).toBeInTheDocument();
    });

    it('renders class filter dropdown', async () => {
        const { default: CefrOverviewPage } = await import('../CefrOverviewPage');
        renderPage(<CefrOverviewPage />);
        expect(screen.getByText('statistics.label_class_filter')).toBeInTheDocument();
    });

    it('renders student dropdown', async () => {
        const { default: CefrOverviewPage } = await import('../CefrOverviewPage');
        renderPage(<CefrOverviewPage />);
        fireEvent.click(screen.getByText('cefr.view_student'));
        expect(screen.getByText('statistics.label_student')).toBeInTheDocument();
    });

    it('shows the class name in the class filter when classes exist', async () => {
        const { default: CefrOverviewPage } = await import('../CefrOverviewPage');
        renderPage(<CefrOverviewPage />);
        // The class-view heatmap also shows each student's class name, so this can appear more than once.
        expect(screen.getAllByText('Class A').length).toBeGreaterThan(0);
    });

    it('shows the student name in the student dropdown when a student exists', async () => {
        const { default: CefrOverviewPage } = await import('../CefrOverviewPage');
        renderPage(<CefrOverviewPage />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('shows a prompt to select a student when none is selected', async () => {
        const { default: CefrOverviewPage } = await import('../CefrOverviewPage');
        renderPage(<CefrOverviewPage />);
        fireEvent.click(screen.getByText('cefr.view_student'));
        expect(screen.getByText('cefrOverview.select_student_prompt')).toBeInTheDocument();
    });

    it('selecting a student reveals the student header', async () => {
        const { default: CefrOverviewPage } = await import('../CefrOverviewPage');
        renderPage(<CefrOverviewPage />);
        fireEvent.click(screen.getByText('cefr.view_student'));
        const studentSelect = screen.getByDisplayValue('statistics.select_student_placeholder') as HTMLSelectElement;
        fireEvent.change(studentSelect, { target: { value: 's1' } });
        expect(screen.getByText('cefrOverview.stat_skills_assessed')).toBeInTheDocument();
    });

    it('changing the class filter resets the student selection', async () => {
        const { default: CefrOverviewPage } = await import('../CefrOverviewPage');
        renderPage(<CefrOverviewPage />);
        fireEvent.click(screen.getByText('cefr.view_student'));
        const studentSelect = screen.getByDisplayValue('statistics.select_student_placeholder') as HTMLSelectElement;
        fireEvent.change(studentSelect, { target: { value: 's1' } });
        const classSelect = screen.getByDisplayValue('statistics.all_classes') as HTMLSelectElement;
        fireEvent.change(classSelect, { target: { value: 'c1' } });
        // Student select should reset to placeholder
        expect(screen.getByDisplayValue('statistics.select_student_placeholder')).toBeInTheDocument();
    });
});

// ─── NotFoundPage ─────────────────────────────────────────────────────────────

describe('NotFoundPage', () => {
    it('renders without crash', async () => {
        const { default: NotFoundPage } = await import('../NotFoundPage');
        const { container } = renderPage(<NotFoundPage />);
        expect(container.firstChild).toBeTruthy();
    });

    it('shows a 404 heading', async () => {
        const { default: NotFoundPage } = await import('../NotFoundPage');
        renderPage(<NotFoundPage />);
        expect(screen.getByText(/404/)).toBeInTheDocument();
    });

    it('shows a link to the dashboard', async () => {
        const { default: NotFoundPage } = await import('../NotFoundPage');
        renderPage(<NotFoundPage />);
        expect(screen.getByRole('link', { name: /go to dashboard/i })).toBeInTheDocument();
    });

    it('renders the page title in the topbar', async () => {
        const { default: NotFoundPage } = await import('../NotFoundPage');
        renderPage(<NotFoundPage />);
        expect(screen.getByText('Page not found')).toBeInTheDocument();
    });
});
