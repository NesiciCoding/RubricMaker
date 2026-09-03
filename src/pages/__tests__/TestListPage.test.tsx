import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, GradeScale, Student, Test as RmTest, StudentTest } from '../../types';
import type { StoreData } from '../../store/storage';

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

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockTest: RmTest = {
    id: 't1',
    name: 'Vocabulary Quiz',
    description: 'A short quiz',
    questions: [
        {
            id: 'q1',
            prompt: 'What is 2+2?',
            type: 'multiple-choice',
            points: 2,
            options: [
                { id: 'o1', text: '3', isCorrect: false },
                { id: 'o2', text: '4', isCorrect: true },
            ],
        },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-01T00:00:00Z',
};

const mockStudentTest: StudentTest = {
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [],
    status: 'submitted',
    startedAt: '2024-01-02T00:00:00Z',
    submittedAt: '2024-01-02T00:00:00Z',
};

const mockAddTest = vi.fn((t: Omit<RmTest, 'id' | 'createdAt' | 'updatedAt'>) => ({
    ...t,
    id: 'new-test',
    createdAt: '2024-01-02T00:00:00Z',
}));
const mockDeleteTest = vi.fn();
const mockUpdateTest = vi.fn();
const noop = vi.fn();

const mockUseApp = {
    tests: [mockTest],
    students: [mockStudent],
    classes: [mockClass],
    gradeScales: [mockGradeScale],
    studentRubrics: [],
    studentTests: [],
    settings: mockSettings,
    exportTemplates: [],
    addTest: mockAddTest,
    updateTest: mockUpdateTest,
    deleteTest: mockDeleteTest,
    saveStudentTest: noop,
    updateSettings: noop,
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
    useStoreSelector: <T,>(selector: (state: StoreData) => T): T => selector(mockUseApp as unknown as StoreData),
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

const mockExportTestSummaryPdf = vi.fn();
const mockExportBatchTestSummaryPdf = vi.fn();
vi.mock('../../utils/pdfExport', () => ({
    exportTestSummaryPdf: (...args: unknown[]) => mockExportTestSummaryPdf(...args),
    exportBatchTestSummaryPdf: (...args: unknown[]) => mockExportBatchTestSummaryPdf(...args),
}));

const mockBuildTestResultsCsv = vi.fn((..._args: unknown[]) => 'Student Name,Score %\nAlice,100.0');
vi.mock('../../utils/testExportPresets', () => ({
    buildTestResultsCsv: (...args: unknown[]) => mockBuildTestResultsCsv(...args),
}));

const mockSaveAs = vi.fn();
vi.mock('file-saver', () => ({ saveAs: (...args: unknown[]) => mockSaveAs(...args) }));

const mockShowToast = vi.fn();
vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
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

const mockExportTestSummaryDocx = vi.fn();
const mockExportBatchTestSummaryDocx = vi.fn();
vi.mock('../../utils/docxExport', () => ({
    exportTestSummaryDocx: (...args: unknown[]) => mockExportTestSummaryDocx(...args),
    exportBatchTestSummaryDocx: (...args: unknown[]) => mockExportBatchTestSummaryDocx(...args),
}));

function renderPage(Page: React.ComponentType) {
    return render(
        <MemoryRouter>
            <Page />
        </MemoryRouter>
    );
}

async function loadPage() {
    const { default: TestListPage } = await import('../TestListPage');
    return renderPage(TestListPage);
}

describe('TestListPage', () => {
    beforeEach(() => {
        mockAddTest.mockClear();
        mockDeleteTest.mockClear();
        mockNavigate.mockClear();
        capturedOnDragEnd = null;
        mockExportTestSummaryDocx.mockClear();
        mockExportBatchTestSummaryDocx.mockClear();
        mockExportTestSummaryPdf.mockClear();
        mockExportBatchTestSummaryPdf.mockClear();
        mockBuildTestResultsCsv.mockClear();
        mockSaveAs.mockClear();
        mockShowToast.mockClear();
        (mockUseApp as Record<string, unknown>).studentTests = [];
        (mockUseApp as Record<string, unknown>).exportTemplates = [];
        mockSettings.styleTemplateId = undefined;
        (mockUseApp as Record<string, unknown>).tests = [mockTest];
    });

    it('renders the test list with question count and total points', async () => {
        const { default: TestListPage } = await import('../TestListPage');
        render(
            <MemoryRouter>
                <TestListPage />
            </MemoryRouter>
        );
        expect(screen.getByText('Vocabulary Quiz')).toBeInTheDocument();
        expect(screen.getByText(/tests.question_count/)).toBeInTheDocument();
        expect(screen.getByText(/tests.total_points/)).toBeInTheDocument();
    });

    it('duplicates a test with a new id and copy suffix', async () => {
        const { default: TestListPage } = await import('../TestListPage');
        render(
            <MemoryRouter>
                <TestListPage />
            </MemoryRouter>
        );
        const duplicateBtn = screen.getByTitle('tests.action_duplicate');
        fireEvent.click(duplicateBtn);

        expect(mockAddTest).toHaveBeenCalledTimes(1);
        const arg = mockAddTest.mock.calls[0][0];
        expect(arg.name).toBe('Vocabulary Quiz tests.copy_suffix');
        expect(arg.questions).toHaveLength(1);
        expect(arg.questions[0].id).not.toBe('q1');
        expect(arg.questions[0].options?.[0].id).not.toBe('o1');
    });

    it('opens the assignment modal when assign is clicked', async () => {
        const { default: TestListPage } = await import('../TestListPage');
        render(
            <MemoryRouter>
                <TestListPage />
            </MemoryRouter>
        );
        const assignBtn = screen.getByTitle('tests.action_assign');
        fireEvent.click(assignBtn);
        expect(screen.getByText(/tests.assignment_modal_title/)).toBeInTheDocument();
    });

    it('expands and collapses the results panel when results button is clicked', async () => {
        (mockUseApp as Record<string, unknown>).studentTests = [mockStudentTest];
        const { default: TestListPage } = await import('../TestListPage');
        render(
            <MemoryRouter>
                <TestListPage />
            </MemoryRouter>
        );
        const resultsBtn = screen.getByTitle('tests.results.action_results');
        fireEvent.click(resultsBtn);
        expect(resultsBtn.getAttribute('aria-expanded')).toBe('true');
        // Results panel shows export section
        expect(screen.getByText('tests.export.section_title')).toBeInTheDocument();
        // Collapse
        fireEvent.click(resultsBtn);
        expect(resultsBtn.getAttribute('aria-expanded')).toBe('false');
        (mockUseApp as Record<string, unknown>).studentTests = [];
    });

    it('switching to whole-class scope and clicking Export CSV builds and downloads the CSV', async () => {
        (mockUseApp as Record<string, unknown>).studentTests = [mockStudentTest];
        mockBuildTestResultsCsv.mockClear();
        mockSaveAs.mockClear();
        const { default: TestListPage } = await import('../TestListPage');
        render(
            <MemoryRouter>
                <TestListPage />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByTitle('tests.results.action_results'));

        const scopeSelect = screen
            .getAllByRole('combobox')
            .find((el) => within(el).queryByText('tests.export.scope_batch')) as HTMLSelectElement;
        fireEvent.change(scopeSelect, { target: { value: 'batch' } });

        fireEvent.click(screen.getByText('tests.export.export_csv'));

        await waitFor(() => expect(mockSaveAs).toHaveBeenCalledTimes(1));
        expect(mockBuildTestResultsCsv).toHaveBeenCalledWith(mockTest, [mockStudentTest], [mockStudent]);
        expect(mockSaveAs.mock.calls[0][1]).toBe('Vocabulary_Quiz_results.csv');
        (mockUseApp as Record<string, unknown>).studentTests = [];
    });

    it('exporting a single-student PDF forwards the active style template', async () => {
        (mockUseApp as Record<string, unknown>).studentTests = [mockStudentTest];
        (mockUseApp as Record<string, unknown>).exportTemplates = [
            {
                id: 'style1',
                name: 'Custom Style',
                kind: 'style',
                dataUrl: '',
                levelHeaders: [],
                headingFont: 'Georgia',
            },
        ];
        mockSettings.styleTemplateId = 'style1';
        mockExportTestSummaryPdf.mockClear();
        const { default: TestListPage } = await import('../TestListPage');
        render(
            <MemoryRouter>
                <TestListPage />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByTitle('tests.results.action_results'));

        const studentSelect = screen
            .getAllByRole('combobox')
            .find((el) => within(el).queryByText('Alice')) as HTMLSelectElement;
        fireEvent.change(studentSelect, { target: { value: 's1' } });

        fireEvent.click(screen.getByText('tests.export.export_pdf'));

        await waitFor(() => expect(mockExportTestSummaryPdf).toHaveBeenCalledTimes(1));
        expect(mockExportTestSummaryPdf).toHaveBeenCalledWith(
            's1',
            [mockStudentTest],
            mockTest,
            mockStudent,
            expect.objectContaining({ id: 'style1', headingFont: 'Georgia' })
        );
        (mockUseApp as Record<string, unknown>).studentTests = [];
        (mockUseApp as Record<string, unknown>).exportTemplates = [];
        mockSettings.styleTemplateId = undefined;
    });

    it('renders no-tests message when test list is empty', async () => {
        (mockUseApp as Record<string, unknown>).tests = [];
        const { default: TestListPage } = await import('../TestListPage');
        render(
            <MemoryRouter>
                <TestListPage />
            </MemoryRouter>
        );
        expect(screen.getByText('tests.no_tests')).toBeInTheDocument();
        fireEvent.click(screen.getAllByText('tests.new_test')[1]);
        expect(mockNavigate).toHaveBeenCalledWith('/tests/new');
        (mockUseApp as Record<string, unknown>).tests = [mockTest];
    });

    it('navigates to a new test from the Topbar action', async () => {
        await loadPage();
        fireEvent.click(screen.getAllByText('tests.new_test')[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/tests/new');
    });

    it('opens and closes the generate-test modal', async () => {
        await loadPage();
        fireEvent.click(screen.getByText('generateTest.entry_point'));
        expect(screen.getByText('generateTest.title')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByText('generateTest.title')).not.toBeInTheDocument();
    });

    it('renders the list view with per-test actions', async () => {
        (mockUseApp as Record<string, unknown>).studentTests = [mockStudentTest];
        await loadPage();
        fireEvent.click(screen.getByText('common.view_list'));
        expect(screen.getByText('tests.col_name')).toBeInTheDocument();
        expect(screen.getByText('tests.col_questions')).toBeInTheDocument();
        expect(screen.getByText('tests.col_submitted')).toBeInTheDocument();
        expect(screen.getByText('tests.col_avg')).toBeInTheDocument();
        // Submitted count and average column values.
        expect(screen.getAllByText('1').length).toBeGreaterThan(0);
        fireEvent.click(screen.getByTitle('tests.action_edit'));
        expect(mockNavigate).toHaveBeenCalledWith('/tests/t1');
        fireEvent.click(screen.getByTitle('tests.action_assign'));
        expect(screen.getByText(/tests.assignment_modal_title/)).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('common.close'));
        fireEvent.click(screen.getByTitle('tests.monitor.action_monitor'));
        expect(mockNavigate).toHaveBeenCalledWith('/tests/t1/monitor');
        fireEvent.click(screen.getByTitle('tests.action_duplicate'));
        expect(mockAddTest).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/tests/new-test');
        // Row click navigates to the test editor.
        fireEvent.click(screen.getByText('Vocabulary Quiz'));
        expect(mockNavigate).toHaveBeenCalledWith('/tests/t1');
    });

    it('reorders tests via drag-and-drop and skips no-op drags', async () => {
        const testB: RmTest = { ...mockTest, id: 't2', name: 'Second Quiz', createdAt: '2024-01-02T00:00:00Z' };
        (mockUseApp as Record<string, unknown>).tests = [
            { ...mockTest, displayOrder: 0 },
            { ...testB, displayOrder: 1 },
        ];
        await loadPage();
        expect(capturedOnDragEnd).not.toBeNull();
        capturedOnDragEnd?.({
            source: { droppableId: 'test-list', index: 0 },
            destination: { droppableId: 'test-list', index: 1 },
        });
        expect(mockUpdateTest).toHaveBeenCalledTimes(2);
        expect(mockUpdateTest).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', displayOrder: 1 }));
        expect(mockUpdateTest).toHaveBeenCalledWith(expect.objectContaining({ id: 't2', displayOrder: 0 }));
        // Same index and missing destination are no-ops.
        mockUpdateTest.mockClear();
        capturedOnDragEnd?.({
            source: { droppableId: 'test-list', index: 0 },
            destination: { droppableId: 'test-list', index: 0 },
        });
        capturedOnDragEnd?.({ source: { droppableId: 'test-list', index: 0 }, destination: undefined });
        expect(mockUpdateTest).not.toHaveBeenCalled();
    });

    it('does not update unchanged display orders during a drag', async () => {
        const testB: RmTest = { ...mockTest, id: 't2', name: 'Second Quiz', createdAt: '2024-01-02T00:00:00Z' };
        (mockUseApp as Record<string, unknown>).tests = [
            { ...mockTest, displayOrder: 0 },
            { ...testB, displayOrder: 1 },
        ];
        await loadPage();
        // Both items already carry their index as displayOrder; a swap reorders them
        // so both orders change — this asserts the persistence loop runs.
        capturedOnDragEnd?.({
            source: { droppableId: 'test-list', index: 1 },
            destination: { droppableId: 'test-list', index: 0 },
        });
        expect(mockUpdateTest).toHaveBeenCalledTimes(2);
    });

    it('deletes a test after confirming and cancels without deleting', async () => {
        await loadPage();
        fireEvent.click(screen.getByTitle('tests.action_delete'));
        expect(screen.getByText('tests.delete_test_title')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.cancel'));
        expect(mockDeleteTest).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTitle('tests.action_delete'));
        fireEvent.click(screen.getByText('common.delete'));
        await waitFor(() => expect(mockDeleteTest).toHaveBeenCalledWith('t1'));
    });

    it('shows due-date, SEB, submitted and average badges on the card', async () => {
        (mockUseApp as Record<string, unknown>).tests = [
            {
                ...mockTest,
                dueDate: '2099-01-01T00:00:00Z',
                requireSEB: true,
            },
        ];
        (mockUseApp as Record<string, unknown>).studentTests = [mockStudentTest];
        await loadPage();
        expect(screen.getByText(/tests.due_date_badge/)).toBeInTheDocument();
        expect(screen.getByText('tests.seb_badge')).toBeInTheDocument();
        expect(screen.getByText('tests.list_submitted:{"count":1}')).toBeInTheDocument();
        expect(screen.getByText(/tests.list_avg/)).toBeInTheDocument();
    });

    it('marks an overdue due date in red and renders the description', async () => {
        (mockUseApp as Record<string, unknown>).tests = [
            { ...mockTest, dueDate: '2020-01-01T00:00:00Z', description: 'An old quiz' },
        ];
        await loadPage();
        expect(screen.getByText(/tests.due_date_badge/)).toBeInTheDocument();
        expect(screen.getByText('An old quiz')).toBeInTheDocument();
    });

    it('shows the attempt label and student-id fallback in the results panel', async () => {
        (mockUseApp as Record<string, unknown>).studentTests = [
            { ...mockStudentTest, studentId: 's-ghost', attemptNumber: 2 },
        ];
        await loadPage();
        fireEvent.click(screen.getByTitle('tests.results.action_results'));
        expect(screen.getAllByText('s-ghost').length).toBeGreaterThan(0);
        expect(screen.getByText('tests.results.attempt_label:{"n":2}')).toBeInTheDocument();
    });

    it('navigates to a student result from the results panel', async () => {
        (mockUseApp as Record<string, unknown>).studentTests = [mockStudentTest];
        await loadPage();
        fireEvent.click(screen.getByTitle('tests.results.action_results'));
        fireEvent.click(screen.getAllByText('Alice')[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/tests/t1/results/st1');
    });

    it('exports a single-student DOCX summary', async () => {
        (mockUseApp as Record<string, unknown>).studentTests = [mockStudentTest];
        mockExportTestSummaryDocx.mockResolvedValue(undefined);
        await loadPage();
        fireEvent.click(screen.getByTitle('tests.results.action_results'));
        const studentSelect = screen
            .getAllByRole('combobox')
            .find((el) => within(el).queryByText('Alice')) as HTMLSelectElement;
        fireEvent.change(studentSelect, { target: { value: 's1' } });
        fireEvent.click(screen.getByText('tests.export.export_docx'));
        await waitFor(() => expect(mockExportTestSummaryDocx).toHaveBeenCalledTimes(1));
        expect(mockExportTestSummaryDocx).toHaveBeenCalledWith('s1', [mockStudentTest], mockTest, mockStudent);
    });

    it('exports batch PDF and DOCX summaries', async () => {
        (mockUseApp as Record<string, unknown>).studentTests = [mockStudentTest];
        mockExportBatchTestSummaryPdf.mockResolvedValue(undefined);
        mockExportBatchTestSummaryDocx.mockResolvedValue(undefined);
        await loadPage();
        fireEvent.click(screen.getByTitle('tests.results.action_results'));
        const scopeSelect = screen
            .getAllByRole('combobox')
            .find((el) => within(el).queryByText('tests.export.scope_batch')) as HTMLSelectElement;
        fireEvent.change(scopeSelect, { target: { value: 'batch' } });
        fireEvent.click(screen.getByText('tests.export.export_pdf'));
        await waitFor(() => expect(mockExportBatchTestSummaryPdf).toHaveBeenCalledTimes(1));
        expect(mockExportBatchTestSummaryPdf).toHaveBeenCalledWith(
            [{ studentId: 's1', student: mockStudent }],
            [mockStudentTest],
            mockTest,
            undefined
        );
        fireEvent.click(screen.getByText('tests.export.export_docx'));
        await waitFor(() => expect(mockExportBatchTestSummaryDocx).toHaveBeenCalledTimes(1));
    });

    it('returns early from a single export when the selected student is unknown', async () => {
        (mockUseApp as Record<string, unknown>).studentTests = [{ ...mockStudentTest, studentId: 's-ghost' }];
        await loadPage();
        fireEvent.click(screen.getByTitle('tests.results.action_results'));
        const studentSelect = screen
            .getAllByRole('combobox')
            .find((el) => within(el).queryByText('s-ghost')) as HTMLSelectElement;
        fireEvent.change(studentSelect, { target: { value: 's-ghost' } });
        fireEvent.click(screen.getByText('tests.export.export_pdf'));
        await waitFor(() => expect(mockExportTestSummaryPdf).not.toHaveBeenCalled());
    });

    it('shows an error toast when an export fails', async () => {
        (mockUseApp as Record<string, unknown>).studentTests = [mockStudentTest];
        mockExportTestSummaryPdf.mockRejectedValue(new Error('boom'));
        await loadPage();
        fireEvent.click(screen.getByTitle('tests.results.action_results'));
        const studentSelect = screen
            .getAllByRole('combobox')
            .find((el) => within(el).queryByText('Alice')) as HTMLSelectElement;
        fireEvent.change(studentSelect, { target: { value: 's1' } });
        fireEvent.click(screen.getByText('tests.export.export_pdf'));
        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('toast.export_error', 'error'));
    });

    it('shows an error toast when the CSV export fails', async () => {
        (mockUseApp as Record<string, unknown>).studentTests = [mockStudentTest];
        mockSaveAs.mockImplementation(() => {
            throw new Error('boom');
        });
        await loadPage();
        fireEvent.click(screen.getByTitle('tests.results.action_results'));
        const scopeSelect = screen
            .getAllByRole('combobox')
            .find((el) => within(el).queryByText('tests.export.scope_batch')) as HTMLSelectElement;
        fireEvent.change(scopeSelect, { target: { value: 'batch' } });
        fireEvent.click(screen.getByText('tests.export.export_csv'));
        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('toast.export_error', 'error'));
    });

    it('opens the submission import modal', async () => {
        (mockUseApp as Record<string, unknown>).studentTests = [mockStudentTest];
        await loadPage();
        fireEvent.click(screen.getByTitle('tests.results.action_import'));
        expect(screen.getByText('tests.results.import_title')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByText('tests.results.import_title')).not.toBeInTheDocument();
    });

    it('disables assign when the test has no questions', async () => {
        (mockUseApp as Record<string, unknown>).tests = [{ ...mockTest, questions: [] }];
        await loadPage();
        expect(screen.getByTitle('tests.action_assign')).toBeDisabled();
    });

    it('enables assign for a generator placement test even though its question pool is empty', async () => {
        (mockUseApp as Record<string, unknown>).tests = [
            {
                ...mockTest,
                questions: [],
                mode: 'placement',
                placementEngine: 'generator',
                generatorConfig: { minCefrLevel: 'A1', maxCefrLevel: 'C2', minQuestions: 5, maxQuestions: 12 },
            },
        ];
        await loadPage();
        expect(screen.getByTitle('tests.action_assign')).toBeEnabled();
    });
});
