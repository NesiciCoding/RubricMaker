import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, GradeScale, Student, Test as RmTest, StudentTest } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockClassA: Class = { id: 'c1', name: 'Class A', year: 'jaar-1' };
const mockClassB: Class = { id: 'c2', name: 'Class B', year: 'jaar-2' };

const mockStudentA: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudentB: Student = { id: 's2', name: 'Bob', classId: 'c2' };

function makeTest(id: string, name: string, displayOrder: number): RmTest {
    return {
        id,
        name,
        questions: [
            {
                id: `q-${id}`,
                prompt: 'What is 2+2?',
                type: 'multiple-choice',
                points: 2,
                options: [
                    { id: `o1-${id}`, text: '3', isCorrect: false },
                    { id: `o2-${id}`, text: '4', isCorrect: true },
                ],
            },
        ],
        requireSEB: false,
        shuffleQuestions: false,
        displayOrder,
        createdAt: '2024-01-01T00:00:00Z',
    };
}

const testOne = makeTest('t1', 'First Quiz', 0);
const testTwo = makeTest('t2', 'Second Quiz', 1);
const testThree = makeTest('t3', 'Third Quiz', 2);

function makeStudentTest(id: string, testId: string, studentId: string): StudentTest {
    return {
        id,
        testId,
        studentId,
        answers: [],
        status: 'submitted',
        startedAt: '2024-01-02T00:00:00Z',
        submittedAt: '2024-01-02T00:00:00Z',
    };
}

const mockUpdateTest = vi.fn();
const mockDeleteTest = vi.fn();

const mockUseApp: Record<string, unknown> = {
    tests: [testOne],
    students: [mockStudentA, mockStudentB],
    classes: [mockClassA, mockClassB],
    gradeScales: [mockGradeScale],
    studentRubrics: [],
    studentTests: [],
    settings: mockSettings,
    exportTemplates: [],
    updateTest: mockUpdateTest,
    deleteTest: mockDeleteTest,
};

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockUseApp,
    useStudents: () => mockUseApp,
    useClasses: () => mockUseApp,
    useGrading: () => mockUseApp,
    useAuthoring: () => mockUseApp,
    useAssessment: () => mockUseApp,
    useEssays: () => mockUseApp,
    useFlashcards: () => mockUseApp,
    useSettings: () => mockUseApp,
    usePlatform: () => mockUseApp,
}));
vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: Record<string, unknown>) => unknown) => selector(mockUseApp),
    useStoreActions: () => mockUseApp,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => {
            if (params) return `${key}:${JSON.stringify(params)}`;
            return key;
        },
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: false, status: 'idle', lastSyncAt: null, userId: null, currentUser: null }),
}));

vi.mock('../../services/database', () => ({
    loadSupabaseConfig: vi.fn(() => null),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

let capturedOnDragEnd: ((result: unknown) => void) | null = null;
vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (r: unknown) => void }) => {
        capturedOnDragEnd = onDragEnd;
        return React.createElement(React.Fragment, null, children);
    },
    Droppable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }),
    Draggable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }),
}));

let PageComp: React.ComponentType;

function loadPage() {
    return render(
        <MemoryRouter>
            <PageComp />
        </MemoryRouter>
    );
}

describe('TestListPage coverage', () => {
    beforeEach(async () => {
        mockUpdateTest.mockClear();
        mockDeleteTest.mockClear();
        mockNavigate.mockClear();
        capturedOnDragEnd = null;
        mockUseApp.tests = [testOne];
        mockUseApp.studentTests = [];
        const mod = await import('../TestListPage');
        PageComp = mod.default;
    });

    it('filters tests by cohort year', () => {
        mockUseApp.tests = [testOne, testTwo];
        mockUseApp.studentTests = [makeStudentTest('st1', 't1', 's1'), makeStudentTest('st2', 't2', 's2')];
        loadPage();
        expect(screen.getByText('First Quiz')).toBeInTheDocument();
        expect(screen.getByText('Second Quiz')).toBeInTheDocument();
        // Filter to jaar-1 → only t1 (student s1's test) stays visible.
        fireEvent.change(screen.getByLabelText('statistics.filters.year'), { target: { value: 'jaar-1' } });
        expect(screen.getByText('First Quiz')).toBeInTheDocument();
        expect(screen.queryByText('Second Quiz')).not.toBeInTheDocument();
    });

    it('skips items whose display order is unchanged during a drag', () => {
        mockUseApp.tests = [testOne, testTwo, testThree];
        loadPage();
        expect(capturedOnDragEnd).not.toBeNull();
        // Move index 1 → 2: t1 keeps order 0 (skip), t3 gets 1, t2 gets 2.
        capturedOnDragEnd?.({
            source: { droppableId: 'test-list', index: 1 },
            destination: { droppableId: 'test-list', index: 2 },
        });
        expect(mockUpdateTest).toHaveBeenCalledTimes(2);
        expect(mockUpdateTest).toHaveBeenCalledWith(expect.objectContaining({ id: 't3', displayOrder: 1 }));
        expect(mockUpdateTest).toHaveBeenCalledWith(expect.objectContaining({ id: 't2', displayOrder: 2 }));
        // t1 keeps its order — never persisted.
        expect(mockUpdateTest).not.toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    });

    it('shows the dash average and deletes from the list view', async () => {
        loadPage();
        fireEvent.click(screen.getByText('common.view_list'));
        expect(screen.getByText('tests.col_name')).toBeInTheDocument();
        // No submissions → the average column shows the dash fallback.
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
        // List-view delete runs through the confirm dialog.
        fireEvent.click(screen.getByTitle('tests.action_delete'));
        expect(screen.getByText('tests.delete_test_title')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.delete'));
        await waitFor(() => expect(mockDeleteTest).toHaveBeenCalledWith('t1'));
    });

    it('shows the average percentage in the list view when submissions exist', () => {
        mockUseApp.studentTests = [makeStudentTest('st1', 't1', 's1')];
        loadPage();
        fireEvent.click(screen.getByText('common.view_list'));
        // The average column shows the computed percentage (0% with no answers).
        expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('navigates from the card edit icon, primary edit button, and monitor button', () => {
        loadPage();
        // Small icon edit button in the card header.
        fireEvent.click(screen.getByLabelText('tests.action_edit'));
        expect(mockNavigate).toHaveBeenLastCalledWith('/tests/t1');
        // Primary edit button in the card footer.
        fireEvent.click(screen.getByText('tests.action_edit'));
        expect(mockNavigate).toHaveBeenLastCalledWith('/tests/t1');
        // Monitor button.
        fireEvent.click(screen.getByTitle('tests.monitor.action_monitor'));
        expect(mockNavigate).toHaveBeenLastCalledWith('/tests/t1/monitor');
        expect(mockNavigate).toHaveBeenCalledTimes(3);
    });

    it('falls back to zero for questions without points', () => {
        mockUseApp.tests = [{ ...testOne, questions: [{ id: 'q0', prompt: 'Q', type: 'open', points: 0 }] }];
        loadPage();
        expect(screen.getByText('tests.total_points:{"points":0}')).toBeInTheDocument();
    });

    it('highlights the card border on mouse enter and restores it on leave', () => {
        loadPage();
        const card = screen.getByText('First Quiz').closest('.card') as HTMLElement;
        fireEvent.mouseEnter(card);
        expect(card.style.borderColor).toBe('var(--accent)');
        fireEvent.mouseLeave(card);
        expect(card.style.borderColor).toBe('var(--border)');
    });
});
