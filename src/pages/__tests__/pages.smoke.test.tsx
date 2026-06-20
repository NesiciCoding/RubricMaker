/**
 * Smoke tests for all page components.
 * These tests verify each page renders without crashing and covers the initial render path.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { Rubric, Student, Class, GradeScale, AppSettings, StudentRubric, SpeakingSession } from '../../types';

// ─── Shared mock data ──────────────────────────────────────────────────────────

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Test Rubric',
    subject: 'English',
    description: 'A test rubric',
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
            weight: 100,
            levels: [
                { id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: 'Great', subItems: [] },
                { id: 'l2', label: 'Good', minPoints: 70, maxPoints: 89, description: 'OK', subItems: [] },
            ],
        },
    ],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockClass: Class = { id: 'c1', name: 'Class A' };

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 90, max: 100, label: 'A', color: '#22c55e' }],
};

const mockSr: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
    overallComment: 'Good work',
    isPeerReview: false,
    gradedAt: '2024-01-01T00:00:00Z',
};

const noop = vi.fn();

const mockUseApp = {
    rubrics: [mockRubric],
    students: [mockStudent],
    classes: [mockClass],
    studentRubrics: [mockSr],
    attachments: [],
    gradeScales: [mockGradeScale],
    commentSnippets: [],
    settings: mockSettings,
    favoriteStandards: [],
    commentBank: [],
    exportTemplates: [],
    peerReviews: [],
    selfAssessments: [],
    speakingSessions: [] as SpeakingSession[],
    analysisResults: [],
    dispatch: noop,
    addRubric: vi.fn(() => mockRubric),
    updateRubric: noop,
    deleteRubric: noop,
    addStudent: vi.fn(() => mockStudent),
    updateStudent: noop,
    deleteStudent: noop,
    addClass: vi.fn(() => mockClass),
    updateClass: noop,
    deleteClass: noop,
    mergeClasses: noop,
    saveStudentRubric: noop,
    createStudentRubric: vi.fn(() => mockSr),
    deleteStudentRubric: noop,
    addAttachment: vi.fn(),
    deleteAttachment: noop,
    addGradeScale: vi.fn(() => mockGradeScale),
    updateGradeScale: noop,
    deleteGradeScale: noop,
    addCommentSnippet: vi.fn(),
    updateCommentSnippet: noop,
    deleteCommentSnippet: noop,
    updateSettings: noop,
    getActiveGradeScale: vi.fn(() => mockGradeScale),
    addFavoriteStandard: noop,
    removeFavoriteStandard: noop,
    isFavoriteStandard: vi.fn(() => false),
    addCommentBankItem: vi.fn(),
    updateCommentBankItem: noop,
    deleteCommentBankItem: noop,
    addExportTemplate: vi.fn(),
    deleteExportTemplate: noop,
    savePeerReview: noop,
    deletePeerReview: noop,
    saveSelfAssessment: noop,
    deleteSelfAssessment: noop,
    saveSpeakingSession: noop,
    deleteSpeakingSession: noop,
    syncRubricSnapshot: noop,
    saveRubricVersion: noop,
    restoreRubricVersion: noop,
    addVocabularyItem: vi.fn(),
    updateVocabularyItem: noop,
    deleteVocabularyItem: noop,
    saveAnalysisResult: noop,
    deleteAnalysisResult: noop,
    loginMicrosoft: vi.fn(),
    logoutMicrosoft: vi.fn(),
    syncToOneDrive: vi.fn(),
    restoreFromOneDrive: vi.fn(),
    microsoftUser: null,
    saveEssayAssignment: vi.fn(),
    deleteEssayAssignment: vi.fn(),
    fetchEssaySubmissions: vi.fn(() => Promise.resolve([])),
    fetchEssaySubmissionsForStudent: vi.fn(() => Promise.resolve([])),
    fetchAllEssaySubmissions: vi.fn(() => Promise.resolve([])),
    fetchMyEssayAssignments: vi.fn(() => Promise.resolve([])),
    deleteEssaySubmission: vi.fn(),
    getEssaySignedUrl: vi.fn(() => Promise.resolve(null)),
};

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockUseApp,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

vi.mock('../../hooks/useVoiceGrading', () => ({
    useVoiceGrading: () => ({
        isListening: false,
        toggleListening: vi.fn(),
        transcript: '',
    }),
}));

// Mock heavy editor/dnd components that don't work well in jsdom
vi.mock('../../components/Editor/TiptapEditor', () => ({
    default: ({ value }: { value: string }) => React.createElement('div', { 'data-testid': 'tiptap-mock' }, value),
}));

vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    Droppable: ({ children }: { children: (provided: any) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null } as any),
    Draggable: ({ children }: { children: (provided: any) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} } as any),
}));

vi.mock('../../data/templates', () => ({
    QUICK_START_TEMPLATES: [],
}));

const cefrSkillLabels = {
    reading: { en: 'Reading', nl: 'Lezen' },
    writing: { en: 'Writing', nl: 'Schrijven' },
    listening: { en: 'Listening', nl: 'Luisteren' },
    speaking_production: { en: 'Speaking', nl: 'Spreken' },
    speaking_interaction: { en: 'Interaction', nl: 'Interactie' },
};

vi.mock('../../data/cefrDescriptors', () => ({
    CEFR_LEVELS: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    CEFR_SKILLS: ['reading', 'writing', 'listening', 'speaking_production', 'speaking_interaction'],
    CEFR_SKILL_LABELS: cefrSkillLabels,
    CEFR_LEVEL_COLORS: { A1: '#green', A2: '#teal', B1: '#blue', B2: '#purple', C1: '#orange', C2: '#red' },
    CEFR_DESCRIPTORS: [],
}));

vi.mock('../../data/voTracks', () => ({
    VO_TRACKS: [],
    VO_TRACK_LABELS: {},
    VO_TRACK_COLORS: {},
    VO_TRACK_DEFAULT_CEFR: {},
}));

// ─── Helper ────────────────────────────────────────────────────────────────────

function renderPage(element: React.ReactElement, route = '/', path = '/') {
    const router = createMemoryRouter([{ path, element }], { initialEntries: [route] });
    return render(<RouterProvider router={router} />);
}

// ─── Page smoke tests ──────────────────────────────────────────────────────────

describe('Page smoke tests — render without crash', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Dashboard renders', async () => {
        const { default: Dashboard } = await import('../Dashboard');
        const { container } = renderPage(<Dashboard />);
        expect(container.firstChild).toBeTruthy();
    });

    it('RubricList renders', async () => {
        const { default: RubricList } = await import('../RubricList');
        const { container } = renderPage(<RubricList />);
        expect(container.firstChild).toBeTruthy();
    });

    it('StudentsPage renders', async () => {
        const { default: StudentsPage } = await import('../StudentsPage');
        const { container } = renderPage(<StudentsPage />);
        expect(container.firstChild).toBeTruthy();
    });

    it('SettingsPage renders', async () => {
        const { default: SettingsPage } = await import('../SettingsPage');
        const { container } = renderPage(<SettingsPage />);
        expect(container.firstChild).toBeTruthy();
    });

    it('ExportPage renders', async () => {
        const { default: ExportPage } = await import('../ExportPage');
        const { container } = renderPage(<ExportPage />);
        expect(container.firstChild).toBeTruthy();
    });

    it('AttachmentsPage renders', async () => {
        const { default: AttachmentsPage } = await import('../AttachmentsPage');
        const { container } = renderPage(<AttachmentsPage />);
        expect(container.firstChild).toBeTruthy();
    });

    it('CommentBankPage renders', async () => {
        const { default: CommentBankPage } = await import('../CommentBankPage');
        const { container } = renderPage(<CommentBankPage />);
        expect(container.firstChild).toBeTruthy();
    });

    it('StatisticsPage renders', async () => {
        const { default: StatisticsPage } = await import('../StatisticsPage');
        const { container } = renderPage(<StatisticsPage />);
        expect(container.firstChild).toBeTruthy();
    });

    it('RubricPreviewPage renders with code param', async () => {
        const { default: RubricPreviewPage } = await import('../RubricPreviewPage');
        // Renders "Invalid rubric link" for unknown code — still a valid render
        const { container } = renderPage(<RubricPreviewPage />, '/preview/invalid-code', '/preview/:code');
        expect(container.firstChild).toBeTruthy();
    });

    it('StudentFeedbackPage renders with code param', async () => {
        const { default: StudentFeedbackPage } = await import('../StudentFeedbackPage');
        const { container } = renderPage(<StudentFeedbackPage />, '/feedback/invalid-code', '/feedback/:code');
        expect(container.firstChild).toBeTruthy();
    });

    it('GradeStudent renders with unknown params (not-found path)', async () => {
        const { default: GradeStudent } = await import('../GradeStudent');
        const { container } = renderPage(
            <GradeStudent />,
            '/grade/unknown-rubric/unknown-student',
            '/grade/:rubricId/:studentId'
        );
        expect(container.firstChild).toBeTruthy();
    });

    it('GradeStudent renders with known params', async () => {
        const { default: GradeStudent } = await import('../GradeStudent');
        const { container } = renderPage(<GradeStudent />, '/grade/r1/s1', '/grade/:rubricId/:studentId');
        expect(container.firstChild).toBeTruthy();
    });

    it('StudentProfilePage renders with unknown studentId', async () => {
        const { default: StudentProfilePage } = await import('../StudentProfilePage');
        const { container } = renderPage(<StudentProfilePage />, '/students/unknown', '/students/:studentId');
        expect(container.firstChild).toBeTruthy();
    });

    it('StudentProfilePage renders with known studentId', async () => {
        const { default: StudentProfilePage } = await import('../StudentProfilePage');
        const { container } = renderPage(<StudentProfilePage />, '/students/s1', '/students/:studentId');
        expect(container.firstChild).toBeTruthy();
    });

    it('StudentCefrOverviewPage renders with unknown studentId', async () => {
        const { default: StudentCefrOverviewPage } = await import('../StudentCefrOverviewPage');
        const { container } = renderPage(
            <StudentCefrOverviewPage />,
            '/students/unknown/cefr-overview',
            '/students/:id/cefr-overview'
        );
        expect(container.firstChild).toBeTruthy();
    });

    it('StudentCefrOverviewPage renders with known studentId', async () => {
        const { default: StudentCefrOverviewPage } = await import('../StudentCefrOverviewPage');
        const { container } = renderPage(
            <StudentCefrOverviewPage />,
            '/students/s1/cefr-overview',
            '/students/:id/cefr-overview'
        );
        expect(container.firstChild).toBeTruthy();
    });

    it('SelfAssessPage renders with params', async () => {
        const { default: SelfAssessPage } = await import('../SelfAssessPage');
        const { container } = renderPage(<SelfAssessPage />, '/self-assess/r1/s1', '/self-assess/:rubricId/:studentId');
        expect(container.firstChild).toBeTruthy();
    });

    it('PeerReviewView renders with params', async () => {
        const { default: PeerReviewView } = await import('../PeerReviewView');
        const { container } = renderPage(<PeerReviewView />, '/peer-review/r1/s1', '/peer-review/:rubricId/:studentId');
        expect(container.firstChild).toBeTruthy();
    });

    it('ComparativeGrading renders with params', async () => {
        const { default: ComparativeGrading } = await import('../ComparativeGrading');
        const { container } = renderPage(<ComparativeGrading />, '/comparative/r1', '/comparative/:rubricId');
        expect(container.firstChild).toBeTruthy();
    });

    it('SpeakingSession renders with params', async () => {
        const { default: SpeakingSession } = await import('../SpeakingSession');
        const { container } = renderPage(<SpeakingSession />, '/speaking/r1/s1', '/speaking/:rubricId/:studentId');
        expect(container.firstChild).toBeTruthy();
    });

    it('RubricBuilder renders with known rubricId', async () => {
        const { default: RubricBuilder } = await import('../RubricBuilder');
        const { container } = renderPage(<RubricBuilder />, '/rubrics/r1', '/rubrics/:rubricId');
        expect(container.firstChild).toBeTruthy();
    });

    it('StudentPortalPage renders with unknown studentId (not found state)', async () => {
        const { default: StudentPortalPage } = await import('../StudentPortalPage');
        const { container } = renderPage(<StudentPortalPage />, '/portal/unknown', '/portal/:studentId');
        expect(container.firstChild).toBeTruthy();
    });

    it('StudentPortalPage renders with known studentId', async () => {
        const { default: StudentPortalPage } = await import('../StudentPortalPage');
        const { container } = renderPage(<StudentPortalPage />, '/portal/s1', '/portal/:studentId');
        expect(container.firstChild).toBeTruthy();
    });
});
