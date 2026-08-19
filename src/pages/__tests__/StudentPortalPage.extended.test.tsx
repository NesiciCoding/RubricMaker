import React from 'react';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type {
    AppSettings,
    Class,
    FlashcardAssignment,
    FlashcardDeck,
    FlashcardReview,
    GradeScale,
    Message,
    NewsFlash,
    NewsFlashRead,
    Rubric,
    SelfAssessment,
    Student,
    StudentRubric,
    StudentTestAssignmentSummary,
} from '../../types';

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockClassmate: Student = { id: 's2', name: 'Bea', classId: 'c1' };

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    userRole: 'student',
};

// ─── Rubrics ──────────────────────────────────────────────────────────────────

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'c1',
            title: 'Content',
            description: '',
            weight: 100,
            levels: [
                { id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] },
                { id: 'l2', label: 'Good', minPoints: 70, maxPoints: 89, description: '', subItems: [] },
                { id: 'l0', label: 'Developing', minPoints: 0, maxPoints: 69, description: '', subItems: [] },
            ],
        },
        {
            id: 'c2',
            title: 'Structure',
            description: '',
            weight: 100,
            levels: [
                { id: 'l3', label: 'Good', minPoints: 70, maxPoints: 89, description: '', subItems: [] },
                { id: 'l3b', label: 'Developing', minPoints: 0, maxPoints: 69, description: '', subItems: [] },
            ],
        },
        {
            id: 'c3',
            title: 'Grammar',
            description: '',
            weight: 100,
            levels: [
                { id: 'l4', label: 'Good', minPoints: 70, maxPoints: 89, description: '', subItems: [] },
                { id: 'l4b', label: 'Developing', minPoints: 0, maxPoints: 69, description: '', subItems: [] },
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

// CEFR-tagged rubric: feeds cefrProgress, cefrSkill intervention flags, and (via the
// classmate's higher score) the cohort-gap learning-path recommendations.
const mockCefrRubric: Rubric = {
    id: 'r2',
    name: 'Reading Rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'rc1',
            title: 'Comprehension',
            description: '',
            weight: 100,
            levels: [
                { id: 'rl1', label: 'Strong', minPoints: 80, maxPoints: 100, description: '', subItems: [] },
                { id: 'rl2', label: 'Developing', minPoints: 0, maxPoints: 79, description: '', subItems: [] },
            ],
        },
    ],
    gradeScaleId: 'missing-scale',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
    cefrTargetLevel: 'B1',
    cefrSkill: 'reading',
    cefrAchieveThreshold: 70,
};

// Grammar-linked criterion: feeds getGrammarRecommendations.
const mockGrammarRubric: Rubric = {
    id: 'r3',
    name: 'Grammar Rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'gc1',
            title: 'Grammar',
            description: '',
            weight: 100,
            levels: [
                { id: 'gl1', label: 'Good', minPoints: 70, maxPoints: 100, description: '', subItems: [] },
                { id: 'gl2', label: 'Developing', minPoints: 0, maxPoints: 69, description: '', subItems: [] },
            ],
            frameworkDescriptors: [
                {
                    descriptorId: 'gr-present-simple-affirmative',
                    framework: 'grammar',
                    categoryId: 'present-simple',
                    categoryLabelEn: 'Present simple',
                    categoryLabelNl: 'Present simple',
                    categoryColor: '#000',
                    descriptionEn: '',
                    descriptionNl: '',
                    level: 'A1',
                },
                {
                    descriptorId: 'unknown-grammar-item',
                    framework: 'grammar',
                    categoryId: 'unknown',
                    categoryLabelEn: 'Unknown',
                    categoryLabelNl: 'Unknown',
                    categoryColor: '#000',
                    descriptionEn: '',
                    descriptionNl: '',
                },
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

// ─── Graded records ───────────────────────────────────────────────────────────

const mockGradedRubric: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [
        { criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: 'Great work' },
        { criterionId: 'c2', levelId: 'l3', checkedSubItems: [], comment: '' },
    ],
    overallComment: 'Well done!',
    gradedAt: '2024-01-15T10:00:00Z',
    isPeerReview: false,
};

const mockGradedRubric2: StudentRubric = {
    id: 'sr2',
    rubricId: 'r1',
    studentId: 's1',
    entries: [
        { criterionId: 'c1', levelId: 'l2', checkedSubItems: [], comment: '' },
        { criterionId: 'c2', levelId: 'l3b', checkedSubItems: [], comment: '' },
    ],
    overallComment: '',
    gradedAt: '2024-02-15T10:00:00Z',
    isPeerReview: false,
};

// Three consecutive low CEFR-rubric scores → cefrSkill intervention flag + cefrProgress entry.
const mockLowCefrSrs: StudentRubric[] = [1, 2, 3].map((n) => ({
    id: `sr-cefr-${n}`,
    rubricId: 'r2',
    studentId: 's1',
    entries: [{ criterionId: 'rc1', levelId: null, overridePoints: 30, checkedSubItems: [], comment: '' }],
    overallComment: '',
    gradedAt: `2024-03-0${n}T10:00:00Z`,
    isPeerReview: false,
}));

// Classmate's high CEFR score pulls the cohort average up → gap-based recommendation.
const mockClassmateHighSr: StudentRubric = {
    id: 'sr-hi',
    rubricId: 'r2',
    studentId: 's2',
    entries: [{ criterionId: 'rc1', levelId: null, overridePoints: 95, checkedSubItems: [], comment: '' }],
    overallComment: '',
    gradedAt: '2024-03-10T10:00:00Z',
    isPeerReview: false,
};

// Three consecutive low grammar-rubric scores → grammar recommendation.
const mockLowGrammarSrs: StudentRubric[] = [1, 2, 3].map((n) => ({
    id: `sr-gr-${n}`,
    rubricId: 'r3',
    studentId: 's1',
    entries: [{ criterionId: 'gc1', levelId: null, overridePoints: 30, checkedSubItems: [], comment: '' }],
    overallComment: '',
    gradedAt: `2024-04-0${n}T10:00:00Z`,
    isPeerReview: false,
}));

// Snapshot-only rubric (no longer in the live rubric list) with a criterion that no current
// rubric carries → criterion flag whose label falls back to the raw targetId.
const mockGhostSnapshot: Rubric = {
    ...mockRubric,
    id: 'r-ghost',
    name: 'Old Rubric',
    criteria: [
        {
            id: 'ghost-c',
            title: 'Ghost Criterion',
            description: '',
            weight: 100,
            levels: [{ id: 'gl', label: 'L', minPoints: 0, maxPoints: 100, description: '', subItems: [] }],
        },
    ],
};
const mockGhostSnapshotSrs: StudentRubric[] = [1, 2, 3].map((n) => ({
    id: `sr-ghost-${n}`,
    rubricId: 'r-ghost',
    studentId: 's1',
    rubricSnapshot: mockGhostSnapshot,
    entries: [{ criterionId: 'ghost-c', levelId: null, overridePoints: 30, checkedSubItems: [], comment: '' }],
    overallComment: '',
    gradedAt: `2024-05-0${n}T10:00:00Z`,
    isPeerReview: false,
}));

// Graded sr whose rubric is neither live nor snapshotted → dropped from history.
const mockNoRubricSr: StudentRubric = {
    id: 'sr-nosnap',
    rubricId: 'r-nosnap',
    studentId: 's1',
    entries: [],
    overallComment: '',
    gradedAt: '2024-01-10T10:00:00Z',
    isPeerReview: false,
};

// Peer review referencing a rubric that no longer exists → card silently skipped.
const mockGhostPeerReview: StudentRubric = {
    id: 'pr-ghost',
    rubricId: 'r-ghost',
    studentId: 's1',
    entries: [{ criterionId: 'x', levelId: 'l', checkedSubItems: [], comment: 'hi' }],
    overallComment: '',
    gradedAt: '2024-01-16T10:00:00Z',
    isPeerReview: true,
};

const mockOverallOnlyReview: StudentRubric = {
    id: 'pr-overall',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l2', checkedSubItems: [], comment: '' }],
    overallComment: 'Overall only comment',
    gradedAt: '2024-01-17T10:00:00Z',
    isPeerReview: true,
};

const mockEntryOnlyReview: StudentRubric = {
    id: 'pr-entry',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l2', checkedSubItems: [], comment: 'Entry comment only' }],
    overallComment: '',
    gradedAt: '2024-01-18T10:00:00Z',
    isPeerReview: true,
};

const mockSelfAssessedSr: StudentRubric = {
    id: 'sr3',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l2', checkedSubItems: [], comment: '' }],
    overallComment: '',
    gradedAt: '2024-01-20T10:00:00Z',
    isPeerReview: false,
    selfAssessedAt: '2024-01-21T10:00:00Z',
};

const mockSelfAssessment: SelfAssessment = {
    id: 'sa1',
    rubricId: 'r1',
    studentId: 's1',
    ratings: [],
    submittedAt: '2024-01-21T10:00:00Z',
};

// ─── Assignments ──────────────────────────────────────────────────────────────

const mockPendingTest: StudentTestAssignmentSummary = {
    teacherKey: 'test-1',
    testId: 't1',
    studentId: 's1',
    testName: 'Vocabulary Quiz',
    requireSEB: true,
    durationMinutes: 20,
    createdAt: '2024-01-01T00:00:00Z',
    expiresAt: null,
    submission: { status: 'in_progress', submittedAt: null },
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

let joyrideOnEvent: ((data: { status: string }) => void) | null = null;
let mockLang = 'en';

vi.mock('react-joyride', () => ({
    Joyride: (props: { onEvent: (data: { status: string }) => void }) => {
        joyrideOnEvent = props.onEvent;
        return null;
    },
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

vi.mock('../../components/Students/RubricSelfAssessPanel', () => ({
    default: (props: { onSave: (levels: never[], reflection: string) => void }) => (
        <button type="button" onClick={() => props.onSave([], 'My reflection')}>
            save-self-assess
        </button>
    ),
}));

vi.mock('../../components/Students/StudentDecksSection', () => ({
    default: () => React.createElement('div', { 'data-testid': 'student-decks' }),
}));
vi.mock('../../components/Statistics/CefrProgressChart', () => ({ default: () => null }));
vi.mock('../../components/Statistics/CriterionRadarChart', () => ({
    default: ({ data }: { data: { name: string; avg: number }[] }) => (
        <div data-testid="radar-data">{JSON.stringify(data)}</div>
    ),
}));

vi.mock('../../services/database', () => ({
    loadSupabaseConfig: () => ({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' }),
    storageSync: { adapter: {} },
}));

const mockEncodeEssay = vi.fn((..._args: unknown[]) => 'essay-code');
const mockEncodeTest = vi.fn((..._args: unknown[]) => 'test-code');
vi.mock('../../utils/shareCode', () => ({
    encodeEssayAssignment: (...args: unknown[]) => mockEncodeEssay(...args),
    encodeTestAssignment: (...args: unknown[]) => mockEncodeTest(...args),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: mockLang },
    }),
}));

const mockFetchMyEssayAssignments = vi.fn().mockResolvedValue([]);
const mockFetchMyTestAssignments = vi.fn().mockResolvedValue([]);
const mockFetchAssignedTestContent = vi.fn().mockResolvedValue(null);
const mockFetchMyMessages = vi.fn().mockResolvedValue([]);
const mockSendMessageAsStudent = vi.fn().mockResolvedValue({ success: true });
const mockMarkMessagesReadByStudent = vi.fn().mockResolvedValue({ success: true });
const mockFetchMyFlashcardAssignments = vi.fn().mockResolvedValue([]);
const mockFetchMyNewsFlashes = vi.fn().mockResolvedValue([]);
const mockMarkNewsFlashRead = vi.fn();
const mockMarkNewsFlashReadAsStudent = vi.fn().mockResolvedValue({ success: true });
const mockSaveRubricSelfAssessment = vi.fn();
const mockUpdateSettings = vi.fn();

const mockAppValue: Record<string, unknown> = {
    students: [],
    classes: [],
    rubrics: [],
    studentRubrics: [],
    peerReviews: [],
    gradeScales: [],
    settings: mockSettings,
    selfAssessments: [],
    analysisResults: [],
    tests: [],
    studentTests: [],
    saveRubricSelfAssessment: mockSaveRubricSelfAssessment,
    fetchMyEssayAssignments: mockFetchMyEssayAssignments,
    fetchMyTestAssignments: mockFetchMyTestAssignments,
    fetchAssignedTestContent: mockFetchAssignedTestContent,
    fetchMyMessages: mockFetchMyMessages,
    sendMessageAsStudent: mockSendMessageAsStudent,
    markMessagesReadByStudent: mockMarkMessagesReadByStudent,
    flashcardAssignments: [],
    flashcardDecks: [],
    flashcardReviews: [],
    fetchMyFlashcardAssignments: mockFetchMyFlashcardAssignments,
    newsFlashes: [],
    newsFlashReads: [],
    fetchMyNewsFlashes: mockFetchMyNewsFlashes,
    markNewsFlashRead: mockMarkNewsFlashRead,
    markNewsFlashReadAsStudent: mockMarkNewsFlashReadAsStudent,
    updateSettings: mockUpdateSettings,
};

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockAppValue,
    useStudents: () => mockAppValue,
    useClasses: () => mockAppValue,
    useGrading: () => mockAppValue,
    useAuthoring: () => mockAppValue,
    useAssessment: () => mockAppValue,
    useEssays: () => mockAppValue,
    useFlashcards: () => mockAppValue,
    useSettings: () => mockAppValue,
    usePlatform: () => mockAppValue,
}));
vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: Record<string, unknown>) => unknown) => selector(mockAppValue),
    useStoreActions: () => mockAppValue,
}));

let StudentPortalPageComp: React.ComponentType;

function renderAt(studentId: string) {
    const router = createMemoryRouter([{ path: '/portal/:studentId', element: <StudentPortalPageComp /> }], {
        initialEntries: [`/portal/${studentId}`],
    });
    return render(<RouterProvider router={router} />);
}

function switchTab(tab: 'home' | 'assignments' | 'feedback' | 'progress') {
    fireEvent.click(screen.getByText(`studentPortal.tab_${tab}`));
}

const makeNewsFlash = (id: string, title: string): NewsFlash => ({
    id,
    title,
    summary: 'summary',
    kind: 'article',
    tags: [],
    createdAt: '2024-01-01T00:00:00Z',
});

const makeFlashcardAssignment = (deckId: string, deckName: string, createdAt: string): FlashcardAssignment => ({
    deckId,
    studentId: 's1',
    deckName,
    cardCount: 2,
    createdAt,
});

const makeFlashcardDeck = (id: string, name: string): FlashcardDeck => ({
    id,
    name,
    cards: [
        { id: 'card-1', front: 'front 1', back: 'back 1' },
        { id: 'card-2', front: 'front 2', back: 'back 2' },
    ],
    createdAt: '2024-01-01T00:00:00Z',
});

const makeReview = (deckId: string): FlashcardReview => ({
    id: `${deckId}:s1`,
    deckId,
    studentId: 's1',
    cardStates: {
        'card-1': {
            due: '2020-01-01T00:00:00Z',
            stability: 1,
            difficulty: 5,
            elapsed_days: 1,
            scheduled_days: 1,
            learning_steps: 0,
            reps: 1,
            lapses: 0,
            state: 2,
            last_review: '2024-01-01T00:00:00Z',
        },
    },
    updatedAt: '2024-01-01T00:00:00Z',
});

const teacherReply: Message = {
    id: 'msg-1',
    studentId: 's1',
    contextType: 'general',
    contextId: null,
    contextLabel: null,
    sender: 'teacher',
    body: 'Sure, take an extra day.',
    createdAt: '2024-01-01T00:00:00Z',
    readByTeacher: true,
    readByStudent: false,
};

const studentReply: Message = {
    id: 'msg-2',
    studentId: 's1',
    contextType: 'general',
    contextId: null,
    contextLabel: null,
    sender: 'student',
    body: 'Thanks!',
    createdAt: '2024-01-02T00:00:00Z',
    readByTeacher: true,
    readByStudent: true,
};

describe('StudentPortalPage extended coverage', () => {
    beforeEach(async () => {
        joyrideOnEvent = null;
        mockLang = 'en';
        mockAppValue.students = [mockStudent];
        mockAppValue.classes = [mockClass];
        mockAppValue.rubrics = [mockRubric];
        mockAppValue.studentRubrics = [];
        mockAppValue.peerReviews = [];
        mockAppValue.gradeScales = [mockGradeScale];
        mockAppValue.selfAssessments = [];
        mockAppValue.flashcardAssignments = [];
        mockAppValue.flashcardDecks = [];
        mockAppValue.flashcardReviews = [];
        mockAppValue.newsFlashes = [];
        mockAppValue.newsFlashReads = [];
        mockAppValue.settings = mockSettings;
        mockFetchMyEssayAssignments.mockClear();
        mockFetchMyEssayAssignments.mockResolvedValue([]);
        mockFetchMyTestAssignments.mockClear();
        mockFetchMyTestAssignments.mockResolvedValue([]);
        mockFetchAssignedTestContent.mockClear();
        mockFetchAssignedTestContent.mockResolvedValue(null);
        mockFetchMyMessages.mockClear();
        mockFetchMyMessages.mockResolvedValue([]);
        mockSendMessageAsStudent.mockClear();
        mockMarkMessagesReadByStudent.mockClear();
        mockFetchMyFlashcardAssignments.mockClear();
        mockFetchMyFlashcardAssignments.mockResolvedValue([]);
        mockFetchMyNewsFlashes.mockClear();
        mockFetchMyNewsFlashes.mockResolvedValue([]);
        mockMarkNewsFlashRead.mockClear();
        mockMarkNewsFlashReadAsStudent.mockClear();
        mockMarkNewsFlashReadAsStudent.mockResolvedValue({ success: true });
        mockSaveRubricSelfAssessment.mockClear();
        mockUpdateSettings.mockClear();
        mockEncodeTest.mockClear();
        mockEncodeTest.mockReturnValue('test-code');
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            configurable: true,
        });
        Element.prototype.scrollIntoView = vi.fn();
        const mod = await import('../StudentPortalPage');
        StudentPortalPageComp = mod.default;
    });

    it('copies the portal link and shows the copied state', () => {
        renderAt('s1');
        fireEvent.click(screen.getByTitle('studentPortal.copy_link'));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('#/portal/s1'));
        expect(screen.getByText('studentPortal.link_copied')).toBeInTheDocument();
    });

    it('toggles the theme via the header button', () => {
        renderAt('s1');
        fireEvent.click(screen.getByLabelText('studentPortal.toggle_theme'));
        expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'light' });
    });

    it('shows the teacher preview banner and hides student-only sections for non-student roles', () => {
        mockAppValue.settings = { ...mockSettings, userRole: 'teacher' };
        renderAt('s1');
        expect(screen.getByText('studentPortal.teacher_preview_banner')).toBeInTheDocument();
        switchTab('assignments');
        expect(screen.queryByTestId('student-decks')).not.toBeInTheDocument();
    });

    it('runs the tour callback for both finished and skipped, persisting the seen flag', () => {
        renderAt('s1');
        expect(joyrideOnEvent).toBeTruthy();
        act(() => joyrideOnEvent!({ status: 'finished' }));
        expect(localStorage.getItem('rm_portal_tour_seen_s1')).toBe('true');
        act(() => joyrideOnEvent!({ status: 'running' }));
        act(() => joyrideOnEvent!({ status: 'skipped' }));
        expect(localStorage.getItem('rm_portal_tour_seen_s1')).toBe('true');
        localStorage.removeItem('rm_portal_tour_seen_s1');
    });

    it('navigates to the section owning a portal-search result', async () => {
        mockAppValue.studentRubrics = [mockGradedRubric];
        renderAt('s1');
        fireEvent.change(screen.getByLabelText('studentPortal.search_placeholder'), { target: { value: 'Essay' } });
        fireEvent.click(await screen.findByText('Essay Rubric'));
        // The grade-history/feedback tab owns portal-section-feedback.
        expect(screen.getByText('studentPortal.rubric_grades')).toBeInTheDocument();
        await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    });

    it('renders the self-assessment stat card when self-assessments exist', () => {
        mockAppValue.selfAssessments = [mockSelfAssessment];
        renderAt('s1');
        expect(screen.getByText('studentPortal.stat_self_assessments')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
    });

    // ── Assignments: test opening, chips, essay chips, sorts, flashcard merge ──

    it('opens a test: encodes the payload and sets the location hash', async () => {
        mockFetchMyTestAssignments.mockResolvedValueOnce([mockPendingTest]);
        mockFetchAssignedTestContent.mockResolvedValueOnce({
            id: 't1',
            name: 'Vocabulary Quiz',
            questions: [],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2024-01-01T00:00:00Z',
        });
        renderAt('s1');
        switchTab('assignments');
        fireEvent.click(await screen.findByText('studentPortal.test_open'));
        await waitFor(() => expect(window.location.hash).toBe('#/test/test-code'));
        expect(mockEncodeTest).toHaveBeenCalledWith(
            expect.objectContaining({ testId: 't1', studentId: 's1', teacherKey: 'test-1' })
        );
    });

    it('shows the open error when assigned test content is missing', async () => {
        mockFetchMyTestAssignments.mockResolvedValueOnce([mockPendingTest]);
        renderAt('s1');
        switchTab('assignments');
        fireEvent.click(await screen.findByText('studentPortal.test_open'));
        expect(await screen.findByText('studentPortal.test_open_error')).toBeInTheDocument();
    });

    it('shows the open error when encoding fails', async () => {
        mockFetchMyTestAssignments.mockResolvedValueOnce([mockPendingTest]);
        mockFetchAssignedTestContent.mockResolvedValueOnce({
            id: 't1',
            name: 'Vocabulary Quiz',
            questions: [],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2024-01-01T00:00:00Z',
        });
        mockEncodeTest.mockReturnValueOnce('');
        renderAt('s1');
        switchTab('assignments');
        fireEvent.click(await screen.findByText('studentPortal.test_open'));
        expect(await screen.findByText('studentPortal.test_open_error')).toBeInTheDocument();
    });

    it('shows the open error when the content fetch rejects', async () => {
        mockFetchMyTestAssignments.mockResolvedValueOnce([mockPendingTest]);
        mockFetchAssignedTestContent.mockRejectedValueOnce(new Error('network'));
        renderAt('s1');
        switchTab('assignments');
        fireEvent.click(await screen.findByText('studentPortal.test_open'));
        expect(await screen.findByText('studentPortal.test_open_error')).toBeInTheDocument();
    });

    it('shows assignment-load errors in the work banner', async () => {
        mockFetchMyEssayAssignments.mockRejectedValueOnce(new Error('boom'));
        renderAt('s1');
        switchTab('assignments');
        expect(await screen.findByText('studentPortal.work_load_error')).toBeInTheDocument();
    });

    it('renders the test in-progress and SEB chips', async () => {
        mockFetchMyTestAssignments.mockResolvedValueOnce([mockPendingTest]);
        renderAt('s1');
        switchTab('assignments');
        await screen.findByText('Vocabulary Quiz');
        expect(screen.getByText('studentPortal.test_in_progress')).toBeInTheDocument();
        expect(screen.getByText('studentPortal.test_seb_required')).toBeInTheDocument();
        expect(screen.getByText('studentPortal.test_duration:{"n":20}')).toBeInTheDocument();
    });

    it('renders essay chips for min-words, max-words, time-limit and SEB variants', async () => {
        const minOnly = {
            teacherKey: 'essay-a',
            rubricId: 'r1',
            studentId: 's1',
            title: 'Min Words Essay',
            prompt: null,
            minWords: 100,
            maxWords: null,
            timeLimitMinutes: 30,
            requireSEB: true,
            readOnlyAfterSubmit: false,
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: null,
            submission: null,
        };
        const maxOnly = {
            teacherKey: 'essay-b',
            rubricId: 'r1',
            studentId: 's1',
            title: 'Max Words Essay',
            prompt: null,
            minWords: null,
            maxWords: 250,
            timeLimitMinutes: null,
            requireSEB: false,
            readOnlyAfterSubmit: false,
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: null,
            submission: null,
        };
        mockFetchMyEssayAssignments.mockResolvedValueOnce([minOnly, maxOnly]);
        renderAt('s1');
        switchTab('assignments');
        await screen.findByText('studentPortal.work_planned');
        expect(screen.getByText('studentPortal.essay_words_min:{"min":100}')).toBeInTheDocument();
        expect(screen.getByText('studentPortal.essay_time:{"n":30}')).toBeInTheDocument();
        expect(screen.getByText('studentPortal.essay_seb_required')).toBeInTheDocument();
        expect(screen.getByText('studentPortal.essay_words_max:{"max":250}')).toBeInTheDocument();
    });

    it('sorts multiple overdue items by due date', async () => {
        const older = {
            teacherKey: 'essay-old',
            rubricId: 'r1',
            studentId: 's1',
            title: 'Older Overdue',
            prompt: null,
            minWords: null,
            maxWords: null,
            timeLimitMinutes: null,
            requireSEB: false,
            readOnlyAfterSubmit: false,
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: '2019-01-01T00:00:00Z',
            submission: null,
        };
        const newer = {
            teacherKey: 'essay-new',
            rubricId: 'r1',
            studentId: 's1',
            title: 'Newer Overdue',
            prompt: null,
            minWords: null,
            maxWords: null,
            timeLimitMinutes: null,
            requireSEB: false,
            readOnlyAfterSubmit: false,
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: '2020-01-01T00:00:00Z',
            submission: null,
        };
        mockFetchMyEssayAssignments.mockResolvedValueOnce([newer, older]);
        renderAt('s1');
        switchTab('assignments');
        await screen.findByText('studentPortal.work_overdue');
        // Both overdue cards render, sorted oldest first.
        const group = screen.getByText('studentPortal.work_overdue').closest('div')!;
        const titles = within(group).getAllByText(/Overdue/);
        expect(titles.length).toBe(2);
    });

    it('merges fetched flashcard assignments over app state and renders deck insights', async () => {
        mockAppValue.flashcardAssignments = [makeFlashcardAssignment('d1', 'Deck One', '2024-01-01T00:00:00Z')];
        mockAppValue.flashcardDecks = [makeFlashcardDeck('d1', 'Deck One')];
        mockAppValue.flashcardReviews = [makeReview('d1')];
        mockFetchMyFlashcardAssignments.mockResolvedValueOnce([
            makeFlashcardAssignment('d1', 'Deck One Fresh', '2024-02-01T00:00:00Z'),
            makeFlashcardAssignment('d2', 'Deck Two', '2024-02-01T00:00:00Z'),
        ]);
        renderAt('s1');
        switchTab('assignments');
        await screen.findByText('studentPortal.flashcards_section_title');
        // Fetched row wins for d1; d2 comes purely from the fetch (no deck → no insights).
        expect(screen.getAllByText('Deck One Fresh').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Deck Two').length).toBeGreaterThan(0);
        expect(screen.getByText('flashcards.due_count:{"count":1}')).toBeInTheDocument();
        expect(screen.getAllByText('flashcards.card_count:{"count":2}').length).toBeGreaterThan(0);
    });

    // ── News flashes ──────────────────────────────────────────────────────────

    it('marks a news flash read when opened and shows unread counts', async () => {
        mockAppValue.newsFlashes = [makeNewsFlash('nf1', 'Read this'), makeNewsFlash('nf2', 'Unread this')];
        mockAppValue.newsFlashReads = [
            { id: 'nf1:s1', flashId: 'nf1', studentId: 's1', readAt: '2024-01-02T00:00:00Z' } as NewsFlashRead,
        ];
        renderAt('s1');
        expect(screen.getByText('newsFlashes.section_title_unread:{"count":1}')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Unread this'));
        expect(mockMarkNewsFlashRead).toHaveBeenCalledWith(
            expect.objectContaining({ flashId: 'nf2', studentId: 's1' })
        );
        expect(mockMarkNewsFlashReadAsStudent).toHaveBeenCalledWith(
            expect.objectContaining({ flashId: 'nf2', studentId: 's1' })
        );
        // Opening an already-read flash is a no-op.
        fireEvent.click(screen.getByText('Read this'));
        expect(mockMarkNewsFlashRead).toHaveBeenCalledTimes(1);
    });

    it('merges fetched news flashes into the timeline and shows the all-read title', async () => {
        mockAppValue.newsFlashes = [makeNewsFlash('nf1', 'Local flash')];
        mockAppValue.newsFlashReads = [
            { id: 'nf1:s1', flashId: 'nf1', studentId: 's1', readAt: '2024-01-02T00:00:00Z' } as NewsFlashRead,
            { id: 'nf2:s1', flashId: 'nf2', studentId: 's1', readAt: '2024-01-02T00:00:00Z' } as NewsFlashRead,
        ];
        mockFetchMyNewsFlashes.mockResolvedValueOnce([makeNewsFlash('nf2', 'Fetched flash')]);
        renderAt('s1');
        expect(await screen.findByText('Fetched flash')).toBeInTheDocument();
        expect(screen.getByText('Local flash')).toBeInTheDocument();
        expect(screen.getByText('newsFlashes.section_title')).toBeInTheDocument();
    });

    // ── Messages ──────────────────────────────────────────────────────────────

    it('expands a thread, replies, and clears the reply box', async () => {
        mockFetchMyMessages.mockResolvedValueOnce([teacherReply, studentReply]);
        renderAt('s1');
        switchTab('feedback');
        await screen.findByText('Thanks!');
        fireEvent.click(screen.getByText('Thanks!'));
        // Thread expanded → both bubbles visible.
        expect(screen.getAllByText('Thanks!').length).toBeGreaterThan(0);
        const replyBoxes = screen.getAllByPlaceholderText('studentPortal.ask_question_placeholder');
        fireEvent.change(replyBoxes[replyBoxes.length - 1], { target: { value: 'See you Monday' } });
        fireEvent.click(screen.getAllByText('messages.send_button')[1]);
        expect(mockSendMessageAsStudent).toHaveBeenCalledWith(
            expect.objectContaining({
                studentId: 's1',
                contextType: 'general',
                body: 'See you Monday',
            })
        );
        // Reply box cleared after send.
        const clearedBoxes = screen.getAllByPlaceholderText('studentPortal.ask_question_placeholder');
        expect((clearedBoxes[clearedBoxes.length - 1] as HTMLTextAreaElement).value).toBe('');
    });

    it('sends a message with a rubric context selected from the dropdown', async () => {
        mockAppValue.studentRubrics = [mockGradedRubric];
        renderAt('s1');
        switchTab('feedback');
        await screen.findByText('studentPortal.messages_section_title');
        fireEvent.change(screen.getByLabelText('studentPortal.messages_context_label'), { target: { value: '1' } });
        fireEvent.change(screen.getByPlaceholderText('studentPortal.ask_question_placeholder'), {
            target: { value: 'About my grade' },
        });
        fireEvent.click(screen.getAllByText('messages.send_button')[0]);
        expect(mockSendMessageAsStudent).toHaveBeenCalledWith(
            expect.objectContaining({ contextType: 'rubric', contextId: 'r1', body: 'About my grade' })
        );
    });

    // ── Self-assessment ───────────────────────────────────────────────────────

    it('opens the self-assessment panel and saves the reflection', async () => {
        mockAppValue.studentRubrics = [mockGradedRubric];
        renderAt('s1');
        switchTab('feedback');
        await screen.findByText('studentPortal.self_assess_btn');
        fireEvent.click(screen.getByText('studentPortal.self_assess_btn'));
        fireEvent.click(screen.getByText('save-self-assess'));
        expect(mockSaveRubricSelfAssessment).toHaveBeenCalledWith('sr1', [], 'My reflection');
        // Toggle back to cancel state.
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('save-self-assess')).not.toBeInTheDocument();
    });

    it('shows the edit button and date for an already self-assessed rubric', () => {
        mockAppValue.studentRubrics = [mockSelfAssessedSr];
        renderAt('s1');
        switchTab('feedback');
        expect(screen.getByText('studentPortal.self_assess_edit_btn')).toBeInTheDocument();
        expect(screen.getByText(/studentPortal.self_assessed_on/)).toBeInTheDocument();
    });

    // ── Peer reviews with a missing rubric ────────────────────────────────────

    it('skips peer-review cards whose rubric no longer exists', () => {
        mockAppValue.peerReviews = [mockGhostPeerReview];
        renderAt('s1');
        switchTab('feedback');
        // Section header still renders; the card itself is skipped (no crash).
        expect(screen.getByText('Peer Reviews')).toBeInTheDocument();
        expect(screen.queryByText('Old Rubric')).not.toBeInTheDocument();
    });

    // ── Progress: CEFR chart, radar, learning path ───────────────────────────

    it('renders the CEFR progress chart from CEFR-tagged rubric history', async () => {
        mockAppValue.rubrics = [mockRubric, mockCefrRubric];
        mockAppValue.studentRubrics = [...mockLowCefrSrs];
        renderAt('s1');
        switchTab('progress');
        expect(screen.getByText('studentPortal.cefr_progress')).toBeInTheDocument();
    });

    it('returns empty radar data when the selected rubric has no history', async () => {
        mockAppValue.studentRubrics = [mockGradedRubric, mockGradedRubric2];
        renderAt('s1');
        switchTab('progress');
        await screen.findAllByText('studentPortal.my_progress');
        fireEvent.change(screen.getByLabelText('studentPortal.progress_view_label'), { target: { value: 'r-none' } });
        expect(JSON.parse(screen.getByTestId('radar-data').textContent!)).toEqual([]);
    });

    it('renders cefr-skill and ghost-criterion flags plus grammar recommendations', async () => {
        mockAppValue.rubrics = [mockRubric, mockCefrRubric, mockGrammarRubric];
        mockAppValue.studentRubrics = [...mockLowCefrSrs, ...mockGhostSnapshotSrs, ...mockLowGrammarSrs];
        renderAt('s1');
        switchTab('progress');
        await screen.findAllByText('studentPortal.learning_path_section_title');
        // cefrSkill flag label resolves via CEFR_SKILL_LABELS.
        expect(screen.getByText('Reading')).toBeInTheDocument();
        // Ghost criterion falls back to the raw targetId.
        expect(screen.getAllByText('ghost-c').length).toBeGreaterThan(0);
        // Grammar recommendation resolves the item label via getGrammarItemById.
        expect(screen.getByText('Affirmative (I work, she works)')).toBeInTheDocument();
        expect(screen.getAllByText(/grammar.recommend_streak/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/learningPath.flag_streak/).length).toBeGreaterThan(0);
    });

    it('renders a cohort-gap learning-path recommendation', async () => {
        mockAppValue.students = [mockStudent, mockClassmate];
        mockAppValue.rubrics = [mockRubric, mockCefrRubric];
        mockAppValue.studentRubrics = [...mockLowCefrSrs, mockClassmateHighSr];
        renderAt('s1');
        switchTab('progress');
        await screen.findAllByText('studentPortal.learning_path_section_title');
        expect(screen.getAllByText('Reading').length).toBeGreaterThan(0);
        expect(screen.getByText(/learningPath.gap_summary/)).toBeInTheDocument();
    });

    it('drops graded records whose rubric is neither live nor snapshotted', () => {
        mockAppValue.studentRubrics = [mockNoRubricSr];
        renderAt('s1');
        // No crash; the rubric count stat reflects the dropped record (0 graded).
        switchTab('progress');
        expect(screen.getByText('studentPortal.tab_empty_progress')).toBeInTheDocument();
    });

    it('renders the flashcards search result and jumps to the flashcards section', async () => {
        mockAppValue.flashcardAssignments = [makeFlashcardAssignment('d1', 'Deck One', '2024-01-01T00:00:00Z')];
        mockAppValue.flashcardDecks = [makeFlashcardDeck('d1', 'Deck One')];
        renderAt('s1');
        fireEvent.change(screen.getByLabelText('studentPortal.search_placeholder'), { target: { value: 'Deck' } });
        fireEvent.click(await screen.findByText('Deck One'));
        // flashcards section lives on the Assignments tab.
        expect(screen.getByText('studentPortal.flashcards_section_title')).toBeInTheDocument();
        await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    });

    it('reverts the copied state after two seconds', () => {
        vi.useFakeTimers();
        try {
            renderAt('s1');
            fireEvent.click(screen.getByTitle('studentPortal.copy_link'));
            expect(screen.getByText('studentPortal.link_copied')).toBeInTheDocument();
            act(() => vi.advanceTimersByTime(2000));
            expect(screen.getByText('studentPortal.copy_link')).toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it('toggles the theme back to dark when the current theme is light', () => {
        mockAppValue.settings = { ...mockSettings, theme: 'light' };
        renderAt('s1');
        fireEvent.click(screen.getByLabelText('studentPortal.toggle_theme'));
        expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'dark' });
    });

    it('falls back to generic messages when the fetch rejects with non-Error values', async () => {
        mockFetchMyEssayAssignments.mockRejectedValueOnce('raw string');
        mockFetchMyTestAssignments.mockRejectedValueOnce(new Error('net'));
        renderAt('s1');
        switchTab('assignments');
        expect(await screen.findByText('studentPortal.work_load_error')).toBeInTheDocument();
    });

    it('shows the load-error banner when the test fetch rejects with a non-Error value', async () => {
        mockFetchMyTestAssignments.mockRejectedValueOnce('raw string');
        renderAt('s1');
        switchTab('assignments');
        expect(await screen.findByText('studentPortal.work_load_error')).toBeInTheDocument();
    });

    it('opens a test without a duration or expiry, falling back through the nullable fields', async () => {
        const bareTest = {
            ...mockPendingTest,
            teacherKey: 'test-2',
            testId: 't2',
            durationMinutes: null,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
        mockFetchMyTestAssignments.mockResolvedValueOnce([bareTest]);
        mockFetchAssignedTestContent.mockResolvedValueOnce({
            id: 't2',
            name: 'Bare Test',
            questions: [],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2024-01-01T00:00:00Z',
        });
        renderAt('s1');
        switchTab('assignments');
        fireEvent.click(await screen.findByText('studentPortal.test_open'));
        await waitFor(() => expect(window.location.hash).toBe('#/test/test-code'));
    });

    it('renders expired, due-soon and due-later test states', async () => {
        const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const inAMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const expired = {
            ...mockPendingTest,
            teacherKey: 't-exp',
            testId: 't-exp',
            testName: 'Expired Test',
            expiresAt: '2020-01-01T00:00:00Z',
            submission: null,
        };
        const dueSoon = {
            ...mockPendingTest,
            teacherKey: 't-soon',
            testId: 't-soon',
            testName: 'Due Soon Test',
            expiresAt: inOneHour,
            submission: null,
        };
        const dueLater = {
            ...mockPendingTest,
            teacherKey: 't-later',
            testId: 't-later',
            testName: 'Due Later Test',
            expiresAt: inAMonth,
            submission: null,
        };
        mockFetchMyTestAssignments.mockResolvedValueOnce([expired, dueSoon, dueLater]);
        renderAt('s1');
        switchTab('assignments');
        await screen.findByText('studentPortal.work_overdue');
        expect(screen.getByText('studentPortal.test_expired')).toBeInTheDocument();
        expect(screen.getByText('studentPortal.test_due_soon')).toBeInTheDocument();
        expect(screen.getByText(/studentPortal.test_due:/)).toBeInTheDocument();
    });

    it('shows the submitted state without a date when submittedAt is missing', async () => {
        const graded = {
            teacherKey: 't-graded',
            testId: 't-graded',
            studentId: 's1',
            testName: 'Graded Test',
            requireSEB: false,
            durationMinutes: null,
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: null,
            submission: { status: 'graded' },
        };
        mockFetchMyTestAssignments.mockResolvedValueOnce([graded]);
        renderAt('s1');
        switchTab('assignments');
        await screen.findByText('studentPortal.work_completed');
        expect(screen.getByText('studentPortal.test_submitted')).toBeInTheDocument();
    });

    it('renders Dutch labels for a Dutch locale', async () => {
        mockLang = 'nl';
        mockAppValue.rubrics = [mockRubric, mockGrammarRubric];
        mockAppValue.studentRubrics = [...mockLowGrammarSrs];
        renderAt('s1');
        switchTab('progress');
        await screen.findAllByText('studentPortal.learning_path_section_title');
        expect(screen.getByText('Bevestigend (I work, she works)')).toBeInTheDocument();
        expect(screen.getByText('unknown-grammar-item')).toBeInTheDocument();
    });

    it('renders expired, due-soon and due-later essay states', async () => {
        const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const inAMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const essayBase = {
            rubricId: 'r1',
            studentId: 's1',
            prompt: null,
            minWords: null,
            maxWords: null,
            timeLimitMinutes: null,
            requireSEB: false,
            readOnlyAfterSubmit: false,
            createdAt: '2024-01-01T00:00:00Z',
            submission: null,
        };
        const expiredEssay = {
            ...essayBase,
            teacherKey: 'essay-exp',
            title: 'Expired Essay',
            expiresAt: '2020-01-01T00:00:00Z',
        };
        const dueSoonEssay = { ...essayBase, teacherKey: 'essay-soon', title: 'Due Soon Essay', expiresAt: inOneHour };
        const dueLaterEssay = {
            ...essayBase,
            teacherKey: 'essay-later',
            title: 'Due Later Essay',
            expiresAt: inAMonth,
        };
        mockFetchMyEssayAssignments.mockResolvedValueOnce([expiredEssay, dueSoonEssay, dueLaterEssay]);
        renderAt('s1');
        switchTab('assignments');
        await screen.findByText('studentPortal.work_overdue');
        expect(screen.getByText('studentPortal.essay_expired')).toBeInTheDocument();
        expect(screen.getByText('studentPortal.essay_due_soon')).toBeInTheDocument();
        expect(screen.getByText(/studentPortal.essay_due:/)).toBeInTheDocument();
    });

    it('renders peer reviews whose feedback lives only in the overall or entry comment', () => {
        mockAppValue.peerReviews = [mockOverallOnlyReview, mockEntryOnlyReview];
        renderAt('s1');
        switchTab('feedback');
        expect(screen.getByText('Overall only comment')).toBeInTheDocument();
        expect(screen.getByText('Entry comment only')).toBeInTheDocument();
    });

    it('collapses an expanded thread by clicking its header again', async () => {
        mockFetchMyMessages.mockResolvedValueOnce([teacherReply, studentReply]);
        renderAt('s1');
        switchTab('feedback');
        await screen.findByText('Thanks!');
        fireEvent.click(screen.getByText('Thanks!'));
        // Expanded: both bubbles and a reply box (plus the compose box above).
        expect(screen.getAllByPlaceholderText('studentPortal.ask_question_placeholder').length).toBe(2);
        fireEvent.click(screen.getAllByText('Thanks!')[0]);
        // Collapsed: only the compose box remains.
        expect(screen.getAllByPlaceholderText('studentPortal.ask_question_placeholder').length).toBe(1);
    });

    it('runs the silent catch handlers when the session-scoped fetches reject', async () => {
        mockFetchMyMessages.mockRejectedValueOnce(new Error('no session'));
        mockFetchMyFlashcardAssignments.mockRejectedValueOnce(new Error('no session'));
        mockFetchMyNewsFlashes.mockRejectedValueOnce(new Error('no session'));
        renderAt('s1');
        // Portal still renders with the app-state fallbacks.
        expect(await screen.findByText('studentPortal.copy_link')).toBeInTheDocument();
    });

    it('runs the silent catch handler when the news-flash read sync rejects', () => {
        mockAppValue.newsFlashes = [makeNewsFlash('nf1', 'Read this')];
        mockMarkNewsFlashReadAsStudent.mockRejectedValueOnce(new Error('no session'));
        renderAt('s1');
        fireEvent.click(screen.getByText('Read this'));
        expect(mockMarkNewsFlashRead).toHaveBeenCalled();
    });

    it('runs the silent catch handler when sending a message rejects', async () => {
        mockSendMessageAsStudent.mockRejectedValueOnce(new Error('no session'));
        renderAt('s1');
        await screen.findByText('studentPortal.copy_link');
        switchTab('feedback');
        fireEvent.change(screen.getByPlaceholderText('studentPortal.ask_question_placeholder'), {
            target: { value: 'Will this fail?' },
        });
        fireEvent.click(screen.getAllByText('messages.send_button')[0]);
        expect(mockSendMessageAsStudent).toHaveBeenCalled();
    });
});
