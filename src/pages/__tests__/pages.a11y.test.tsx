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
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom';
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
        speakingSessions: [],
        gradeScales: [{ id: 'gs1', name: 'Default', ranges: [] }],
        settings: mockSettings,
        updateSettings: vi.fn(),
        enterLocalMode: vi.fn(),
        connectForOAuth: vi.fn(() => Promise.resolve(true)),
        showMigrationPrompt: false,
        dismissMigrationPrompt: vi.fn(),
        getActiveGradeScale: vi.fn(),
        // Phase 3/4 collections
        tests: [],
        studentTests: [],
        flashcardDecks: [],
        flashcardAssignments: [],
        flashcardReviews: [],
        essayAssignments: [],
        peerReviews: [],
        analysisResults: [],
        attachments: [],
        essayTemplates: [],
        // Phase 3/4 actions
        updateClass: vi.fn(),
        addEssayAssignments: vi.fn(),
        // RubricBuilder actions
        addRubric: vi.fn(),
        updateRubric: vi.fn(),
        syncRubricSnapshot: vi.fn(),
        fetchRubricVersions: vi.fn(() => Promise.resolve([])),
        saveRubricVersion: vi.fn(),
        restoreRubricVersion: vi.fn(),
        addVocabularyItem: vi.fn(),
        updateVocabularyItem: vi.fn(),
        deleteVocabularyItem: vi.fn(),
        deleteVocabularyItems: vi.fn(),
        // GradeStudent actions
        saveStudentRubric: vi.fn(),
        saveAnalysisResult: vi.fn(),
        addCommentBankItem: vi.fn(),
        addAttachment: vi.fn(),
        saveEssayAssignment: vi.fn(),
        saveEssayTemplate: vi.fn(),
        fetchEssaySubmissionsForStudent: vi.fn(() => Promise.resolve([])),
        deleteEssaySubmission: vi.fn(),
        getEssaySignedUrl: vi.fn(() => Promise.resolve(null)),
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
    const router = createMemoryRouter([{ path, element }], { initialEntries: [route] });
    return render(<RouterProvider router={router} />);
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

// ─── Sidebar ──────────────────────────────────────────────────────────────────

describe('Sidebar — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: Sidebar } = await import('../../components/Layout/Sidebar');
        render(
            <MemoryRouter>
                <Sidebar />
            </MemoryRouter>
        );
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });

    it('renders a <nav> inside an <aside>', async () => {
        const { default: Sidebar } = await import('../../components/Layout/Sidebar');
        render(
            <MemoryRouter>
                <Sidebar />
            </MemoryRouter>
        );
        expect(document.querySelector('aside')).not.toBeNull();
        expect(document.querySelector('aside nav')).not.toBeNull();
    });

    it('aside has an aria-label', async () => {
        const { default: Sidebar } = await import('../../components/Layout/Sidebar');
        render(
            <MemoryRouter>
                <Sidebar />
            </MemoryRouter>
        );
        const aside = document.querySelector('aside');
        expect(aside?.getAttribute('aria-label')).toBeTruthy();
    });
});

// ─── NotificationBell ─────────────────────────────────────────────────────────

vi.mock('../../hooks/useOverdueStudents', () => ({
    useOverdueStudents: () => ({ overdueStudents: [], threshold: 30 }),
}));

describe('NotificationBell — a11y', () => {
    it('has no axe violations (closed state)', async () => {
        const { default: NotificationBell } = await import('../../components/Layout/NotificationBell');
        render(
            <MemoryRouter>
                <NotificationBell />
            </MemoryRouter>
        );
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });

    it('toggle button has aria-expanded=false when closed', async () => {
        const { default: NotificationBell } = await import('../../components/Layout/NotificationBell');
        render(
            <MemoryRouter>
                <NotificationBell />
            </MemoryRouter>
        );
        const btn = document.querySelector('button[aria-expanded]');
        expect(btn?.getAttribute('aria-expanded')).toBe('false');
    });
});

// ─── EssayAssignmentModal ─────────────────────────────────────────────────────

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: false, userId: null }),
}));

describe('EssayAssignmentModal — a11y', () => {
    it('has no axe violations', async () => {
        const { default: EssayAssignmentModal } = await import('../../components/Essay/EssayAssignmentModal');
        render(
            <EssayAssignmentModal
                rubricId="r1"
                rubricName="Test Rubric"
                studentId="s1"
                studentName="Alice"
                onClose={vi.fn()}
                onOpenSlipSheet={vi.fn()}
                classStudents={[{ id: 's1', name: 'Alice' }]}
            />
        );
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });

    it('all text inputs have associated labels', async () => {
        const { default: EssayAssignmentModal } = await import('../../components/Essay/EssayAssignmentModal');
        render(
            <EssayAssignmentModal
                rubricId="r1"
                rubricName="Test Rubric"
                studentId="s1"
                studentName="Alice"
                onClose={vi.fn()}
                onOpenSlipSheet={vi.fn()}
                classStudents={[{ id: 's1', name: 'Alice' }]}
            />
        );
        const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input:not([type=checkbox])'));
        inputs.forEach((input) => {
            const label = document.querySelector(`label[for="${input.id}"]`);
            expect(input.id, `input is missing an id or label: ${input.placeholder}`).toBeTruthy();
            expect(label, `label missing for input#${input.id}`).not.toBeNull();
        });
    });
});

// ─── StudentProfilePage ───────────────────────────────────────────────────────

vi.mock('../../utils/learningGoalsAggregator', () => ({
    getStudentGoalScores: vi.fn(() => []),
}));

vi.mock('../../components/Statistics/LearningGoalChart', () => ({
    default: () => null,
}));

vi.mock('../../components/Statistics/CefrProgressChart', () => ({
    default: () => null,
}));

vi.mock('../../components/CEFR/CefrBadge', () => ({
    default: () => null,
}));

describe('StudentProfilePage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('tab navigation uses role=tablist and role=tab with aria-selected', async () => {
        const { default: StudentProfilePage } = await import('../StudentProfilePage');
        renderPage(<StudentProfilePage />, '/students/s1', '/students/:id');
        const tablist = document.querySelector('[role="tablist"]');
        expect(tablist).not.toBeNull();
        const tabs = document.querySelectorAll('[role="tab"]');
        expect(tabs.length).toBeGreaterThanOrEqual(2);
        const selected = Array.from(tabs).find((t) => t.getAttribute('aria-selected') === 'true');
        expect(selected).not.toBeNull();
    });
});

// ─── BloomsPyramidChart ───────────────────────────────────────────────────────

describe('BloomsPyramidChart — a11y', () => {
    it('has no axe violations', async () => {
        const { default: BloomsPyramidChart } = await import('../../components/Statistics/BloomsPyramidChart');
        const levels = [
            { id: 'l1', order: 1, labelEn: 'Remember', labelNl: 'Onthouden', color: '#3b82f6', value: 75 },
            { id: 'l2', order: 2, labelEn: 'Understand', labelNl: 'Begrijpen', color: '#22c55e', value: 60 },
        ];
        render(<BloomsPyramidChart levels={levels} lang="en" />);
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });

    it('renders a figure with aria-label', async () => {
        const { default: BloomsPyramidChart } = await import('../../components/Statistics/BloomsPyramidChart');
        const levels = [{ id: 'l1', order: 1, labelEn: 'Remember', labelNl: 'Onthouden', color: '#3b82f6', value: 75 }];
        render(<BloomsPyramidChart levels={levels} lang="en" />);
        const figure = document.querySelector('figure');
        expect(figure).not.toBeNull();
        expect(figure?.getAttribute('aria-label')).toBeTruthy();
    });

    it('renders a sr-only data list with level values', async () => {
        const { default: BloomsPyramidChart } = await import('../../components/Statistics/BloomsPyramidChart');
        const levels = [{ id: 'l1', order: 1, labelEn: 'Remember', labelNl: 'Onthouden', color: '#3b82f6', value: 75 }];
        render(<BloomsPyramidChart levels={levels} lang="en" />);
        const srList = document.querySelector('ul.sr-only');
        expect(srList).not.toBeNull();
        expect(srList?.textContent).toContain('75%');
    });
});

// ─── RubricBuilder ──────────────────────────────────────────────────────────────

describe('RubricBuilder — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: RubricBuilder } = await import('../RubricBuilder');
        renderPage(<RubricBuilder />, '/rubrics/r1', '/rubrics/:id');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    }, 15000);
});

// ─── GradeStudent ───────────────────────────────────────────────────────────────

describe('GradeStudent — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: GradeStudent } = await import('../GradeStudent');
        renderPage(<GradeStudent />, '/rubrics/r1/grade/s1', '/rubrics/:rubricId/grade/:studentId');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    }, 15000);
});

// ─── ComparativeGrading ─────────────────────────────────────────────────────────

describe('ComparativeGrading — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: ComparativeGrading } = await import('../ComparativeGrading');
        renderPage(<ComparativeGrading />, '/grade-comparative/c1/r1', '/grade-comparative/:classId/:rubricId');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});
