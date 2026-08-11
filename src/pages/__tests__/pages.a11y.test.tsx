/**
 * Accessibility audits for key pages using axe-core (via jest-axe).
 *
 * These tests catch structural a11y issues (missing labels, bad ARIA roles,
 * broken heading hierarchy) that manual review and unit tests miss.
 * Colour-contrast is skipped because jsdom has no rendering engine.
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { axe } from 'jest-axe';
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Student, Rubric, StudentRubric, Test, StudentTest, FlashcardDeck } from '../../types';

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

const mockTest: Test = {
    id: 't1',
    name: 'Unit Test',
    description: '',
    questions: [
        {
            id: 'q1',
            prompt: 'What is 2 + 2?',
            type: 'multiple-choice',
            points: 1,
            options: [
                { id: 'o1', text: '4', isCorrect: true },
                { id: 'o2', text: '3', isCorrect: false },
            ],
        },
        { id: 'q2', prompt: 'Explain photosynthesis.', type: 'open', points: 5 },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    gradeScaleId: 'gs1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
};

const mockStudentTest: StudentTest = {
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [
        { questionId: 'q1', response: 'o1' },
        { questionId: 'q2', response: 'Plants convert light into energy.' },
    ],
    status: 'submitted',
    startedAt: '2024-01-01T00:00:00Z',
    submittedAt: '2024-01-01T01:00:00Z',
};

const mockFlashcardDeck: FlashcardDeck = {
    id: 'd1',
    name: 'Unit 1 Vocabulary',
    description: '',
    cards: [
        { id: 'card1', front: 'ubiquitous', back: 'present everywhere', cefrLevel: 'C1' },
        { id: 'card2', front: 'ephemeral', back: 'lasting a short time', cefrLevel: 'C1' },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
};

// Per-test overrides merged into the mocked useApp() return value. Default empty so
// the shared mock stays as the other suites expect; a suite that needs seeded data
// (e.g. TestResultsPage's graded-submission view) sets this in beforeEach and resets
// it in afterEach.
let appStateOverride: Record<string, unknown> = {};

// ─── Module mocks ──────────────────────────────────────────────────────────────

// Build the context value ONCE so useApp() returns stable array references across
// renders — a fresh object/array each call makes any page whose effect depends on a
// context array re-run that effect forever (setState → re-render → new array ref →
// effect → …), which OOMs the worker. `appStateOverride` is spread on top so seeded
// suites still work; the arrays it carries are stable within a single test.
vi.mock('../../context/AppContext', () => {
    const base = {
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
        questionBank: [],
        exportTemplates: [],
        flashcardDecks: [],
        flashcardAssignments: [],
        flashcardReviews: [],
        essayAssignments: [],
        essaySubmissions: [],
        peerReviews: [],
        analysisResults: [],
        attachments: [],
        essayTemplates: [],
        messages: [],
        newsFlashes: [],
        newsFlashReads: [],
        commentBank: [],
        userTemplates: [],
        gradingTasks: [],
        standardMasteryTargets: [],
        notificationDismissals: [],
        dismissNotification: vi.fn(),
        markMessageReadByTeacher: vi.fn(),
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
        // Tests / Question Bank actions
        addTest: vi.fn(),
        updateTest: vi.fn(),
        deleteTest: vi.fn(),
        saveStudentTest: vi.fn(),
        addSectionBankItem: vi.fn(),
        addQuestionBankItems: vi.fn(),
        updateQuestionBankItem: vi.fn(),
        deleteQuestionBankItem: vi.fn(),
        deleteQuestionBankItems: vi.fn(),
        bulkUpdateQuestionBankItems: vi.fn(),
        // Flashcard actions
        addFlashcardDeck: vi.fn(),
        updateFlashcardDeck: vi.fn(),
        deleteFlashcardDeck: vi.fn(),
        addFlashcardAssignments: vi.fn(),
        // Essay actions
        deleteEssayGroup: vi.fn(),
        updateEssayGroup: vi.fn(),
        addEssaySubmission: vi.fn(),
        // News-flash actions
        addNewsFlash: vi.fn(),
        updateNewsFlash: vi.fn(),
        deleteNewsFlash: vi.fn(),
        // Comment-bank actions
        updateCommentBankItem: vi.fn(),
        deleteCommentBankItem: vi.fn(),
        // Speaking / live-monitor actions
        saveSpeakingSession: vi.fn(),
        fetchTestAssignmentTeacherKeys: vi.fn(() => Promise.resolve([])),
        setPlacementOverride: vi.fn(),
        fetchEssayAssignmentByKey: vi.fn(() => Promise.resolve(null)),
        // Dashboard / activity / rubric-list / students / attachments actions
        deleteUserTemplate: vi.fn(),
        sendMessage: vi.fn(),
        notifyStudentMessage: vi.fn(),
        addGradingTasks: vi.fn(),
        deleteGradingTask: vi.fn(),
        deleteRubric: vi.fn(),
        createGroupStudentRubrics: vi.fn(),
        addStudent: vi.fn(),
        updateStudent: vi.fn(),
        deleteStudent: vi.fn(),
        addClass: vi.fn(),
        deleteClass: vi.fn(),
        mergeClasses: vi.fn(),
        setStudentPassword: vi.fn(),
        deleteAttachment: vi.fn(),
    };
    return {
        useApp: () => ({ ...base, ...appStateOverride }),
        useRoster: () => ({ ...base, ...appStateOverride }),
        useStudents: () => ({ ...base, ...appStateOverride }),
        useClasses: () => ({ ...base, ...appStateOverride }),
        useGrading: () => ({ ...base, ...appStateOverride }),
        useAuthoring: () => ({ ...base, ...appStateOverride }),
        useAssessment: () => ({ ...base, ...appStateOverride }),
        useEssays: () => ({ ...base, ...appStateOverride }),
        useFlashcards: () => ({ ...base, ...appStateOverride }),
        useSettings: () => ({ ...base, ...appStateOverride }),
        usePlatform: () => ({ ...base, ...appStateOverride }),
    };
});

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

// ─── NotificationsPage (roadmap 30.1) ────────────────────────────────────────────

describe('NotificationsPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations on the empty state', async () => {
        const { default: NotificationsPage } = await import('../NotificationsPage');
        renderPage(<NotificationsPage />);
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── QuestionBankPage (roadmap 31.1) ─────────────────────────────────────────────

describe('QuestionBankPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: QuestionBankPage } = await import('../QuestionBankPage');
        renderPage(<QuestionBankPage />, '/question-bank', '/question-bank');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── TestListPage (roadmap 31.1) ─────────────────────────────────────────────────

describe('TestListPage — a11y', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        appStateOverride = { tests: [mockTest], studentTests: [mockStudentTest] };
    });
    afterEach(() => {
        appStateOverride = {};
    });

    it('has no axe violations with a populated list', async () => {
        const { default: TestListPage } = await import('../TestListPage');
        renderPage(<TestListPage />, '/tests', '/tests');
        // Confirm the seeded test rendered a real row (with its action buttons)
        // rather than the empty state, so axe audited the populated list.
        expect(document.body.textContent).toContain('Unit Test');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── TestBuilderPage (roadmap 31.1) ──────────────────────────────────────────────

describe('TestBuilderPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations for a new test', async () => {
        const { default: TestBuilderPage } = await import('../TestBuilderPage');
        renderPage(<TestBuilderPage />, '/tests/new', '/tests/new');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    }, 15000);
});

// ─── TestResultsPage (roadmap 31.1) ──────────────────────────────────────────────

describe('TestResultsPage — a11y', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        appStateOverride = { tests: [mockTest], studentTests: [mockStudentTest] };
    });
    afterEach(() => {
        appStateOverride = {};
    });

    it('has no axe violations on a graded submission', async () => {
        const { default: TestResultsPage } = await import('../TestResultsPage');
        renderPage(<TestResultsPage />, '/tests/t1/results/st1', '/tests/:testId/results/:studentTestId');
        // Guard against silently rendering the not-found fallback: the real results
        // view lists each question prompt, so this confirms the seeded submission
        // actually rendered and axe audited the graded tables, not an empty state.
        expect(document.body.textContent).toContain('What is 2 + 2?');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── VocabularyDashboardPage (roadmap 31.2) ──────────────────────────────────────

describe('VocabularyDashboardPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: VocabularyDashboardPage } = await import('../VocabularyDashboardPage');
        renderPage(<VocabularyDashboardPage />, '/vocabulary', '/vocabulary');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── FlashcardsPage (roadmap 31.2) ───────────────────────────────────────────────

describe('FlashcardsPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(() => {
        appStateOverride = {};
    });

    it('has no axe violations on the empty state', async () => {
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderPage(<FlashcardsPage />, '/flashcards', '/flashcards');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });

    // Regression guard for the stretched-link fix (PR #357): a populated deck card
    // must not reintroduce a `nested-interactive` violation. The card title is a
    // `button.stretched-link` that covers the card for whole-card navigation, so the
    // edit/delete controls are no longer nested inside a `role="button"` wrapper.
    it('has no axe violations with a deck present', async () => {
        appStateOverride = { flashcardDecks: [mockFlashcardDeck] };
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderPage(<FlashcardsPage />, '/flashcards', '/flashcards');
        expect(document.body.textContent).toContain('Unit 1 Vocabulary');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── FlashcardDeckPage (roadmap 31.2) ────────────────────────────────────────────

describe('FlashcardDeckPage — a11y', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        appStateOverride = { flashcardDecks: [mockFlashcardDeck] };
    });
    afterEach(() => {
        appStateOverride = {};
    });

    it('has no axe violations on the deck editor', async () => {
        const { default: FlashcardDeckPage } = await import('../FlashcardDeckPage');
        renderPage(<FlashcardDeckPage />, '/flashcards/d1', '/flashcards/:id');
        // Guard against the deck-not-found fallback: the editor shows the deck name.
        expect(document.body.textContent).toContain('Unit 1 Vocabulary');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── EssayListPage (roadmap 31.3) ────────────────────────────────────────────────

describe('EssayListPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: EssayListPage } = await import('../EssayListPage');
        renderPage(<EssayListPage />, '/essays', '/essays');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── EssayBuilderPage (roadmap 31.3) ─────────────────────────────────────────────

describe('EssayBuilderPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations for a new essay assignment', async () => {
        const { default: EssayBuilderPage } = await import('../EssayBuilderPage');
        renderPage(<EssayBuilderPage />, '/essays/new', '/essays/new');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    }, 15000);
});

// ─── PeerReviewAnalyticsPage (roadmap 31.3) ──────────────────────────────────────

describe('PeerReviewAnalyticsPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: PeerReviewAnalyticsPage } = await import('../PeerReviewAnalyticsPage');
        renderPage(<PeerReviewAnalyticsPage />, '/peer-analytics/r1', '/peer-analytics/:rubricId');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── CommentBankPage (roadmap 31.3; restructured in 29.6) ─────────────────────────

describe('CommentBankPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: CommentBankPage } = await import('../CommentBankPage');
        renderPage(<CommentBankPage />, '/comments', '/comments');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── MarketplacePage (roadmap 31.3; gained questionBankItem in 29.2) ──────────────

describe('MarketplacePage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: MarketplacePage } = await import('../MarketplacePage');
        renderPage(<MarketplacePage />, '/marketplace', '/marketplace');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── NewsFlashesPage (roadmap 31.3) ──────────────────────────────────────────────

describe('NewsFlashesPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: NewsFlashesPage } = await import('../NewsFlashesPage');
        renderPage(<NewsFlashesPage />, '/news-flashes', '/news-flashes');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── SpeakingSession (roadmap 31.4) ──────────────────────────────────────────────

describe('SpeakingSession — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: SpeakingSession } = await import('../SpeakingSession');
        renderPage(<SpeakingSession />, '/speaking/r1/s1', '/speaking/:rubricId/:studentId');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── StudentCefrOverviewPage (roadmap 31.4) ──────────────────────────────────────

describe('StudentCefrOverviewPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: StudentCefrOverviewPage } = await import('../StudentCefrOverviewPage');
        renderPage(<StudentCefrOverviewPage />, '/students/s1/cefr-overview', '/students/:id/cefr-overview');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── LiveMonitorPage (roadmap 31.4) ──────────────────────────────────────────────

describe('LiveMonitorPage — a11y', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        appStateOverride = { tests: [mockTest], studentTests: [mockStudentTest] };
    });
    afterEach(() => {
        appStateOverride = {};
    });

    it('has no axe violations', async () => {
        const { default: LiveMonitorPage } = await import('../LiveMonitorPage');
        renderPage(<LiveMonitorPage kind="test" />, '/tests/t1/monitor', '/tests/:testId/monitor');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── Dashboard (roadmap 31.5) ────────────────────────────────────────────────────

describe('Dashboard — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: Dashboard } = await import('../Dashboard');
        renderPage(<Dashboard />, '/', '/');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── ActivityDashboardPage (roadmap 31.5) ────────────────────────────────────────

describe('ActivityDashboardPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: ActivityDashboardPage } = await import('../ActivityDashboardPage');
        renderPage(<ActivityDashboardPage />, '/activity-dashboard', '/activity-dashboard');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── RubricList (roadmap 31.5) ───────────────────────────────────────────────────

describe('RubricList — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations with a rubric present', async () => {
        const { default: RubricList } = await import('../RubricList');
        renderPage(<RubricList />, '/rubrics', '/rubrics');
        expect(document.body.textContent).toContain('Test Rubric');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── StudentsPage (roadmap 31.5) ─────────────────────────────────────────────────

describe('StudentsPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: StudentsPage } = await import('../StudentsPage');
        renderPage(<StudentsPage />, '/students', '/students');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── StatisticsPage (roadmap 31.5) ───────────────────────────────────────────────

describe('StatisticsPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: StatisticsPage } = await import('../StatisticsPage');
        renderPage(<StatisticsPage />, '/statistics', '/statistics');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    }, 15000);

    // The 'rubric' view above only exercises its own filter selects. Switch into
    // the other two view modes (each renders its own class/student/rubric selects)
    // so axe audits those branches too.
    it('has no axe violations in the student view', async () => {
        const { default: StatisticsPage } = await import('../StatisticsPage');
        renderPage(<StatisticsPage />, '/statistics', '/statistics');
        fireEvent.click(screen.getByText('statistics.view_by_student'));
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    }, 15000);

    it('has no axe violations in the compare view', async () => {
        const { default: StatisticsPage } = await import('../StatisticsPage');
        renderPage(<StatisticsPage />, '/statistics', '/statistics');
        fireEvent.click(screen.getByText('statistics.view_compare'));
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    }, 15000);
});

// ─── ExportPage (roadmap 31.5) ───────────────────────────────────────────────────

describe('ExportPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: ExportPage } = await import('../ExportPage');
        renderPage(<ExportPage />, '/export', '/export');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── AttachmentsPage (roadmap 31.5) ──────────────────────────────────────────────

describe('AttachmentsPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: AttachmentsPage } = await import('../AttachmentsPage');
        renderPage(<AttachmentsPage />, '/attachments', '/attachments');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});
