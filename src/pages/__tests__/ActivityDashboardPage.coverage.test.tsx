import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, EssayAssignment, GradingTask, Rubric, Student, Test } from '../../types';

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    displayOrder: 0,
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

const mockRubric2: Rubric = { ...mockRubric, id: 'r2', name: 'Speaking Rubric', displayOrder: 1 };

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockClass2: Class = { id: 'c2', name: 'Class B' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudent2: Student = { id: 's2', name: 'Bob', classId: 'c1' };
const mockStudent3: Student = { id: 's3', name: 'Carol', classId: 'c2' };

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockTest: Test = {
    id: 't1',
    name: 'Grammar Test',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
    questions: [],
    sections: [],
    requireSEB: false,
    shuffleQuestions: false,
    displayOrder: 0,
};
const mockTest2: Test = { ...mockTest, id: 't2', name: 'Reading Test', displayOrder: 1 };
const mockTest3: Test = { ...mockTest, id: 't3', name: 'Listening Test', displayOrder: 2 };

const essayA: EssayAssignment = {
    rubricId: 'r1',
    studentId: 's1',
    teacherKey: 'tk1',
    title: 'Essay One',
    prompt: 'Write about your summer',
    readOnlyAfterSubmit: false,
    createdAt: '2024-01-01T00:00:00Z',
    displayOrder: 0,
};
const essayB: EssayAssignment = { ...essayA, teacherKey: 'tk2', title: 'Essay Two', studentId: 's2', displayOrder: 1 };
const essayC: EssayAssignment = {
    ...essayA,
    teacherKey: 'tk3',
    title: 'Essay Three',
    studentId: 's3',
    displayOrder: 2,
};

const pendingTask: GradingTask = {
    id: 'gt1',
    rubricId: 'r1',
    studentId: 's1',
    assignedToTeacher: 'Ms. Jones',
    assignedAt: '2024-01-05T00:00:00Z',
    dueDate: '2024-02-01',
};

const {
    mockNavigate,
    mockUpdateClass,
    mockUpdateRubric,
    mockUpdateTest,
    mockUpdateEssayGroup,
    mockAddGradingTasks,
    mockAddEssayAssignments,
    mockDeleteGradingTask,
} = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockUpdateClass: vi.fn(),
    mockUpdateRubric: vi.fn(),
    mockUpdateTest: vi.fn(),
    mockUpdateEssayGroup: vi.fn(),
    mockAddGradingTasks: vi.fn(),
    mockAddEssayAssignments: vi.fn(),
    mockDeleteGradingTask: vi.fn(),
}));

let capturedOnDragEnd: ((result: unknown) => void) | null = null;
let capturedTourEvent: ((data: { status: string }) => void) | null = null;

const mockAppValue: Record<string, unknown> = {
    rubrics: [mockRubric],
    tests: [],
    essayAssignments: [],
    classes: [mockClass],
    students: [mockStudent, mockStudent2],
    studentRubrics: [],
    studentTests: [],
    settings: mockSettings,
    gradingTasks: [],
    updateClass: mockUpdateClass,
    addEssayAssignments: mockAddEssayAssignments,
    updateRubric: mockUpdateRubric,
    updateTest: mockUpdateTest,
    updateEssayGroup: mockUpdateEssayGroup,
    addGradingTasks: mockAddGradingTasks,
    deleteGradingTask: mockDeleteGradingTask,
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
vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: Record<string, unknown>) => unknown) => selector(mockAppValue),
    useStoreActions: () => mockAppValue,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
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
    Joyride: ({ onEvent }: { onEvent: (data: { status: string }) => void }) => {
        capturedTourEvent = onEvent;
        return null;
    },
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

describe('ActivityDashboardPage coverage', () => {
    beforeEach(async () => {
        mockNavigate.mockClear();
        mockUpdateClass.mockClear();
        mockUpdateRubric.mockClear();
        mockUpdateTest.mockClear();
        mockUpdateEssayGroup.mockClear();
        mockAddGradingTasks.mockClear();
        mockAddEssayAssignments.mockClear();
        mockDeleteGradingTask.mockClear();
        capturedOnDragEnd = null;
        capturedTourEvent = null;
        mockAppValue.rubrics = [mockRubric];
        mockAppValue.tests = [];
        mockAppValue.essayAssignments = [];
        mockAppValue.gradingTasks = [];
        mockAppValue.classes = [mockClass];
        mockAppValue.students = [mockStudent, mockStudent2];
        mockAppValue.studentRubrics = [];
        mockClass.rubricIds = undefined;
        const mod = await import('../ActivityDashboardPage');
        ActivityDashboardPageComp = mod.default;
    });

    it('navigates to the rubrics page from the empty state CTA', () => {
        mockAppValue.rubrics = [];
        renderPage();
        fireEvent.click(screen.getByText('activityDashboard.create_cta'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics');
    });

    it('navigates to the rubric, test, and essay activity rows', () => {
        mockAppValue.tests = [mockTest];
        mockAppValue.essayAssignments = [essayA];
        renderPage();
        fireEvent.click(screen.getByText('Essay Rubric'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1');
        fireEvent.click(screen.getByText('Grammar Test'));
        expect(mockNavigate).toHaveBeenCalledWith('/tests/t1');
        fireEvent.click(screen.getByText('Essay One'));
        expect(mockNavigate).toHaveBeenCalledWith('/essays/tk1');
    });

    it('navigates via the test-cell open button', () => {
        mockAppValue.tests = [mockTest];
        renderPage();
        fireEvent.click(screen.getByText('activityDashboard.open'));
        expect(mockNavigate).toHaveBeenCalledWith('/tests/t1');
    });

    it('reorders test rows via drag-and-drop, skipping unchanged orders', () => {
        mockAppValue.tests = [mockTest, mockTest2, mockTest3];
        renderPage();
        expect(capturedOnDragEnd).not.toBeNull();
        capturedOnDragEnd?.({
            source: { droppableId: 'ad-test', index: 0 },
            destination: { droppableId: 'ad-test', index: 1 },
        });
        // New order [t2, t1, t3] → t1 (0→1), t2 (1→0); t3 (2→2) unchanged → no update
        expect(mockUpdateTest).toHaveBeenCalledTimes(2);
        expect(mockUpdateTest).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', displayOrder: 1 }));
        expect(mockUpdateTest).toHaveBeenCalledWith(expect.objectContaining({ id: 't2', displayOrder: 0 }));
    });

    it('reorders essay rows via drag-and-drop', () => {
        mockAppValue.essayAssignments = [essayA, essayB, essayC];
        renderPage();
        capturedOnDragEnd?.({
            source: { droppableId: 'ad-essay', index: 0 },
            destination: { droppableId: 'ad-essay', index: 1 },
        });
        // New order [tk2, tk1, tk3] → tk1 (0→1), tk2 (1→0); tk3 (2→2) unchanged
        expect(mockUpdateEssayGroup).toHaveBeenCalledTimes(2);
        expect(mockUpdateEssayGroup).toHaveBeenCalledWith('tk1', { displayOrder: 1 });
        expect(mockUpdateEssayGroup).toHaveBeenCalledWith('tk2', { displayOrder: 0 });
    });

    it('reorders rubric rows and skips an already-correct display order', () => {
        mockAppValue.rubrics = [
            mockRubric,
            mockRubric2,
            { ...mockRubric, id: 'r3', name: 'Third Rubric', displayOrder: 2 },
        ];
        mockAppValue.students = [mockStudent];
        renderPage();
        capturedOnDragEnd?.({
            source: { droppableId: 'ad-rubric', index: 0 },
            destination: { droppableId: 'ad-rubric', index: 1 },
        });
        // New order [r2, r1, r3] → r1 (0→1), r2 (1→0); r3 (2→2) unchanged
        expect(mockUpdateRubric).toHaveBeenCalledTimes(2);
        expect(mockUpdateRubric).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', displayOrder: 1 }));
        expect(mockUpdateRubric).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2', displayOrder: 0 }));
    });

    it('ignores drags across different sections', () => {
        renderPage();
        capturedOnDragEnd?.({
            source: { droppableId: 'ad-rubric', index: 0 },
            destination: { droppableId: 'ad-test', index: 1 },
        });
        expect(mockUpdateRubric).not.toHaveBeenCalled();
        expect(mockUpdateTest).not.toHaveBeenCalled();
    });

    it('handles tour finish, skip, and non-terminal events', () => {
        renderPage();
        fireEvent.click(screen.getByText('tutorial.ad_tour_button'));
        expect(capturedTourEvent).not.toBeNull();
        capturedTourEvent?.({ status: 'running' });
        capturedTourEvent?.({ status: 'finished' });
        capturedTourEvent?.({ status: 'skipped' });
        // No crash and the button stays rendered
        expect(screen.getByText('tutorial.ad_tour_button')).toBeInTheDocument();
    });

    it('closes the assign modal via overlay, header close, and cancel', () => {
        renderPage();
        const assignBtn = screen.getByTitle('gradingTasks.assign_title');
        fireEvent.click(assignBtn);
        expect(screen.getByText('gradingTasks.modal_title')).toBeInTheDocument();
        fireEvent.click(document.querySelector('.modal-overlay') as HTMLElement);
        expect(screen.queryByText('gradingTasks.modal_title')).not.toBeInTheDocument();

        fireEvent.click(assignBtn);
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByText('gradingTasks.modal_title')).not.toBeInTheDocument();

        fireEvent.click(assignBtn);
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('gradingTasks.modal_title')).not.toBeInTheDocument();
    });

    it('assigns grading tasks without a due date and excludes peer-review or mismatched submissions', () => {
        mockAppValue.studentRubrics = [
            { id: 'sr1', rubricId: 'r1', studentId: 's1', isPeerReview: true, entries: [], overallComment: '' },
            { id: 'sr2', rubricId: 'other', studentId: 's1', isPeerReview: false, entries: [], overallComment: '' },
            { id: 'sr3', rubricId: 'r1', studentId: 'zz', isPeerReview: false, entries: [], overallComment: '' },
        ];
        renderPage();
        fireEvent.click(screen.getByTitle('gradingTasks.assign_title'));
        fireEvent.change(screen.getByLabelText('gradingTasks.teacher_label'), {
            target: { value: 'Mr. Smith' },
        });
        fireEvent.click(screen.getByText('gradingTasks.action_assign'));
        expect(mockAddGradingTasks).toHaveBeenCalledTimes(1);
        const [tasks] = mockAddGradingTasks.mock.calls[0] as [GradingTask[]];
        // s1's matching submissions are peer-review or mismatched → both students assigned
        expect(tasks).toHaveLength(2);
        expect(tasks[0].dueDate).toBeUndefined();
    });

    it('falls back to raw ids for unknown pending-task students and rubrics', () => {
        mockAppValue.gradingTasks = [{ ...pendingTask, id: 'gt2', studentId: 'ghost', rubricId: 'ghost-rubric' }];
        renderPage();
        expect(screen.getByText(/ghost — ghost-rubric/)).toBeInTheDocument();
    });

    it('shows the dash placeholder for a class with no students', () => {
        mockAppValue.classes = [mockClass, mockClass2];
        renderPage();
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('renders the essay assign button for a class with students but no assignments', () => {
        mockAppValue.essayAssignments = [essayA];
        mockAppValue.classes = [mockClass, mockClass2];
        mockAppValue.students = [mockStudent, mockStudent2, mockStudent3];
        renderPage();
        const assignButtons = screen.getAllByText('activityDashboard.assign');
        expect(assignButtons.length).toBeGreaterThan(0);
        // Class B's button is enabled (no assignments yet)
        const enabled = assignButtons.filter((b) => !(b as HTMLButtonElement).disabled);
        expect(enabled.length).toBeGreaterThan(0);
    });
});
