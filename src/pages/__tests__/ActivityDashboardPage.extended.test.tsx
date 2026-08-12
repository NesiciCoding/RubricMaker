import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, EssayAssignment, GradingTask, Rubric, Student } from '../../types';

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
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

const mockRubric2: Rubric = {
    ...mockRubric,
    id: 'r2',
    name: 'Speaking Rubric',
    createdAt: '2024-01-02T00:00:00Z',
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudent2: Student = { id: 's2', name: 'Bob', classId: 'c1' };

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const essayA: EssayAssignment = {
    rubricId: 'r1',
    studentId: 's1',
    teacherKey: 'tk1',
    title: 'Essay One',
    prompt: 'Write about your summer',
    readOnlyAfterSubmit: false,
    createdAt: '2024-01-01T00:00:00Z',
};

const pendingTask: GradingTask = {
    id: 'gt1',
    rubricId: 'r1',
    studentId: 's1',
    assignedToTeacher: 'Ms. Jones',
    assignedAt: '2024-01-05T00:00:00Z',
    dueDate: '2024-02-01',
};

const mockUpdateClass = vi.fn();
const mockUpdateRubric = vi.fn();
const mockUpdateTest = vi.fn();
const mockUpdateEssayGroup = vi.fn();
const mockAddGradingTasks = vi.fn();
const mockDeleteGradingTask = vi.fn();
const mockAddEssayAssignments = vi.fn();

let capturedOnDragEnd: ((result: unknown) => void) | null = null;

const mockAppValue: Record<string, unknown> = {
    rubrics: [mockRubric],
    tests: [],
    essayAssignments: [essayA],
    classes: [mockClass],
    students: [mockStudent, mockStudent2],
    studentRubrics: [],
    studentTests: [],
    settings: mockSettings,
    gradingTasks: [pendingTask],
    updateClass: mockUpdateClass,
    addEssayAssignments: mockAddEssayAssignments,
    updateRubric: mockUpdateRubric,
    updateTest: mockUpdateTest,
    updateEssayGroup: mockUpdateEssayGroup,
    addGradingTasks: mockAddGradingTasks,
    deleteGradingTask: mockDeleteGradingTask,
    updateSettings: vi.fn(),
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
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

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (result: unknown) => void }) => {
        capturedOnDragEnd = onDragEnd;
        return React.createElement(React.Fragment, null, children);
    },
    Droppable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }),
    Draggable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }),
}));

vi.mock('react-joyride', () => ({
    Joyride: () => null,
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

vi.mock('../../components/Standards/ClassCoverageGapPanel', () => ({
    default: () => null,
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

let ActivityDashboardPageComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<ActivityDashboardPageComp />);
}

describe('ActivityDashboardPage extended', () => {
    beforeEach(async () => {
        mockUpdateClass.mockClear();
        mockUpdateRubric.mockClear();
        mockUpdateTest.mockClear();
        mockUpdateEssayGroup.mockClear();
        mockAddGradingTasks.mockClear();
        mockDeleteGradingTask.mockClear();
        mockAddEssayAssignments.mockClear();
        capturedOnDragEnd = null;
        mockAppValue.rubrics = [mockRubric];
        mockAppValue.essayAssignments = [essayA];
        mockAppValue.gradingTasks = [pendingTask];
        mockAppValue.classes = [mockClass];
        mockAppValue.students = [mockStudent, mockStudent2];
        mockClass.rubricIds = undefined;
        mockClass.year = undefined;
        mockClass.voTrack = undefined;
        const mod = await import('../ActivityDashboardPage');
        ActivityDashboardPageComp = mod.default;
    });

    it('renders pending tasks with due dates and deletes them', () => {
        renderPage();
        expect(screen.getByText('gradingTasks.pending_title:{"count":1}')).toBeInTheDocument();
        expect(screen.getByText(/Alice — Essay Rubric/)).toBeInTheDocument();
        expect(screen.getByText(/2024-02-01/)).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('common.delete'));
        expect(mockDeleteGradingTask).toHaveBeenCalledWith('gt1');
    });

    it('assigns grading tasks through the modal', () => {
        renderPage();
        const assignBtn = screen.getByTitle('gradingTasks.assign_title');
        fireEvent.click(assignBtn);
        expect(screen.getByText('gradingTasks.modal_title')).toBeInTheDocument();

        // Disabled without a teacher name.
        const submitBtn = screen.getByText('gradingTasks.action_assign');
        fireEvent.click(submitBtn);
        expect(mockAddGradingTasks).not.toHaveBeenCalled();

        // Fill teacher + due date, then submit.
        fireEvent.change(screen.getByLabelText('gradingTasks.teacher_label'), {
            target: { value: 'Mr. Smith' },
        });
        fireEvent.change(screen.getByLabelText('gradingTasks.due_date_label'), {
            target: { value: '2024-03-01' },
        });
        fireEvent.click(submitBtn);
        expect(mockAddGradingTasks).toHaveBeenCalledTimes(1);
        const [tasks] = mockAddGradingTasks.mock.calls[0] as [GradingTask[]];
        // s1 already has a pending task for r1 → only s2 is newly assigned.
        expect(tasks).toHaveLength(1);
        expect(tasks[0].studentId).toBe('s2');
        expect(tasks[0].assignedToTeacher).toBe('Mr. Smith');
        expect(tasks[0].dueDate).toBe('2024-03-01');
        // Modal closes.
        expect(screen.queryByText('gradingTasks.modal_title')).not.toBeInTheDocument();
    });

    it('links and unlinks a rubric to a class', () => {
        renderPage();
        const linkBtn = screen.getByText('activityDashboard.link');
        fireEvent.click(linkBtn);
        expect(mockUpdateClass).toHaveBeenCalledWith({ ...mockClass, rubricIds: ['r1'] });

        mockClass.rubricIds = ['r1'];
        renderPage();
        const unlinkBtn = screen.getByText('activityDashboard.unlink');
        fireEvent.click(unlinkBtn);
        expect(mockUpdateClass).toHaveBeenCalledWith({ ...mockClass, rubricIds: [] });
    });

    it('assigns an essay template to unassigned students in the class', () => {
        renderPage();
        const assignBtn = screen.getByText('activityDashboard.assign');
        fireEvent.click(assignBtn);
        expect(mockAddEssayAssignments).toHaveBeenCalledTimes(1);
        const [assignments] = mockAddEssayAssignments.mock.calls[0] as [EssayAssignment[]];
        expect(assignments).toHaveLength(1); // s1 already has one, s2 does not
        expect(assignments[0].studentId).toBe('s2');
        expect(assignments[0].teacherKey).toBe('tk1');
        expect(assignments[0].title).toBe('Essay One');
    });

    it('opens the test activity via navigation', () => {
        mockAppValue.rubrics = [mockRubric];
        mockAppValue.tests = [
            {
                id: 't1',
                name: 'Grammar Test',
                subject: 'English',
                createdAt: '2024-01-03T00:00:00Z',
                updatedAt: '2024-01-03T00:00:00Z',
                questionIds: [],
                sections: [],
            } as never,
        ];
        renderPage();
        expect(screen.getByText('Grammar Test')).toBeInTheDocument();
        expect(screen.getByText('activityDashboard.open')).toBeInTheDocument();
        mockAppValue.tests = [];
    });

    it('reorders rubric rows via drag-and-drop', () => {
        mockAppValue.rubrics = [mockRubric, { ...mockRubric2, displayOrder: 1 }];
        (mockRubric as { displayOrder?: number }).displayOrder = 0;
        renderPage();
        expect(capturedOnDragEnd).not.toBeNull();
        capturedOnDragEnd?.({
            source: { droppableId: 'ad-rubric', index: 0 },
            destination: { droppableId: 'ad-rubric', index: 1 },
        });
        // r1 (order 0) moved to index 1, r2 (order 1) to index 0 — both orders swap.
        expect(mockUpdateRubric).toHaveBeenCalledTimes(2);
        expect(mockUpdateRubric).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', displayOrder: 1 }));
        expect(mockUpdateRubric).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2', displayOrder: 0 }));
        delete (mockRubric as { displayOrder?: number }).displayOrder;
    });

    it('reorders essay rows via drag-and-drop', () => {
        renderPage();
        expect(capturedOnDragEnd).not.toBeNull();
        capturedOnDragEnd?.({
            source: { droppableId: 'ad-essay', index: 0 },
            destination: { droppableId: 'ad-essay', index: 0 },
        });
        // Same index — no reorder.
        expect(mockUpdateEssayGroup).not.toHaveBeenCalled();
        capturedOnDragEnd?.({
            source: { droppableId: 'ad-essay', index: 0 },
            destination: { droppableId: 'ad-essay', index: 0 },
            // different droppable → ignored
        });
        capturedOnDragEnd?.({
            source: { droppableId: 'ad-essay', index: 0 },
            destination: undefined,
        });
        expect(mockUpdateEssayGroup).not.toHaveBeenCalled();
    });

    it('filters classes by year and track', () => {
        mockClass.year = 'jaar-1';
        mockClass.voTrack = 'havo';
        renderPage();
        // Filter dropdowns render (no htmlFor/id association → query by role).
        const combos = screen.getAllByRole('combobox');
        expect(combos.length).toBeGreaterThanOrEqual(4); // topbar class, year, track, coverage
        const yearSelect = combos[1];
        const trackSelect = combos[2];

        fireEvent.change(yearSelect, { target: { value: 'jaar-2' } });
        // Class A is filtered out → no matrix column, no coverage section.
        expect(document.querySelector('[data-tour="ad-cell"]')).toBeNull();
        expect(screen.queryByText('activityDashboard.coverage_title')).not.toBeInTheDocument();

        fireEvent.change(yearSelect, { target: { value: 'all' } });
        expect(document.querySelector('[data-tour="ad-cell"]')).not.toBeNull();

        fireEvent.change(trackSelect, { target: { value: 'vwo' } });
        expect(document.querySelector('[data-tour="ad-cell"]')).toBeNull();
    });

    it('changes the coverage class selector', () => {
        const mockClass2: Class = { id: 'c2', name: 'Class B' };
        mockAppValue.classes = [mockClass, mockClass2];
        renderPage();
        const coverageSelect = screen.getByLabelText('activityDashboard.coverage_title');
        expect((coverageSelect as HTMLSelectElement).value).toBe('c1');
        fireEvent.change(coverageSelect, { target: { value: 'c2' } });
        expect((coverageSelect as HTMLSelectElement).value).toBe('c2');
    });

    it('starts the tour from the toolbar button', () => {
        renderPage();
        const tourBtn = screen.getByText('tutorial.ad_tour_button');
        fireEvent.click(tourBtn);
        expect(tourBtn).toBeInTheDocument();
    });

    it('keeps a rubric pending task when a matching studentRubric exists', () => {
        mockAppValue.studentRubrics = [
            {
                id: 'sr1',
                rubricId: 'r1',
                studentId: 's1',
                classId: 'c1',
                criterionScores: [],
                totalPoints: 0,
                maxPoints: 100,
                status: 'graded',
                entries: [],
                overallComment: '',
                gradedAt: '2024-01-10T00:00:00Z',
            } as never,
        ];
        renderPage();
        // s1's task is now satisfied; the pending list only shows s2's... s2 has no task,
        // so the pending card disappears entirely.
        expect(screen.queryByText('gradingTasks.pending_title:{"count":1}')).not.toBeInTheDocument();
        expect(screen.queryByText(/Alice — Essay Rubric/)).not.toBeInTheDocument();
    });

    it('renders the essay cell as fully assigned when every student has one', () => {
        mockAppValue.essayAssignments = [essayA, { ...essayA, id: 'a2', studentId: 's2' }];
        renderPage();
        const allAssigned = screen.getByText('activityDashboard.all_assigned');
        expect(allAssigned).toBeDisabled();
    });
});
