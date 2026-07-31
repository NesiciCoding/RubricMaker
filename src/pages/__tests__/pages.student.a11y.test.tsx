/**
 * Accessibility audits (part 3: student-portal pages) using axe-core.
 *
 * Split from pages.a11y.test.tsx so this worker renders far fewer full pages —
 * the combined suite OOMs one jsdom worker when it renders every page at once.
 *
 * These tests catch structural a11y issues (missing labels, bad ARIA roles,
 * broken heading hierarchy) that manual review and unit tests miss.
 * Colour-contrast is skipped because jsdom has no rendering engine.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { axe } from 'jest-axe';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
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

// Build the context value ONCE so useApp() returns a stable object (and stable
// array references) across renders. A fresh object/array on every call makes any
// page whose effect depends on a context array re-run that effect every render —
// e.g. PeerReviewView setEntry()s a new object keyed on `peerReviews`, which loops
// forever and OOMs the worker. In the real app these references are stable.
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
        // Admin / settings / moderation / onboarding actions
        fetchAllUsers: vi.fn(() => Promise.resolve([])),
        updateUserRole: vi.fn(() => Promise.resolve()),
        getCurrentDatabaseUserId: vi.fn(() => null),
        addGradeScale: vi.fn(),
        updateGradeScale: vi.fn(),
        deleteGradeScale: vi.fn(),
        addExportTemplate: vi.fn(),
        deleteExportTemplate: vi.fn(),
        importBackup: vi.fn(),
        deleteStandardMasteryTarget: vi.fn(),
        deletePeerReview: vi.fn(),
        fetchSchoolMembers: vi.fn(() => Promise.resolve([])),
        createSchool: vi.fn(() => Promise.resolve()),
        joinSchool: vi.fn(() => Promise.resolve()),
        signOutFromDatabase: vi.fn(() => Promise.resolve()),
        // Student-portal actions
        saveRubricSelfAssessment: vi.fn(),
        saveSelfAssessment: vi.fn(),
        savePeerReview: vi.fn(),
        saveFlashcardReview: vi.fn(),
        saveFlashcardReviewAsStudent: vi.fn(),
        sendMessageAsStudent: vi.fn(),
        markMessagesReadByStudent: vi.fn(),
        markNewsFlashRead: vi.fn(),
        markNewsFlashReadAsStudent: vi.fn(),
        fetchMyEssayAssignments: vi.fn(() => Promise.resolve([])),
        fetchMyTestAssignments: vi.fn(() => Promise.resolve([])),
        fetchAssignedTestContent: vi.fn(() => Promise.resolve(null)),
        fetchMyMessages: vi.fn(() => Promise.resolve([])),
        fetchMyFlashcardAssignments: vi.fn(() => Promise.resolve([])),
        fetchMyNewsFlashes: vi.fn(() => Promise.resolve([])),
        fetchAssignedFlashcardDeck: vi.fn(() => Promise.resolve(null)),
        fetchMyFlashcardReview: vi.fn(() => Promise.resolve(null)),
    };
    return { useApp: () => base };
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

// ─── AdminPage (roadmap 31.6) ────────────────────────────────────────────────────

// ─── StudentPortalPage (roadmap 31.7) ────────────────────────────────────────────

describe('StudentPortalPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        // Suppress the first-visit Joyride tour so axe audits the real page content
        // rather than the transient tour tooltip overlay (whose <h4> title, injected
        // by react-joyride, would otherwise trip heading-order under the page's <h1>).
        localStorage.setItem('rm_portal_tour_seen_s1', 'true');
        const { default: StudentPortalPage } = await import('../StudentPortalPage');
        renderPage(<StudentPortalPage />, '/portal/s1', '/portal/:studentId');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── SelfAssessPage (roadmap 31.7) ───────────────────────────────────────────────

describe('SelfAssessPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: SelfAssessPage } = await import('../SelfAssessPage');
        renderPage(<SelfAssessPage />, '/rubrics/r1/self-assess/s1', '/rubrics/:rubricId/self-assess/:studentId');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── PeerReviewView (roadmap 31.7) ───────────────────────────────────────────────

describe('PeerReviewView — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: PeerReviewView } = await import('../PeerReviewView');
        renderPage(<PeerReviewView />, '/rubrics/r1/peer-review/s1', '/rubrics/:rubricId/peer-review/:studentId');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── StudentLearningPathPage (roadmap 31.7) ──────────────────────────────────────

describe('StudentLearningPathPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderPage(<StudentLearningPathPage />, '/students/s1/learning-path', '/students/:id/learning-path');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── StudentFlashcardStudyPage (roadmap 31.7) ────────────────────────────────────

describe('StudentFlashcardStudyPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations', async () => {
        const { default: StudentFlashcardStudyPage } = await import('../StudentFlashcardStudyPage');
        renderPage(<StudentFlashcardStudyPage />, '/portal/s1/flashcards/d1', '/portal/:studentId/flashcards/:deckId');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── StudentFeedbackPage (roadmap 31.7; share-code entry) ────────────────────────

describe('StudentFeedbackPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations on the invalid-code state', async () => {
        const { default: StudentFeedbackPage } = await import('../StudentFeedbackPage');
        renderPage(<StudentFeedbackPage />, '/feedback/bad-code', '/feedback/:code');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── RubricPreviewPage (roadmap 31.7; share-code entry) ──────────────────────────

describe('RubricPreviewPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations on the invalid-code state', async () => {
        const { default: RubricPreviewPage } = await import('../RubricPreviewPage');
        renderPage(<RubricPreviewPage />, '/preview/bad-code', '/preview/:code');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── StudentTestPage (roadmap 31.7; share-code entry) ────────────────────────────

describe('StudentTestPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations on the invalid-code state', async () => {
        const { default: StudentTestPage } = await import('../StudentTestPage');
        renderPage(<StudentTestPage />, '/test/bad-code', '/test/:code');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});

// ─── StudentEssayPage (roadmap 31.7; share-code entry) ───────────────────────────

describe('StudentEssayPage — a11y', () => {
    beforeEach(() => vi.clearAllMocks());

    it('has no axe violations on the invalid-code state', async () => {
        const { default: StudentEssayPage } = await import('../StudentEssayPage');
        renderPage(<StudentEssayPage />, '/essay/bad-code', '/essay/:code');
        const results = await axe(document.body, axeOptions);
        expect(results.violations).toHaveLength(0);
    });
});
