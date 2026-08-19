import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { Rubric, StudentRubric, EssaySubmission, FlashcardDeck, GradeScale, Student, Class } from '../../types';

const mockNavigate = vi.fn();
const mockShowToast = vi.fn();
const mockDeleteUserTemplate = vi.fn();
const mockSendMessage = vi.fn();
const mockNotifyStudentMessage = vi.fn();
const mockAddFlashcardAssignments = vi.fn();
const mockGetGrammarRecommendations = vi.fn();

let store: Record<string, unknown>;

const baseRubric: Rubric = {
    id: 'r1',
    name: 'Writing Task',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'c1',
            title: 'Grammar',
            description: '',
            weight: 100,
            levels: [{ id: 'l1', label: 'Low', minPoints: 0, maxPoints: 10, description: '', subItems: [] }],
        },
    ],
    gradeScaleId: 'none',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2026-06-20T00:00:00Z',
    updatedAt: '2026-06-21T00:00:00Z',
    totalMaxPoints: 10,
    scoringMode: 'weighted-percentage',
    cefrSkill: 'writing',
};

const gradeScale: GradeScale = {
    id: 'gs1',
    name: 'Default',
    type: 'percentage',
    ranges: [{ min: 0, max: 100, label: 'P', color: '#000' }],
};

const studentA: Student = { id: 's1', name: 'Alice Smith', classId: 'c1', updatedAt: '2026-06-26T00:00:00Z' };
const studentB: Student = { id: 's2', name: 'Bob Jones', classId: 'c1', updatedAt: '2026-06-20T00:00:00Z' };
const archivedStudent: Student = { id: 's3', name: 'Cleo', classId: 'c1', archivedAt: '2026-06-01T00:00:00Z' };
const studentDana: Student = { id: 's4', name: 'Dana Lee', classId: 'c-missing' };
const studentEve: Student = { id: 's5', name: 'Eve Gray', classId: 'c1', updatedAt: '2026-06-24T00:00:00Z' };
const ghostStudentId = 's-ghost';

const cls: Class = { id: 'c1', name: 'Class 4B' };

function sr(overrides: Partial<StudentRubric>): StudentRubric {
    return {
        id: 'sr-x',
        rubricId: 'r1',
        studentId: 's1',
        entries: [{ criterionId: 'c1', levelId: null, checkedSubItems: [], comment: '' }],
        overallComment: '',
        isPeerReview: false,
        ...overrides,
    };
}

function submission(overrides: Partial<EssaySubmission>): EssaySubmission {
    return {
        id: 'e-x',
        assignmentRubricId: 'r2',
        assignmentStudentId: 's1',
        content: 'text',
        status: 'submitted',
        submittedAt: '2026-06-25T00:00:00Z',
        ...overrides,
    } as unknown as EssaySubmission;
}

function makeStore(): Record<string, unknown> {
    const lowGradeA = sr({
        id: 'sr-a',
        studentId: 's1',
        entries: [{ criterionId: 'c1', levelId: null, overridePoints: 4, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-18T00:00:00Z',
    });
    const lowGradeB = sr({
        id: 'sr-b',
        studentId: 's1',
        entries: [{ criterionId: 'c1', levelId: null, overridePoints: 5, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-17T00:00:00Z',
    });
    const mediumGrade = sr({
        id: 'sr-c',
        studentId: 's2',
        entries: [{ criterionId: 'c1', levelId: null, overridePoints: 9, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-10T00:00:00Z',
    });
    const snapshotGrade = sr({
        id: 'sr-d',
        rubricId: 'r-missing',
        studentId: 's2',
        entries: [{ criterionId: 'c1', levelId: null, overridePoints: 8, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-11T00:00:00Z',
        rubricSnapshot: { ...baseRubric, id: 'r-missing', gradeScaleId: 'gs1' },
    });
    const completed = sr({
        id: 'sr-e',
        studentId: 's2',
        entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-20T00:00:00Z',
    });
    const incomplete = sr({
        id: 'sr-f',
        studentId: 's2',
        entries: [{ criterionId: 'c1', levelId: null, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-21T00:00:00Z',
    });
    const deleted = sr({ id: 'sr-g', studentId: 's1', deletedAt: '2026-06-01T00:00:00Z' });
    // Rubric not found and student not found → fallback name paths in recent activity.
    const ghostGrade = sr({
        id: 'sr-h',
        rubricId: 'r-missing',
        studentId: ghostStudentId,
        entries: [{ criterionId: 'c1', levelId: null, overridePoints: 3, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-24T12:00:00Z',
    });
    const ghostGrade2 = sr({
        id: 'sr-l',
        studentId: ghostStudentId,
        entries: [{ criterionId: 'c1', levelId: null, overridePoints: 3, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-14T00:00:00Z',
    });
    // A rubric with gradeScaleId 'none' → scale lookup resolved to null directly.
    const noScaleGrade = sr({
        id: 'sr-i',
        rubricId: 'r4',
        studentId: 's1',
        entries: [{ criterionId: 'c1', levelId: null, overridePoints: 7, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-16T00:00:00Z',
    });
    // A rubric with a scale id missing from gradeScales → `?? null` fallback.
    const missingScaleGrade = sr({
        id: 'sr-j1',
        rubricId: 'r3',
        studentId: 's4',
        entries: [{ criterionId: 'c1', levelId: null, overridePoints: 3, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-26T00:00:00Z',
    });
    const missingScaleGrade2 = sr({
        id: 'sr-j2',
        rubricId: 'r4',
        studentId: 's4',
        entries: [{ criterionId: 'c1', levelId: null, overridePoints: 3, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-26T00:00:00Z',
    });
    // Not handed in → skipped by the at-risk aggregation.
    const notHandedIn = sr({ id: 'sr-k', studentId: 's4', notHandedIn: true });
    // A graded student who is not at risk.
    const safeGrade = sr({
        id: 'sr-n',
        studentId: 's5',
        entries: [{ criterionId: 'c1', levelId: null, overridePoints: 8, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-24T00:00:00Z',
    });
    // A second below-threshold grade for the ghost student → the at-risk check runs
    // but the student is not in the list (feedbackAge still tracks them).
    const ghostGrade3 = sr({
        id: 'sr-q',
        studentId: ghostStudentId,
        entries: [{ criterionId: 'c1', levelId: null, overridePoints: 3, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-13T00:00:00Z',
    });
    // Rubric with an empty gradeScaleId → falls back to the default scale's id.
    const blankScaleGrade = sr({
        id: 'sr-r',
        rubricId: 'r6',
        studentId: 's5',
        entries: [{ criterionId: 'c1', levelId: null, overridePoints: 8, checkedSubItems: [], comment: '' }],
        gradedAt: '2026-06-23T00:00:00Z',
    });

    const deck: FlashcardDeck = {
        id: 'deck-g',
        name: 'Grammar Deck',
        cards: [],
        createdAt: '2026-06-01T00:00:00Z',
    } as unknown as FlashcardDeck;

    return {
        students: [studentA, studentB, archivedStudent, studentDana, studentEve],
        studentRubrics: [
            lowGradeA,
            lowGradeB,
            mediumGrade,
            snapshotGrade,
            completed,
            incomplete,
            deleted,
            ghostGrade,
            ghostGrade2,
            noScaleGrade,
            missingScaleGrade,
            missingScaleGrade2,
            notHandedIn,
            safeGrade,
            ghostGrade3,
            blankScaleGrade,
        ],
        classes: [cls],
        rubrics: [
            { ...baseRubric, gradeScaleId: 'gs1' },
            { ...baseRubric, id: 'r2', name: 'Essay Draft', updatedAt: '2026-06-01T00:00:00Z', cefrSkill: undefined },
            {
                ...baseRubric,
                id: 'r3',
                name: 'Essay Plan',
                gradeScaleId: 'gs-missing',
                updatedAt: '2026-06-02T00:00:00Z',
            },
            {
                ...baseRubric,
                id: 'r4',
                name: 'No Scale Task',
                gradeScaleId: 'none',
                updatedAt: '2026-06-03T00:00:00Z',
                cefrSkill: undefined,
            },
            {
                ...baseRubric,
                id: 'r5',
                name: 'Fresh Essay',
                gradeScaleId: 'none',
                updatedAt: '2026-06-05T00:00:00Z',
                cefrSkill: undefined,
            },
            {
                ...baseRubric,
                id: 'r6',
                name: 'Blank Scale Task',
                gradeScaleId: undefined as unknown as string,
                updatedAt: '2026-06-06T00:00:00Z',
                cefrSkill: undefined,
            },
        ],
        gradeScales: [gradeScale],
        userTemplates: [
            { id: 'tpl1', name: 'My Template', subject: 'English', criteria: [], savedAt: '2026-06-01T00:00:00Z' },
            { id: 'tpl2', name: 'Plain Template', criteria: [], savedAt: '2026-06-02T00:00:00Z' },
        ],
        studentTests: [],
        tests: [],
        essaySubmissions: [
            submission({
                id: 'e2',
                assignmentRubricId: 'r5',
                assignmentStudentId: 's1',
                submittedAt: '2026-06-25T00:00:00Z',
            }),
            submission({
                id: 'e4',
                assignmentRubricId: 'r5',
                assignmentStudentId: 's4',
                submittedAt: '2026-06-22T00:00:00Z',
            }),
            // Already graded (r1/s1 has a graded StudentRubric) → skipped.
            submission({
                id: 'e3',
                assignmentRubricId: 'r1',
                assignmentStudentId: 's1',
                submittedAt: '2026-06-26T00:00:00Z',
            }),
            // Older duplicate of e4's key → skipped by the byKey dedup.
            submission({
                id: 'e5',
                assignmentRubricId: 'r5',
                assignmentStudentId: 's4',
                submittedAt: '2026-06-20T00:00:00Z',
            }),
            // Rubric missing → skipped.
            submission({
                id: 'e6',
                assignmentRubricId: 'r-missing',
                assignmentStudentId: 's1',
                submittedAt: '2026-06-19T00:00:00Z',
            }),
            // Student missing → skipped.
            submission({
                id: 'e7',
                assignmentRubricId: 'r5',
                assignmentStudentId: 's-missing',
                submittedAt: '2026-06-19T00:00:00Z',
            }),
        ],
        flashcardDecks: [deck],
        settings: {
            theme: 'dark',
            language: 'en',
            defaultGradeScaleId: 'gs1',
            activeClassId: null,
            notifyStudentsOnMessage: true,
        },
    };
}

vi.mock('../../context/AppContext', () => ({
    useRoster: () => ({ settings: store.settings, classes: store.classes, updateSettings: vi.fn() }),
    useStudents: () => ({ settings: store.settings, classes: store.classes, updateSettings: vi.fn() }),
    useClasses: () => ({ settings: store.settings, classes: store.classes, updateSettings: vi.fn() }),
    useGrading: () => ({ settings: store.settings, classes: store.classes, updateSettings: vi.fn() }),
    useAuthoring: () => ({ deleteUserTemplate: mockDeleteUserTemplate }),
    useAssessment: () => ({}),
    useEssays: () => ({ sendMessage: mockSendMessage, notifyStudentMessage: mockNotifyStudentMessage }),
    useFlashcards: () => ({ addFlashcardAssignments: mockAddFlashcardAssignments }),
    useSettings: () => ({ settings: store.settings, classes: store.classes, updateSettings: vi.fn() }),
    usePlatform: () => ({ settings: store.settings, classes: store.classes, updateSettings: vi.fn() }),
}));

vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: Record<string, unknown>) => unknown) => selector(store),
}));

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../components/Layout/Topbar', () => ({
    default: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
        <div>
            {title}
            {actions}
        </div>
    ),
}));

vi.mock('../../utils/learningPathAggregator', () => ({
    getGrammarRecommendations: (...args: unknown[]) => mockGetGrammarRecommendations(...args),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

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

let DashboardComp: React.ComponentType;

async function renderPage() {
    const { default: Dashboard } = await import('../Dashboard');
    DashboardComp = Dashboard;
    return renderWithRouter(<DashboardComp />);
}

describe('Dashboard page', () => {
    beforeEach(() => {
        store = makeStore();
        mockNavigate.mockClear();
        mockShowToast.mockClear();
        mockDeleteUserTemplate.mockClear();
        mockSendMessage.mockClear();
        mockNotifyStudentMessage.mockClear();
        mockAddFlashcardAssignments.mockClear();
        mockGetGrammarRecommendations.mockReset();
        mockGetGrammarRecommendations.mockReturnValue([]);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders the greeting, stat cards, and header meta', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-28T09:00:00.000Z'));
        await renderPage();
        expect(screen.getByText('dashboard.greeting_morning')).toBeInTheDocument();
        expect(screen.getByText('dashboard.header_meta:{"rubrics":6,"classes":1,"students":4}')).toBeInTheDocument();
        expect(screen.getByText('dashboard.this_week')).toBeInTheDocument();
    });

    it('renders the afternoon and evening greetings', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-28T14:00:00.000Z'));
        await renderPage();
        expect(screen.getByText('dashboard.greeting_afternoon')).toBeInTheDocument();
        vi.setSystemTime(new Date('2026-06-28T20:00:00.000Z'));
        await renderPage();
        expect(screen.getByText('dashboard.greeting_evening')).toBeInTheDocument();
    });

    it('navigates from the stat cards and the keyboard-activated needs-grading card', async () => {
        await renderPage();
        fireEvent.click(screen.getByText('dashboard.rubrics'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics');
        fireEvent.click(screen.getByText('dashboard.students'));
        expect(mockNavigate).toHaveBeenCalledWith('/students');
        fireEvent.click(screen.getByText('dashboard.grades_submitted'));
        expect(mockNavigate).toHaveBeenCalledWith('/export');
        fireEvent.click(screen.getAllByText('dashboard.needs_grading')[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics');
        fireEvent.keyDown(screen.getAllByText('dashboard.needs_grading')[0], { key: 'Enter' });
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics');
        fireEvent.keyDown(screen.getAllByText('dashboard.needs_grading')[0], { key: 'a' });
        expect(mockNavigate).toHaveBeenCalledTimes(5);
    });

    it('navigates to /rubrics/new from the Topbar action and the view-queue link', async () => {
        await renderPage();
        fireEvent.click(screen.getByText('dashboard.new_rubric'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/new');
        fireEvent.click(screen.getByText('dashboard.view_queue'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics');
        fireEvent.keyDown(screen.getByText('dashboard.view_queue'), { key: 'Enter' });
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics');
        fireEvent.keyDown(screen.getByText('dashboard.view_queue'), { key: 'a' });
        expect(mockNavigate).toHaveBeenCalledTimes(3);
    });

    it('shows trend badges for items created within the last week', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-28T12:00:00.000Z'));
        await renderPage();
        expect(screen.getByText('dashboard.trend_none')).toBeInTheDocument();
        expect(screen.getAllByText('dashboard.trend_this_week:{"count":2}').length).toBe(2);
    });

    it('shows the trend-none badge when nothing changed this week', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
        await renderPage();
        expect(screen.getAllByText('dashboard.trend_none').length).toBeGreaterThan(0);
    });

    it('falls back to the first grade scale when the default id is unknown', async () => {
        store = {
            ...makeStore(),
            settings: { ...(store.settings as object), defaultGradeScaleId: 'nope' },
            gradeScales: [],
        };
        await renderPage();
        expect(screen.getAllByText('dashboard.trend_none').length).toBeGreaterThan(0);
    });

    it('lists needs-grading submissions with student, rubric, class and time-ago', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-28T12:00:00.000Z'));
        await renderPage();
        expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Fresh Essay').length).toBeGreaterThan(0);
        expect(screen.getByText('Class 4B')).toBeInTheDocument();
        expect(screen.getByText('dashboard.time_days_ago:{"count":3}')).toBeInTheDocument();
    });

    it('navigates from a needs-grading row by click and by keyboard', async () => {
        await renderPage();
        const rows = screen.getAllByRole('button', { name: /Fresh Essay/ });
        const row = rows[rows.length - 1];
        fireEvent.click(row);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r5/grade/s1');
        fireEvent.keyDown(row, { key: 'Enter' });
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r5/grade/s1');
        fireEvent.keyDown(row, { key: 'a' });
        expect(mockNavigate).toHaveBeenCalledTimes(2);
    });

    it('shows the needs-grading empty state when everything is graded', async () => {
        store = { ...makeStore(), essaySubmissions: [] };
        await renderPage();
        expect(screen.getByText('dashboard.needs_grading_empty')).toBeInTheDocument();
    });

    it('covers every time-ago bucket in the needs-grading list', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-28T12:00:00.000Z'));
        store = {
            ...makeStore(),
            essaySubmissions: [
                submission({
                    id: 'ta1',
                    assignmentRubricId: 'r5',
                    assignmentStudentId: 's4',
                    submittedAt: '2026-06-28T11:59:30.000Z',
                }),
                submission({
                    id: 'ta2',
                    assignmentRubricId: 'r5',
                    assignmentStudentId: 's1',
                    submittedAt: '2026-06-28T11:55:00.000Z',
                }),
                submission({
                    id: 'ta3',
                    assignmentRubricId: 'r5',
                    assignmentStudentId: 's5',
                    submittedAt: '2026-06-28T10:00:00.000Z',
                }),
            ],
        };
        await renderPage();
        expect(screen.getByText('dashboard.time_just_now')).toBeInTheDocument();
        expect(screen.getByText('dashboard.time_minutes_ago:{"count":5}')).toBeInTheDocument();
        expect(screen.getByText('dashboard.time_hours_ago:{"count":2}')).toBeInTheDocument();
    });

    it('renders the at-risk panel with percentage and feedback-age clock', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-28T12:00:00.000Z'));
        await renderPage();
        expect(screen.getByText('At-Risk Students')).toBeInTheDocument();
        expect(screen.getByText('40%')).toBeInTheDocument();
        // Feedback age is 10 days for the newest grade → red clock icon is shown.
        expect(screen.getByTitle('Last feedback 10 days ago')).toBeInTheDocument();
        // Bob's grades are 7 days old → yellow clock.
        expect(screen.getByTitle('Last feedback 7 days ago')).toBeInTheDocument();
    });

    it('navigates to grading from the at-risk student button', async () => {
        await renderPage();
        fireEvent.click(screen.getAllByTitle('Go to grading')[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1/grade/s1');
    });

    it('assigns the recommended grammar deck to an at-risk student', async () => {
        mockGetGrammarRecommendations.mockImplementation((studentId: string) =>
            studentId === 's1'
                ? [{ suggestedGrammarDeckIds: ['deck-g'], grammarItemIds: [], reason: 'x', severity: 1 }]
                : []
        );
        await renderPage();
        fireEvent.click(screen.getAllByLabelText('dashboard.at_risk_assign_deck')[0]);
        expect(mockAddFlashcardAssignments).toHaveBeenCalledWith([
            expect.objectContaining({ deckId: 'deck-g', studentId: 's1', deckName: 'Grammar Deck' }),
        ]);
        expect(mockShowToast).toHaveBeenCalledWith(
            'dashboard.at_risk_deck_assigned:{"deck":"Grammar Deck"}',
            'success'
        );
    });

    it('returns early when the recommended deck does not exist', async () => {
        mockGetGrammarRecommendations.mockImplementation((studentId: string) =>
            studentId === 's1'
                ? [{ suggestedGrammarDeckIds: ['deck-missing'], grammarItemIds: [], reason: 'x', severity: 1 }]
                : []
        );
        await renderPage();
        fireEvent.click(screen.getAllByLabelText('dashboard.at_risk_assign_deck')[0]);
        expect(mockAddFlashcardAssignments).not.toHaveBeenCalled();
    });

    it('sends an at-risk message and notifies the student', async () => {
        await renderPage();
        fireEvent.click(screen.getAllByLabelText('dashboard.at_risk_message')[0]);
        const input = screen.getByLabelText('dashboard.at_risk_message_placeholder');
        fireEvent.change(input, { target: { value: 'Please redo this task' } });
        fireEvent.click(screen.getByText('dashboard.at_risk_message_send'));
        expect(mockSendMessage).toHaveBeenCalledWith(
            expect.objectContaining({ studentId: 's1', body: 'Please redo this task' })
        );
        expect(mockNotifyStudentMessage).toHaveBeenCalledWith('s1', null, 'Please redo this task');
        expect(mockShowToast).toHaveBeenCalledWith('dashboard.at_risk_message_sent', 'success');
        expect(screen.queryByLabelText('dashboard.at_risk_message_placeholder')).not.toBeInTheDocument();
    });

    it('sends an at-risk message via the Enter key and skips empty messages', async () => {
        await renderPage();
        fireEvent.click(screen.getAllByLabelText('dashboard.at_risk_message')[0]);
        const input = screen.getByLabelText('dashboard.at_risk_message_placeholder');
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(mockSendMessage).not.toHaveBeenCalled();
        fireEvent.keyDown(input, { key: 'a' });
        expect(mockSendMessage).not.toHaveBeenCalled();
        fireEvent.change(input, { target: { value: 'Short message' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({ body: 'Short message' }));
    });

    it('skips the student notification when disabled in settings', async () => {
        store = { ...makeStore(), settings: { ...(store.settings as object), notifyStudentsOnMessage: false } };
        await renderPage();
        fireEvent.click(screen.getAllByLabelText('dashboard.at_risk_message')[0]);
        const input = screen.getByLabelText('dashboard.at_risk_message_placeholder');
        fireEvent.change(input, { target: { value: 'Quiet note' } });
        fireEvent.click(screen.getByText('dashboard.at_risk_message_send'));
        expect(mockSendMessage).toHaveBeenCalled();
        expect(mockNotifyStudentMessage).not.toHaveBeenCalled();
    });

    it('toggles the message composer off when clicked again', async () => {
        await renderPage();
        const button = screen.getAllByLabelText('dashboard.at_risk_message')[0];
        fireEvent.click(button);
        expect(screen.getByLabelText('dashboard.at_risk_message_placeholder')).toBeInTheDocument();
        fireEvent.click(button);
        expect(screen.queryByLabelText('dashboard.at_risk_message_placeholder')).not.toBeInTheDocument();
    });

    it('renders recent activity with grading and rubric-edit items and group headers', async () => {
        await renderPage();
        expect(screen.getAllByText(/Graded/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Updated/).length).toBeGreaterThan(0);
        expect(screen.getAllByText('dashboard.action_resume').length).toBeGreaterThan(0);
        expect(screen.getAllByText('dashboard.action_open').length).toBeGreaterThan(0);
        // Ghost student/rubric fallbacks render the placeholder name.
        expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('resumes grading and opens rubric from recent activity', async () => {
        await renderPage();
        const resumes = screen.getAllByText('dashboard.action_resume');
        // Newest-first feed: the s1/r1 grading item is last.
        fireEvent.click(resumes[resumes.length - 1]);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1/grade/s1');
        fireEvent.click(screen.getAllByText('dashboard.action_open')[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1');
    });

    it('shows the recent-activity empty state and creates the first rubric', async () => {
        store = { ...makeStore(), rubrics: [], studentRubrics: [] };
        await renderPage();
        expect(screen.getByText('dashboard.no_rubrics')).toBeInTheDocument();
        fireEvent.click(screen.getByText('dashboard.create_first'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/new');
    });

    it('renders the class CEFR card with criterion bars', async () => {
        await renderPage();
        expect(screen.getByText('dashboard.class_cefr_title')).toBeInTheDocument();
        // Most recently graded writing rubric (r3) → bars with criterion names.
        expect(screen.getByText('Grammar')).toBeInTheDocument();
        expect(screen.getByText('dashboard.class_cefr_sub_all:{"rubric":"Essay Plan"}')).toBeInTheDocument();
    });

    it('shows the scoped class name when an active class is selected', async () => {
        store = { ...makeStore(), settings: { ...(store.settings as object), activeClassId: 'c1' } };
        await renderPage();
        expect(
            screen.getByText('dashboard.class_cefr_sub_class:{"class":"Class 4B","rubric":"Writing Task"}')
        ).toBeInTheDocument();
    });

    it('shows the class CEFR empty state without graded writing rubrics', async () => {
        store = { ...makeStore(), rubrics: [{ ...baseRubric, cefrSkill: undefined }] };
        await renderPage();
        expect(screen.getByText('dashboard.class_cefr_empty')).toBeInTheDocument();
    });

    it('navigates from the quick actions', async () => {
        await renderPage();
        fireEvent.click(screen.getByText('dashboard.action_create_rubric'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/new');
        fireEvent.click(screen.getByText('dashboard.action_add_student'));
        expect(mockNavigate).toHaveBeenCalledWith('/students');
        fireEvent.click(screen.getByText('dashboard.action_upload_attachment'));
        expect(mockNavigate).toHaveBeenCalledWith('/attachments');
    });

    it('navigates with a template from a saved user template', async () => {
        await renderPage();
        fireEvent.click(screen.getByText('My Template'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/new', { state: { template: expect.any(Object) } });
    });

    it('deletes a user template without navigating', async () => {
        await renderPage();
        fireEvent.click(screen.getAllByTitle('dashboard.remove_template')[0]);
        expect(mockDeleteUserTemplate).toHaveBeenCalledWith('tpl1');
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates with a built-in template from quick start', async () => {
        await renderPage();
        fireEvent.click(screen.getByText('Analytical Essay Rubric'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/new', { state: { template: expect.any(Object) } });
    });

    it('hides the my-templates section when there are no user templates', async () => {
        store = { ...makeStore(), userTemplates: [] };
        await renderPage();
        expect(screen.queryByText('dashboard.my_templates')).not.toBeInTheDocument();
    });
});
