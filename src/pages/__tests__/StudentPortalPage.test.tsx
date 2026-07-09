import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type {
    AppSettings,
    Class,
    GradeScale,
    Rubric,
    Student,
    StudentRubric,
    StudentEssayAssignmentSummary,
    StudentTestAssignmentSummary,
    Message,
} from '../../types';

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

// Stable refs.
const mockStudentsArr = [mockStudent];
const mockClassesArr = [mockClass];
const mockGradeScalesArr = [mockGradeScale];
const emptyArr: never[] = [];

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

const mockGradedStudentRubric: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [
        { criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: 'Great work' },
        { criterionId: 'c2', levelId: 'l3', checkedSubItems: [], comment: '' },
        { criterionId: 'c3', levelId: 'l4', checkedSubItems: [], comment: '' },
    ],
    overallComment: 'Well done!',
    gradedAt: '2024-01-15T10:00:00Z',
    isPeerReview: false,
};

const mockGradedStudentRubric2: StudentRubric = {
    id: 'sr2',
    rubricId: 'r1',
    studentId: 's1',
    entries: [
        { criterionId: 'c1', levelId: 'l2', checkedSubItems: [], comment: '' },
        { criterionId: 'c2', levelId: 'l3', checkedSubItems: [], comment: '' },
        { criterionId: 'c3', levelId: 'l4', checkedSubItems: [], comment: '' },
    ],
    overallComment: '',
    gradedAt: '2024-02-15T10:00:00Z',
    isPeerReview: false,
    notHandedIn: false,
};

const mockRubricWithCriteria: Rubric = {
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
            ],
        },
        {
            id: 'c2',
            title: 'Structure',
            description: '',
            weight: 100,
            levels: [{ id: 'l3', label: 'Good', minPoints: 70, maxPoints: 89, description: '', subItems: [] }],
        },
        {
            id: 'c3',
            title: 'Grammar',
            description: '',
            weight: 100,
            levels: [{ id: 'l4', label: 'Good', minPoints: 70, maxPoints: 89, description: '', subItems: [] }],
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

const mockPeerReview: StudentRubric = {
    id: 'pr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: 'Good effort' }],
    overallComment: 'Nice peer review',
    gradedAt: '2024-01-16T10:00:00Z',
    isPeerReview: true,
};

const mockRubricsWithCriteriaArr = [mockRubricWithCriteria];
const mockGradedStudentRubricsArr = [mockGradedStudentRubric, mockGradedStudentRubric2];
const mockPeerReviewsArr = [mockPeerReview];
const mockSaveRubricSelfAssessment = vi.fn();

const mockAppValue: Record<string, unknown> = {
    students: mockStudentsArr,
    classes: mockClassesArr,
    rubrics: mockRubricsWithCriteriaArr,
    studentRubrics: emptyArr,
    peerReviews: emptyArr,
    gradeScales: mockGradeScalesArr,
    settings: mockSettings,
    selfAssessments: emptyArr,
    saveRubricSelfAssessment: mockSaveRubricSelfAssessment,
    fetchMyEssayAssignments: mockFetchMyEssayAssignments,
    fetchMyTestAssignments: mockFetchMyTestAssignments,
    fetchAssignedTestContent: mockFetchAssignedTestContent,
    fetchMyMessages: mockFetchMyMessages,
    sendMessageAsStudent: mockSendMessageAsStudent,
    markMessagesReadByStudent: mockMarkMessagesReadByStudent,
    flashcardAssignments: emptyArr,
    flashcardDecks: emptyArr,
    flashcardReviews: emptyArr,
    fetchMyFlashcardAssignments: mockFetchMyFlashcardAssignments,
    newsFlashes: emptyArr,
    newsFlashReads: emptyArr,
    fetchMyNewsFlashes: mockFetchMyNewsFlashes,
    markNewsFlashRead: mockMarkNewsFlashRead,
    markNewsFlashReadAsStudent: mockMarkNewsFlashReadAsStudent,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
}));

vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
            React.cloneElement(children, { width: 600, height: 300 }),
    };
});

vi.mock('react-joyride', () => ({
    Joyride: () => null,
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

vi.mock('../../services/database', () => ({
    loadSupabaseConfig: () => null,
    storageSync: { adapter: {} },
}));

vi.mock('../../utils/shareCode', () => ({
    encodeEssayAssignment: vi.fn(() => 'test-code'),
    encodeTestAssignment: vi.fn(() => 'test-code'),
}));

vi.mock('../../components/Statistics/CefrProgressChart', () => ({ default: () => null }));
vi.mock('../../components/Students/RubricSelfAssessPanel', () => ({ default: () => null }));
vi.mock('../../components/Statistics/CriterionRadarChart', () => ({
    default: ({ data }: { data: { name: string; avg: number }[] }) => (
        <div data-testid="radar-data">{JSON.stringify(data)}</div>
    ),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

let StudentPortalPageComp: React.ComponentType;

function renderAt(studentId: string) {
    const router = createMemoryRouter([{ path: '/portal/:studentId', element: <StudentPortalPageComp /> }], {
        initialEntries: [`/portal/${studentId}`],
    });
    return render(<RouterProvider router={router} />);
}

describe('StudentPortalPage', () => {
    beforeEach(async () => {
        mockFetchMyEssayAssignments.mockClear();
        mockFetchMyEssayAssignments.mockResolvedValue([]);
        mockFetchMyTestAssignments.mockClear();
        mockFetchMyTestAssignments.mockResolvedValue([]);
        mockFetchAssignedTestContent.mockClear();
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
        const mod = await import('../StudentPortalPage');
        StudentPortalPageComp = mod.default;
    });

    it('shows the not-found state for an unknown student', () => {
        renderAt('unknown');
        expect(screen.getByText('studentPortal.not_found')).toBeInTheDocument();
    });

    it('renders the portal for a known student', async () => {
        renderAt('s1');
        // Student name and rubric stats appear once the portal loads.
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        // The stat cards for the overview section render translation keys.
        expect(screen.getByText('studentPortal.stat_rubrics')).toBeInTheDocument();
    });

    it('calls fetchMyEssayAssignments on mount', () => {
        renderAt('s1');
        expect(mockFetchMyEssayAssignments).toHaveBeenCalledTimes(1);
    });

    it('renders grade history section when graded studentRubrics exist', () => {
        mockAppValue.studentRubrics = mockGradedStudentRubricsArr;
        renderAt('s1');
        // With 2 graded records history.length > 1, grade chart section renders
        expect(screen.getAllByText('studentPortal.grade_history').length).toBeGreaterThan(0);
        // rubric grades section also renders
        expect(screen.getAllByText('studentPortal.rubric_grades').length).toBeGreaterThan(0);
        // Rubric name appears in the grade list
        expect(screen.getAllByText('Essay Rubric').length).toBeGreaterThan(0);
        // overallComment from first graded record renders
        expect(screen.getByText('Well done!')).toBeInTheDocument();
        mockAppValue.studentRubrics = emptyArr;
    });

    it('renders peer reviews section when peer reviews exist', () => {
        mockAppValue.peerReviews = mockPeerReviewsArr;
        renderAt('s1');
        expect(screen.getByText('Nice peer review')).toBeInTheDocument();
        mockAppValue.peerReviews = emptyArr;
    });

    it('renders news flash section when newsFlashes exist', () => {
        mockAppValue.newsFlashes = [
            {
                id: 'nf1',
                title: 'Read this article',
                summary: 'A great read',
                kind: 'article',
                tags: ['vocabulary'],
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderAt('s1');
        expect(screen.getAllByText('Read this article').length).toBeGreaterThan(0);
        mockAppValue.newsFlashes = emptyArr;
    });

    it('renders copy link button', () => {
        renderAt('s1');
        expect(screen.getByText('studentPortal.copy_link')).toBeInTheDocument();
    });

    it('renders pending essay cards when fetchMyEssayAssignments returns data', async () => {
        const pendingEssay: StudentEssayAssignmentSummary = {
            teacherKey: 'essay-1',
            rubricId: 'r1',
            studentId: 's1',
            title: 'My Essay Title',
            prompt: 'Write something',
            minWords: 100,
            maxWords: 200,
            timeLimitMinutes: null,
            requireSEB: false,
            readOnlyAfterSubmit: false,
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: null,
            submission: null,
        };
        mockFetchMyEssayAssignments.mockResolvedValueOnce([pendingEssay]);
        renderAt('s1');
        expect(await screen.findByText('studentPortal.work_planned')).toBeInTheDocument();
        // Also appears as a context option in the "ask a question" composer.
        expect(screen.getAllByText('My Essay Title').length).toBeGreaterThan(0);
    });

    it('renders completed essay cards', async () => {
        const completedEssay: StudentEssayAssignmentSummary = {
            teacherKey: 'essay-2',
            rubricId: 'r1',
            studentId: 's1',
            title: 'Completed Essay',
            prompt: null,
            minWords: null,
            maxWords: null,
            timeLimitMinutes: null,
            requireSEB: false,
            readOnlyAfterSubmit: false,
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: null,
            submission: { submittedAt: '2024-01-10T10:00:00Z', wordCount: 250 },
        };
        mockFetchMyEssayAssignments.mockResolvedValueOnce([completedEssay]);
        renderAt('s1');
        expect(await screen.findByText('studentPortal.work_completed')).toBeInTheDocument();
        expect(screen.getAllByText('Completed Essay').length).toBeGreaterThan(0);
    });

    it('renders a planned test card when fetchMyTestAssignments returns data', async () => {
        const pendingTest: StudentTestAssignmentSummary = {
            teacherKey: 'test-1',
            testId: 't1',
            studentId: 's1',
            testName: 'Vocabulary Quiz',
            requireSEB: false,
            durationMinutes: 20,
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: null,
            submission: null,
        };
        mockFetchMyTestAssignments.mockResolvedValueOnce([pendingTest]);
        renderAt('s1');
        expect(await screen.findByText('studentPortal.work_planned')).toBeInTheDocument();
        expect(screen.getAllByText('Vocabulary Quiz').length).toBeGreaterThan(0);
        expect(screen.getByText('studentPortal.test_open')).toBeInTheDocument();
    });

    it("does not show another student's work — fetchMy*Assignments is session-scoped, not URL-scoped", async () => {
        // get_my_student_ids() (RLS) matches by the authenticated session's email, which can
        // resolve to more than one Student record (e.g. siblings sharing a login email) — the
        // portal must filter to its own studentId rather than trusting the fetch already did.
        const otherStudentsTest: StudentTestAssignmentSummary = {
            teacherKey: 'test-9',
            testId: 't9',
            studentId: 'other-student',
            testName: "Someone Else's Test",
            requireSEB: false,
            durationMinutes: null,
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: null,
            submission: null,
        };
        mockFetchMyTestAssignments.mockResolvedValueOnce([otherStudentsTest]);
        renderAt('s1');
        await screen.findByText('studentPortal.copy_link');
        expect(screen.queryByText("Someone Else's Test")).not.toBeInTheDocument();
    });

    it('groups an overdue essay separately from a completed test', async () => {
        const overdueEssay: StudentEssayAssignmentSummary = {
            teacherKey: 'essay-3',
            rubricId: 'r1',
            studentId: 's1',
            title: 'Late Essay',
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
        const submittedTest: StudentTestAssignmentSummary = {
            teacherKey: 'test-2',
            testId: 't2',
            studentId: 's1',
            testName: 'Grammar Test',
            requireSEB: false,
            durationMinutes: null,
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: null,
            submission: { status: 'submitted', submittedAt: '2024-01-10T10:00:00Z' },
        };
        mockFetchMyEssayAssignments.mockResolvedValueOnce([overdueEssay]);
        mockFetchMyTestAssignments.mockResolvedValueOnce([submittedTest]);
        renderAt('s1');
        expect(await screen.findByText('studentPortal.work_overdue')).toBeInTheDocument();
        expect(screen.getAllByText('Late Essay').length).toBeGreaterThan(0);
        expect(screen.getByText('studentPortal.work_completed')).toBeInTheDocument();
        expect(screen.getAllByText('Grammar Test').length).toBeGreaterThan(0);
    });

    it('renders the My Progress radar section once 3+ criteria have been graded', async () => {
        mockAppValue.studentRubrics = mockGradedStudentRubricsArr;
        renderAt('s1');
        expect((await screen.findAllByText('studentPortal.my_progress')).length).toBeGreaterThan(0);
        // Rubric picker offers the graded rubric alongside the combined view. Scoped to the
        // radar select itself since "Essay Rubric" also appears as a context option in the
        // "ask a question" composer now.
        expect(
            within(screen.getByLabelText('studentPortal.progress_view_label')).getByRole('option', {
                name: 'Essay Rubric',
            })
        ).toBeInTheDocument();
        expect(screen.getByText('studentPortal.progress_view_combined')).toBeInTheDocument();
        mockAppValue.studentRubrics = emptyArr;
    });

    it('aggregates every graded attempt of a rubric in the per-rubric radar view, not just the first', async () => {
        // Two StudentRubric records (sr1, sr2) both grade rubric r1's "Content" criterion at
        // different levels (l1: 90pts, l2: 70pts out of a 100-point max) — the per-rubric
        // radar must average both attempts (→ 80%), not just sr1's alone (→ 90%, the bug).
        mockAppValue.studentRubrics = mockGradedStudentRubricsArr;
        renderAt('s1');
        await screen.findAllByText('studentPortal.my_progress');

        fireEvent.change(screen.getByLabelText('studentPortal.progress_view_label'), { target: { value: 'r1' } });

        const radarData = JSON.parse((await screen.findByTestId('radar-data')).textContent!) as {
            name: string;
            avg: number;
        }[];
        const content = radarData.find((d) => d.name === 'Content');
        expect(content?.avg).toBe(80);
        mockAppValue.studentRubrics = emptyArr;
    });

    it('sends a general question to the teacher via the messages section', async () => {
        renderAt('s1');
        await screen.findByText('studentPortal.copy_link');
        fireEvent.change(screen.getByPlaceholderText('studentPortal.ask_question_placeholder'), {
            target: { value: 'Can I get an extension?' },
        });
        fireEvent.click(screen.getAllByText('messages.send_button')[0]);
        expect(mockSendMessageAsStudent).toHaveBeenCalledWith(
            expect.objectContaining({
                studentId: 's1',
                contextType: 'general',
                contextId: null,
                sender: 'student',
                body: 'Can I get an extension?',
            })
        );
    });

    it('marks unread teacher replies as read on load', async () => {
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
        mockFetchMyMessages.mockResolvedValueOnce([teacherReply]);
        renderAt('s1');
        await screen.findByText('Sure, take an extra day.');
        expect(mockMarkMessagesReadByStudent).toHaveBeenCalledWith(['msg-1']);
    });
});
