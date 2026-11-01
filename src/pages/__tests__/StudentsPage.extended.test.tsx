import React from 'react';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, GradeScale, Rubric, RubricCriterion, Student, StudentRubric } from '../../types';

const h = vi.hoisted(() => {
    const defaultT = (key: string, opts?: string | Record<string, unknown>) => {
        if (typeof opts === 'string') return opts;
        if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
        return key;
    };
    return {
        defaultT,
        t: vi.fn(defaultT),
        dragEnd: undefined as
            ((result: { source: { index: number }; destination: { index: number } | null }) => void) | undefined,
        joyrideEvent: undefined as ((data: { status: string }) => void) | undefined,
        getCefrStudentOverview: vi.fn((studentId: string) => ({
            cells: studentId === 's1' ? (['writing-cell'] as never[]) : ([] as never[]),
            cellMap: new Map(),
            standardSets: [],
            skillsWithRubricData: 0,
            overallConfidenceRate: 0,
            standardsCovered: 0,
            practiceCefrProgress: [],
        })),
        skillLevelStatus: vi.fn((cells: unknown[]) => (cells.length > 0 ? { level: 'B1', achieved: true } : null)),
        saveAs: vi.fn(),
        showToast: vi.fn(),
        setPassword: vi.fn(),
        writeText: vi.fn(),
    };
});

const gradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [
        { min: 0, max: 49, label: 'F', color: '#ef4444' },
        { min: 50, max: 100, label: 'A', color: '#22c55e' },
    ],
};

const levelHigh = { id: 'l1', label: 'Excellent', minPoints: 4, maxPoints: 4, description: 'Top', subItems: [] };
const levelMid = { id: 'l2', label: 'Good', minPoints: 2, maxPoints: 2, description: 'OK', subItems: [] };
const criterion: RubricCriterion = {
    id: 'c1',
    title: 'Content',
    description: '',
    weight: 100,
    levels: [levelHigh, levelMid],
};

const mkRubric = (over: Partial<Rubric>): Rubric => ({
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [criterion],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
    ...over,
});

const rubric = mkRubric({});
const rubricNoScale = mkRubric({ id: 'r2', name: 'Checklist', gradeScaleId: 'none', criteria: [] });
const rubricMissingScale = mkRubric({ id: 'r3', name: 'Legacy', gradeScaleId: 'gs-missing', criteria: [] });
// No gradeScaleId at all → the ?? defaultGradeScaleId fallback fires.
const rubricNoScaleId = mkRubric({ id: 'r4', name: 'Old Rubric', gradeScaleId: undefined as unknown as string });

const c1: Class = { id: 'c1', name: 'Class A', displayOrder: 0, rubricIds: ['r1'] };
const c2: Class = { id: 'c2', name: 'Class B', displayOrder: 1, voTrack: 'vwo', color: '#ff0000', year: 'jaar-1' };
const c3: Class = { id: 'c3', name: 'Class C', displayOrder: 2, color: '#00ff00' };
const c4: Class = { id: 'c4', name: 'Class D', displayOrder: 3, rubricIds: ['r1', 'r2'] };
// Heterogeneous class: two VO tracks (one primary) in one year.
const c5: Class = {
    id: 'c5',
    name: 'Class E',
    displayOrder: 4,
    voTrack: 'havo',
    voTracks: ['havo', 'vmbo-tl'],
    year: 'jaar-3',
};
// Junior group: one class, two primary-school years (groep 7 & 8), no VO track.
const c6: Class = { id: 'c6', name: 'Class F', displayOrder: 5, years: ['groep-7', 'groep-8'] };

const mkEntry = (levelId: string | null, comment = '', checkedSubItems: string[] = []) => ({
    criterionId: 'c1',
    levelId,
    checkedSubItems,
    comment,
});

const mkSr = (
    id: string,
    studentId: string,
    rubricId: string,
    gradedAt: string,
    over: Partial<StudentRubric> = {}
): StudentRubric => ({
    id,
    rubricId,
    studentId,
    entries: [],
    overallComment: '',
    isPeerReview: false,
    gradedAt,
    ...over,
});

// s1 Alice: up trend, writing badge, summary-building srs
const s1: Student = { id: 's1', name: 'Alice', classId: 'c1', email: 'alice@example.com', voTrack: 'havo' };
const srA1 = mkSr('sr-a1', 's1', 'r1', '2024-01-01T00:00:00Z', {
    entries: [mkEntry('l2', '<p>Nice work</p>')],
    overallComment: '<b>Great</b> effort',
});
const srA2 = mkSr('sr-a2', 's1', 'r1', '2024-02-01T00:00:00Z', { entries: [mkEntry('l1')] });
const srA3 = mkSr('sr-a3', 's1', 'r2', '2024-03-01T00:00:00Z');
const srA4 = mkSr('sr-a4', 's1', 'r3', '2024-03-02T00:00:00Z');
const srA5 = mkSr('sr-a5', 's1', 'r1', '2024-04-01T00:00:00Z', {
    entries: [mkEntry('l1', '<u></u>')],
    overallComment: '<i></i>',
});

// s2 Bob: down trend
const s2: Student = { id: 's2', name: 'Bob', classId: 'c2', email: 'bob@example.com' };
const srB1 = mkSr('sr-b1', 's2', 'r1', '2024-01-01T00:00:00Z', { entries: [mkEntry('l1')] });
const srB2 = mkSr('sr-b2', 's2', 'r1', '2024-02-01T00:00:00Z', { entries: [mkEntry('l2')] });

// s3 Carol: no class, no email, ungraded entry
const s3: Student = { id: 's3', name: 'Carol', classId: 'c-missing' };
const srC1 = mkSr('sr-c1', 's3', 'r1', '2024-01-01T00:00:00Z', { entries: [mkEntry(null)] });

// s4 Dana: flat trend
const s4: Student = { id: 's4', name: 'Dana', classId: 'c1' };
const srD1 = mkSr('sr-d1', 's4', 'r1', '2024-01-01T00:00:00Z', { entries: [mkEntry('l1')] });
const srD2 = mkSr('sr-d2', 's4', 'r1', '2024-02-01T00:00:00Z', { entries: [mkEntry('l1')] });
const srD3 = mkSr('sr-d3', 's4', 'r1', '2024-03-01T00:00:00Z');

// s5 Eve: rubric with missing grade scale id
const s5: Student = { id: 's5', name: 'Eve', classId: 'c1' };
const srE1 = mkSr('sr-e1', 's5', 'r3', '2024-01-01T00:00:00Z');

// s6 Frank: only a dangling rubric reference (no live rubric, no snapshot)
const s6: Student = { id: 's6', name: 'Frank', classId: 'c1' };
const srF1 = mkSr('sr-f1', 's6', 'r-missing', '2024-01-01T00:00:00Z');

// s7 Grace: exactly ONE graded percentage → singular graded badge + default-scale fallback.
const s7: Student = { id: 's7', name: 'Grace', classId: 'c1' };
const srG1 = mkSr('sr-g1', 's7', 'r4', '2024-01-05T00:00:00Z', { entries: [mkEntry('l1')] });

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    activeClassId: 'c1',
};

const mockAddStudent = vi.fn();
const mockUpdateStudent = vi.fn();
const mockDeleteStudent = vi.fn();
const mockAddClass = vi.fn();
const mockUpdateClass = vi.fn();
const mockDeleteClass = vi.fn();
const mockMergeClasses = vi.fn();
const mockUpdateSettings = vi.fn();
const mockNavigate = vi.fn();

// Stable refs (identity-stable so memos don't churn between renders).
// s8 Rick: tagged to the second of Class E's two tracks.
const s8: Student = { id: 's8', name: 'Rick', classId: 'c5', voTrack: 'vmbo-tl' };
// s9 Sara: tagged to the second of Class F's two years.
const s9: Student = { id: 's9', name: 'Sara', classId: 'c6', schoolYear: 'groep-8' };

const classesArr = [c1, c2, c3, c4, c5, c6];
const studentsArr = [s1, s2, s3, s4, s5, s6, s7, s8, s9];
const studentRubricsArr = [srA1, srA2, srA3, srA4, srA5, srB1, srB2, srC1, srD1, srD2, srD3, srE1, srF1, srG1];
const rubricsArr = [rubric, rubricNoScale, rubricMissingScale, rubricNoScaleId];
const gradeScalesArr = [gradeScale];
const selfAssessmentsArr: unknown[] = [
    { id: 'sa1', studentId: 's1', rubricId: 'r1', levelId: 'l2' },
    { id: 'sa2', studentId: 's1', rubricId: 'r1', levelId: 'l1' },
];
const analysisResultsArr: unknown[] = [
    { id: 'ar1', studentId: 's1', text: 'hello' },
    { id: 'ar2', studentId: 's1', text: 'world' },
];
const testsArr: unknown[] = [{ id: 't1' }];
const studentTestsArr: unknown[] = [
    { id: 'st1', studentId: 's1', testId: 't-missing', status: 'assigned' },
    { id: 'st2', studentId: 's1', testId: 't2', status: 'assigned' },
];

const mockAppValue: Record<string, unknown> = {
    classes: classesArr,
    students: studentsArr,
    studentRubrics: studentRubricsArr,
    rubrics: rubricsArr,
    gradeScales: gradeScalesArr,
    selfAssessments: selfAssessmentsArr,
    analysisResults: analysisResultsArr,
    tests: testsArr,
    studentTests: studentTestsArr,
    settings: mockSettings,
    addStudent: mockAddStudent,
    updateStudent: mockUpdateStudent,
    deleteStudent: mockDeleteStudent,
    addClass: mockAddClass,
    updateClass: mockUpdateClass,
    deleteClass: mockDeleteClass,
    mergeClasses: mockMergeClasses,
    updateSettings: mockUpdateSettings,
    setStudentPassword: h.setPassword,
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

vi.mock('../../utils/cefrStudentAggregator', () => ({
    getCefrStudentOverview: h.getCefrStudentOverview,
    skillLevelStatus: h.skillLevelStatus,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (r: unknown) => void }) => {
        h.dragEnd = onDragEnd;
        return React.createElement(React.Fragment, null, children);
    },
    Droppable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }),
    Draggable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }),
}));

vi.mock('react-joyride', () => ({
    Joyride: ({ onEvent }: { onEvent: (d: unknown) => void }) => {
        h.joyrideEvent = onEvent;
        return null;
    },
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: true, status: 'idle', lastSyncAt: null, userId: null, currentUser: null }),
}));

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: h.showToast }),
}));

vi.mock('../../hooks/useNotificationFeed', () => ({
    useNotificationFeed: () => ({
        overdueItems: [],
        messageItems: [],
        moderationItems: [],
        count: 0,
        threshold: 5,
        dismissAll: vi.fn(),
    }),
}));

vi.mock('file-saver', () => ({
    saveAs: (...args: unknown[]) => h.saveAs(...args),
}));

vi.mock('../../components/Students/CsvImportModal', () => ({
    default: ({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) =>
        React.createElement(
            'div',
            { 'data-testid': 'csv-import-modal' },
            React.createElement('button', { onClick: onClose }, 'Close CSV'),
            React.createElement('button', { onClick: onSuccess }, 'Done CSV')
        ),
}));

vi.mock('../../components/Students/StudentPasswordSlipSheet', () => ({
    default: ({ onClose }: { onClose: () => void }) =>
        React.createElement(
            'div',
            { 'data-testid': 'password-slip-sheet' },
            React.createElement('button', { onClick: onClose }, 'Close slips')
        ),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: h.t,
        i18n: { language: 'en' },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

let StudentsPageComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<StudentsPageComp />);
}

function resetFixtures() {
    mockAppValue.classes = classesArr;
    mockAppValue.students = studentsArr;
    mockAppValue.studentRubrics = studentRubricsArr;
    mockAppValue.rubrics = rubricsArr;
    mockAppValue.gradeScales = gradeScalesArr;
    mockAppValue.selfAssessments = selfAssessmentsArr;
    mockAppValue.analysisResults = analysisResultsArr;
    mockAppValue.tests = testsArr;
    mockAppValue.studentTests = studentTestsArr;
}

describe('StudentsPage extended', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: h.writeText },
            configurable: true,
        });
        h.writeText.mockResolvedValue(undefined);
        h.setPassword.mockResolvedValue({ success: true });
        resetFixtures();
        const mod = await import('../StudentsPage');
        StudentsPageComp = mod.default;
    });

    afterEach(() => {
        resetFixtures();
        h.t.mockImplementation(h.defaultT);
    });

    it('renders writing badge, trend arrows, last-active date and overall grade', () => {
        renderPage();
        // Include Bob (class c2) so the down-trend arrow renders too.
        fireEvent.click(screen.getByRole('button', { name: /Class B/ }));
        // s1 has writing B1 (mock keys off student id) and an up trend.
        expect(screen.getByText('B1')).toBeInTheDocument();
        expect(screen.getByLabelText('studentsPage.trend_up')).toBeInTheDocument();
        expect(screen.getByLabelText('studentsPage.trend_down')).toBeInTheDocument();
        expect(screen.getByLabelText('studentsPage.trend_flat')).toBeInTheDocument();
        // Overall grade letters render for graded students.
        expect(screen.getAllByText('A').length).toBeGreaterThan(0);
        // Last active date renders for graded students.
        expect(screen.getAllByText(/Jan 1, 2024/).length).toBeGreaterThan(0);
        // Ungraded students show em-dashes and "not graded".
        expect(screen.getAllByText('studentsPage.not_graded').length).toBeGreaterThan(0);
    });

    it('sorts by email and by grade count, including descending toggle', () => {
        renderPage();
        const emailBtn = screen.getByRole('button', { name: /studentsPage\.table_email/ });
        fireEvent.click(emailBtn);
        const th = emailBtn.closest('th');
        expect(th).toHaveAttribute('aria-sort', 'ascending');
        fireEvent.click(emailBtn);
        expect(th).toHaveAttribute('aria-sort', 'descending');
        // Third click toggles back to ascending (desc → asc branch).
        fireEvent.click(emailBtn);
        expect(th).toHaveAttribute('aria-sort', 'ascending');
        const gradesBtn = screen.getByRole('button', { name: /studentsPage\.table_grades/ });
        fireEvent.click(gradesBtn);
        expect(gradesBtn.closest('th')).toHaveAttribute('aria-sort', 'ascending');
        // Descending grades sort exercises the valA > valB comparator branch.
        fireEvent.click(gradesBtn);
        expect(gradesBtn.closest('th')).toHaveAttribute('aria-sort', 'descending');
    });

    it('toggles cohort chips on and off and shows the multi-cohort label', () => {
        renderPage();
        // c1 chip is initially selected (settings.activeClassId).
        const chipC1 = screen.getByRole('button', { name: /Class A/ });
        expect(chipC1).toHaveAttribute('aria-pressed', 'true');
        // Remove c1 → All view, class column appears.
        fireEvent.click(chipC1);
        expect(screen.getByText('studentsPage.all_cohorts')).toBeInTheDocument();
        expect(screen.getByText('studentsPage.table_class')).toBeInTheDocument();
        // Re-select two cohorts → n_cohorts label.
        fireEvent.click(screen.getByRole('button', { name: /Class A/ }));
        fireEvent.click(screen.getByRole('button', { name: /Class B/ }));
        expect(screen.getByText(/studentsPage\.n_cohorts_label/)).toBeInTheDocument();
    });

    it('shows class chips with track badges, colors and rubric counts', () => {
        renderPage();
        // c2 has a voTrack badge; c3 has a color dot; c1 has one linked rubric.
        expect(screen.getByText('VWO')).toBeInTheDocument();
        expect(screen.getByTitle('1 studentsPage.rubric_single')).toBeInTheDocument();
    });

    it('handles class drag-end, including no-destination and same-position cases', () => {
        renderPage();
        expect(h.dragEnd).toBeDefined();
        // No destination → early return, no updateClass calls.
        fireEvent.click(screen.getByText('studentsPage.all_cohorts'));
        h.dragEnd!({ source: { index: 0 }, destination: null });
        expect(mockUpdateClass).not.toHaveBeenCalled();
        // Moving index 0 → 1 leaves the last class at its own order (no update for it).
        h.dragEnd!({ source: { index: 0 }, destination: { index: 1 } });
        expect(mockUpdateClass).toHaveBeenCalled();
    });

    it('adds a class via the toolbar button and ignores empty input', () => {
        renderPage();
        const input = screen.getByPlaceholderText('studentsPage.new_class_placeholder');
        fireEvent.change(input, { target: { value: 'Class D' } });
        fireEvent.click(screen.getByLabelText('studentsPage.add_class'));
        expect(mockAddClass).toHaveBeenCalledWith(expect.objectContaining({ name: 'Class D' }));
        expect(input).toHaveValue('');
        // Empty input → no-op.
        fireEvent.click(screen.getByLabelText('studentsPage.add_class'));
        expect(mockAddClass).toHaveBeenCalledTimes(1);
    });

    it('imports a CSV file, shows the modal and closes it', () => {
        renderPage();
        // The toolbar import button triggers the hidden file input.
        fireEvent.click(screen.getByText('studentsPage.import_csv'));
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(fileInput, { target: { files: [new File(['a,b'], 'x.csv')] } });
        expect(screen.getByTestId('csv-import-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Done CSV'));
        expect(screen.queryByTestId('csv-import-modal')).not.toBeInTheDocument();
        // Re-open and close via the Close button.
        fireEvent.change(fileInput, { target: { files: [new File(['a,b'], 'x.csv')] } });
        fireEvent.click(screen.getByText('Close CSV'));
        expect(screen.queryByTestId('csv-import-modal')).not.toBeInTheDocument();
        // Empty file list → no modal.
        fireEvent.change(fileInput, { target: { files: [] } });
        expect(screen.queryByTestId('csv-import-modal')).not.toBeInTheDocument();
    });

    it('exports the roster CSV and all summaries', () => {
        renderPage();
        fireEvent.click(screen.getByText('studentsPage.export_csv'));
        expect(h.saveAs).toHaveBeenCalledWith(expect.any(Blob), 'students.csv');
        fireEvent.click(screen.getByText('studentsPage.action_export_summaries'));
        const call = h.saveAs.mock.calls.at(-1)!;
        expect(call[0]).toBeInstanceOf(Blob);
        expect(call[1]).toContain('summaries_');
        expect(call[1]).toContain('Class_A');
    });

    it('falls back to the generic class name when exporting summaries in the combined view', () => {
        renderPage();
        fireEvent.click(screen.getByText('studentsPage.all_cohorts'));
        fireEvent.click(screen.getByText('studentsPage.action_export_summaries'));
        expect(h.saveAs).toHaveBeenCalledWith(expect.any(Blob), 'summaries_class.txt');
    });

    it('generates class password slips and shows partial-failure toast', async () => {
        h.setPassword.mockImplementation(async (email: string) =>
            email === 'bob@example.com' ? { success: false, error: 'nope' } : { success: true }
        );
        renderPage();
        // Include Bob (has an email) so both students with emails are targeted.
        fireEvent.click(screen.getByRole('button', { name: /Class B/ }));
        fireEvent.click(screen.getByText('studentsPage.action_generate_class_passwords'));
        await waitFor(() => expect(screen.getByTestId('password-slip-sheet')).toBeInTheDocument());
        expect(h.setPassword).toHaveBeenCalledTimes(2);
        expect(h.showToast).toHaveBeenCalledWith(expect.stringContaining('password_slip_partial_failure'), 'warning');
        fireEvent.click(screen.getByText('Close slips'));
        expect(screen.queryByTestId('password-slip-sheet')).not.toBeInTheDocument();
    });

    it('generates a single student password slip on success without toast', async () => {
        renderPage();
        fireEvent.click(screen.getByLabelText('studentsPage.action_generate_password'));
        await waitFor(() => expect(screen.getByTestId('password-slip-sheet')).toBeInTheDocument());
        expect(h.setPassword).toHaveBeenCalledWith('alice@example.com', expect.any(String));
        expect(h.showToast).not.toHaveBeenCalled();
    });

    it('opens the grade menu, toggles it shut, and navigates to grading', () => {
        renderPage();
        const gradeBtn = screen.getAllByRole('button', { name: /studentsPage\.grade_prefix/ })[0];
        fireEvent.click(gradeBtn);
        const menu = screen.getByRole('menu');
        expect(within(menu).getByText('Essay Rubric')).toBeInTheDocument();
        // Toggling the button again closes the menu.
        fireEvent.click(gradeBtn);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        // Re-open and navigate.
        fireEvent.click(gradeBtn);
        fireEvent.click(within(screen.getByRole('menu')).getByText('Essay Rubric'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1/grade/s1');
    });

    it('opens the summary modal, copies to clipboard and closes', async () => {
        renderPage();
        const rows = screen.getAllByRole('row');
        const aliceRow = rows.find((r) => within(r).queryByText('Alice'))!;
        fireEvent.click(within(aliceRow).getByTitle('studentsPage.action_copy_summary'));
        const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
        const value = (textarea as HTMLTextAreaElement).value;
        expect(value).toContain('Rubric: Essay Rubric');
        expect(value).toContain('Score: 50.0% (A) — 2/4 pts');
        expect(value).toContain('Content: Good (2/4 pts)');
        expect(value).toContain('→ Nice work');
        expect(value).toContain('Feedback: Great effort');
        expect(value).toContain('Rubric: Checklist');
        expect(value).toContain('Rubric: Legacy');
        fireEvent.click(textarea);
        fireEvent.click(screen.getByText('Copy to clipboard'));
        await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Close'));
        expect(document.querySelector('textarea')).not.toBeInTheDocument();
    });

    it('shows the no-graded-rubrics placeholder summary', () => {
        renderPage();
        // Frank (s6) has only a dangling rubric reference.
        const rows = screen.getAllByRole('row');
        const frankRow = rows.find((r) => within(r).queryByText('Frank'))!;
        fireEvent.click(within(frankRow).getByTitle('studentsPage.action_copy_summary'));
        const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
        expect(textarea.value).toContain('(No graded rubrics yet)');
    });

    it('shows a missing-level entry and empty-comment handling in summaries', () => {
        renderPage();
        // Carol (s3, class c-missing) only appears in the combined roster.
        fireEvent.click(screen.getByText('studentsPage.all_cohorts'));
        const rows = screen.getAllByRole('row');
        const carolRow = rows.find((r) => within(r).queryByText('Carol'))!;
        fireEvent.click(within(carolRow).getByTitle('studentsPage.action_copy_summary'));
        const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
        expect(textarea.value).toContain('Content: 0/4 pts');
        expect(textarea.value).not.toContain('→ ');
    });

    it('edits a student, transfers class and pins a track from that class', () => {
        renderPage();
        const rows = screen.getAllByRole('row');
        const aliceRow = rows.find((r) => within(r).queryByText('Alice'))!;
        fireEvent.click(within(aliceRow).getByLabelText('studentsPage.action_edit_student'));
        expect(screen.getByText('studentsPage.edit_student_title')).toBeInTheDocument();
        // Move Alice into Class E (two tracks, one year) → the track select offers exactly its own tracks.
        const classSelect = screen.getByLabelText('studentsPage.form_class');
        fireEvent.change(classSelect, { target: { value: 'c5' } });
        const trackSelect = screen.getByLabelText('voTrack.section_label') as HTMLSelectElement;
        expect([...trackSelect.options].map((o) => o.value)).toEqual(['', 'vmbo-tl', 'havo']);
        fireEvent.change(trackSelect, { target: { value: 'vmbo-tl' } });
        fireEvent.change(screen.getByLabelText('studentsPage.form_full_name'), { target: { value: 'Alice B' } });
        fireEvent.click(screen.getByText('studentsPage.action_save_changes'));
        expect(mockUpdateStudent).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Alice B',
                classId: 'c5',
                voTrack: 'vmbo-tl',
                schoolYear: undefined,
                pastClassMemberships: [expect.objectContaining({ classId: 'c1', leftAt: expect.any(String) })],
            })
        );
    });

    it('assigns a student to one of a mixed class\u2019s years', () => {
        renderPage();
        fireEvent.click(screen.getByText('studentsPage.all_cohorts'));
        const saraRow = screen.getAllByRole('row').find((r) => within(r).queryByText('Sara'))!;
        fireEvent.click(within(saraRow).getByLabelText('studentsPage.action_edit_student'));
        const yearSelect = screen.getByLabelText('studentsPage.form_school_year') as HTMLSelectElement;
        // Only the class's own years (groep 7 & 8) are offered, seeded with Sara's own tag.
        expect([...yearSelect.options].map((o) => o.value)).toEqual(['', 'groep-7', 'groep-8']);
        expect(yearSelect.value).toBe('groep-8');
        // A primary-school class has no VO track to pin.
        expect(screen.queryByLabelText('voTrack.section_label')).not.toBeInTheDocument();
        fireEvent.change(yearSelect, { target: { value: 'groep-7' } });
        fireEvent.click(screen.getByText('studentsPage.action_save_changes'));
        expect(mockUpdateStudent).toHaveBeenCalledWith(
            expect.objectContaining({ schoolYear: 'groep-7', voTrack: undefined, classId: 'c6' })
        );
    });

    it('tags students of a mixed class with their own track and year', () => {
        renderPage();
        fireEvent.click(screen.getByText('studentsPage.all_cohorts'));
        const rows = screen.getAllByRole('row');
        const rickRow = rows.find((r) => within(r).queryByText('Rick'))!;
        expect(within(rickRow).getByText('VMBO-TL')).toBeInTheDocument();
        const saraRow = rows.find((r) => within(r).queryByText('Sara'))!;
        expect(within(saraRow).getByText('Groep 8')).toBeInTheDocument();
        // Alice's class is not mixed, so her row carries no cohort tag.
        const aliceRow = rows.find((r) => within(r).queryByText('Alice'))!;
        expect(within(aliceRow).queryByText('HAVO')).not.toBeInTheDocument();
    });

    it('floats the class options menu above the scrollable chip bar', () => {
        renderPage();
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[0]);
        const menu = screen.getByRole('menu');
        // Portaled to the body, so the chip row's horizontal overflow can neither clip it nor scroll.
        expect(menu.parentElement).toBe(document.body);
        expect(menu).toHaveStyle({ position: 'fixed' });
    });

    it('edits a student without an email (empty-string fallbacks)', () => {
        renderPage();
        const rows = screen.getAllByRole('row');
        const danaRow = rows.find((r) => within(r).queryByText('Dana'))!;
        fireEvent.click(within(danaRow).getByLabelText('studentsPage.action_edit_student'));
        const emailInput = screen.getByPlaceholderText('studentsPage.form_email_placeholder') as HTMLInputElement;
        expect(emailInput.value).toBe('');
        fireEvent.change(screen.getByLabelText('studentsPage.form_full_name'), { target: { value: 'Dana D' } });
        fireEvent.click(screen.getByText('studentsPage.action_save_changes'));
        expect(mockUpdateStudent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dana D', email: '' }));
    });

    it('keeps past memberships when editing without a class transfer', () => {
        renderPage();
        // Bob is in class c2 → needs the combined roster.
        fireEvent.click(screen.getByText('studentsPage.all_cohorts'));
        const rows = screen.getAllByRole('row');
        const bobRow = rows.find((r) => within(r).queryByText('Bob'))!;
        fireEvent.click(within(bobRow).getByLabelText('studentsPage.action_edit_student'));
        // Bob's class c2 has voTrack → adjacent track options render.
        expect(screen.getByText('voTrack.section_label')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('studentsPage.form_full_name'), { target: { value: 'Bob B' } });
        fireEvent.click(screen.getByText('studentsPage.action_save_changes'));
        expect(mockUpdateStudent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bob B', classId: 'c2' }));
        const arg = mockUpdateStudent.mock.calls[0][0] as Student;
        expect(arg.pastClassMemberships).toBeUndefined();
    });

    it('adds a student from the header button with the active class preselected', () => {
        renderPage();
        fireEvent.click(screen.getAllByText('studentsPage.add_student')[0]);
        fireEvent.change(screen.getByPlaceholderText('studentsPage.form_name_placeholder'), {
            target: { value: 'Grace' },
        });
        fireEvent.change(screen.getByLabelText('studentsPage.form_email'), { target: { value: 'g@x.com' } });
        fireEvent.click(screen.getAllByText('studentsPage.add_student').at(-1)!);
        expect(mockAddStudent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Grace', classId: 'c1' }));
    });

    it('blocks saving a student with an invalid email (#668)', () => {
        renderPage();
        fireEvent.click(screen.getAllByText('studentsPage.add_student')[0]);
        fireEvent.change(screen.getByLabelText('studentsPage.form_full_name'), { target: { value: 'Grace' } });
        const emailInput = screen.getByLabelText('studentsPage.form_email');
        fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
        const save = screen.getAllByText('studentsPage.add_student').at(-1)!.closest('button')!;
        expect(save).toBeDisabled();
        expect(emailInput).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByText('studentsPage.form_email_invalid')).toBeInTheDocument();
        fireEvent.click(save);
        expect(mockAddStudent).not.toHaveBeenCalled();

        fireEvent.change(emailInput, { target: { value: ' grace@school.nl ' } });
        expect(save).not.toBeDisabled();
        fireEvent.click(save);
        expect(mockAddStudent).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Grace', email: 'grace@school.nl', classId: 'c1' })
        );
    });

    it('warns when the class already has a student with that name (#668)', () => {
        renderPage();
        fireEvent.click(screen.getAllByText('studentsPage.add_student')[0]);
        fireEvent.change(screen.getByLabelText('studentsPage.form_full_name'), { target: { value: ' alice ' } });
        expect(
            screen.getByText('studentsPage.form_duplicate_warning:{"name":"Alice","className":"Class A"}')
        ).toBeInTheDocument();
        fireEvent.click(screen.getAllByText('studentsPage.add_student').at(-1)!);
        expect(mockAddStudent).toHaveBeenCalledWith(expect.objectContaining({ name: 'alice', classId: 'c1' }));
    });

    it('does not flag the student being edited as their own duplicate (#668)', () => {
        renderPage();
        const aliceRow = screen.getAllByRole('row').find((r) => within(r).queryByText('Alice'))!;
        fireEvent.click(within(aliceRow).getByLabelText('studentsPage.action_edit_student'));
        expect(screen.queryByText(/studentsPage\.form_duplicate_warning/)).not.toBeInTheDocument();
    });

    it('exports the class and student number so the CSV re-imports (#668)', async () => {
        renderPage();
        fireEvent.click(screen.getByText('studentsPage.export_csv'));
        const blob = h.saveAs.mock.calls.at(-1)![0] as Blob;
        const bytes = new Uint8Array(
            await new Promise<ArrayBuffer>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as ArrayBuffer);
                reader.readAsArrayBuffer(blob);
            })
        );
        const [header, firstRow] = new TextDecoder().decode(bytes.slice(3)).split('\r\n');
        expect(header).toBe('name,email,class,student_number');
        expect(firstRow).toBe('Alice,alice@example.com,Class A,');
    });

    it('renames a class with a non-track year and a color', () => {
        renderPage();
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[0]);
        fireEvent.click(screen.getByText('studentsPage.action_rename'));
        expect(screen.getByText('voTrack.class_settings_title')).toBeInTheDocument();
        fireEvent.change(
            screen.getAllByDisplayValue('Class A').find((el) => el.tagName === 'INPUT')!,
            { target: { value: 'Renamed A' } }
        );
        // 'groep-8' is primary school → the track group disappears.
        fireEvent.click(
            within(screen.getByRole('group', { name: 'studentsPage.form_school_year' })).getByRole('button', {
                name: 'Groep 8',
            })
        );
        expect(screen.queryByLabelText('voTrack.section_label')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('studentsPage.form_class_color'), { target: { value: '#123456' } });
        // The Clear button resets the color → save persists undefined.
        fireEvent.click(screen.getByText('common.clear'));
        fireEvent.click(screen.getByText('common.save'));
        expect(mockUpdateClass).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Renamed A',
                year: 'groep-8',
                years: ['groep-8'],
                voTrack: undefined,
                voTracks: undefined,
                color: undefined,
            })
        );
    });

    it('connects several years and several tracks to one class', () => {
        renderPage();
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[0]);
        fireEvent.click(screen.getByText('studentsPage.action_rename'));
        const yearGroup = () => screen.getByRole('group', { name: 'studentsPage.form_school_year' });
        // Primary years only → no VO track group to choose from.
        fireEvent.click(within(yearGroup()).getByRole('button', { name: 'Groep 7' }));
        fireEvent.click(within(yearGroup()).getByRole('button', { name: 'Groep 8' }));
        expect(screen.queryByLabelText('voTrack.section_label')).not.toBeInTheDocument();
        // Adding a secondary year brings the track group back.
        fireEvent.click(within(yearGroup()).getByRole('button', { name: 'Jaar 1' }));
        const trackGroup = screen.getByRole('group', { name: 'voTrack.section_label' });
        fireEvent.click(within(trackGroup).getByRole('button', { name: 'VMBO-TL' }));
        fireEvent.click(within(trackGroup).getByRole('button', { name: 'HAVO' }));
        fireEvent.click(screen.getByText('common.save'));
        expect(mockUpdateClass).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Class A',
                years: ['groep-7', 'groep-8', 'jaar-1'],
                year: 'groep-7',
                voTracks: ['vmbo-tl', 'havo'],
                voTrack: 'vmbo-tl',
                color: undefined,
            })
        );
    });

    it('seeds a heterogeneous class and drops its tracks when no track-capable year remains', () => {
        renderPage();
        // Class E mixes VMBO-TL and HAVO within jaar-3.
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[4]);
        fireEvent.click(screen.getByText('studentsPage.action_rename'));
        const trackGroup = screen.getByRole('group', { name: 'voTrack.section_label' });
        expect(within(trackGroup).getByRole('button', { name: 'HAVO' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(trackGroup).getByRole('button', { name: 'VMBO-TL' })).toHaveAttribute('aria-pressed', 'true');
        const yearGroup = () => screen.getByRole('group', { name: 'studentsPage.form_school_year' });
        fireEvent.click(within(yearGroup()).getByRole('button', { name: 'Jaar 3' }));
        fireEvent.click(within(yearGroup()).getByRole('button', { name: 'Groep 7' }));
        expect(screen.queryByLabelText('voTrack.section_label')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('common.save'));
        expect(mockUpdateClass).toHaveBeenCalledWith(
            expect.objectContaining({ year: 'groep-7', years: ['groep-7'], voTrack: undefined, voTracks: undefined })
        );
    });

    it('clears a school-year tag the class no longer teaches', () => {
        renderPage();
        // Class F mixes groep 7 & 8; Sara is tagged to the second of the two.
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[5]);
        fireEvent.click(screen.getByText('studentsPage.action_rename'));
        fireEvent.click(
            within(screen.getByRole('group', { name: 'studentsPage.form_school_year' })).getByRole('button', {
                name: 'Groep 8',
            })
        );
        fireEvent.click(screen.getByText('common.save'));
        expect(mockUpdateClass).toHaveBeenCalledWith(expect.objectContaining({ years: ['groep-7'] }));
        expect(mockUpdateStudent).toHaveBeenCalledTimes(1);
        const payload = mockUpdateStudent.mock.calls[0][0] as Student;
        expect(payload.id).toBe('s9');
        // Written as an explicit undefined so the stored tag is cleared, not merely ignored.
        expect('schoolYear' in payload).toBe(true);
        expect(payload.schoolYear).toBeUndefined();
    });

    it('clears a VO-track tag the class no longer teaches', () => {
        renderPage();
        // Class E mixes HAVO and VMBO-TL; Rick is pinned to the second of the two.
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[4]);
        fireEvent.click(screen.getByText('studentsPage.action_rename'));
        fireEvent.click(
            within(screen.getByRole('group', { name: 'voTrack.section_label' })).getByRole('button', {
                name: 'VMBO-TL',
            })
        );
        fireEvent.click(screen.getByText('common.save'));
        expect(mockUpdateClass).toHaveBeenCalledWith(
            expect.objectContaining({ years: ['jaar-3'], voTracks: ['havo'], voTrack: 'havo' })
        );
        expect(mockUpdateStudent).toHaveBeenCalledTimes(1);
        const payload = mockUpdateStudent.mock.calls[0][0] as Student;
        expect(payload.id).toBe('s8');
        expect('voTrack' in payload).toBe(true);
        expect(payload.voTrack).toBeUndefined();
    });

    it('leaves student tags alone when the class keeps every year and track', () => {
        renderPage();
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[4]);
        fireEvent.click(screen.getByText('studentsPage.action_rename'));
        fireEvent.click(screen.getByText('common.save'));
        expect(mockUpdateClass).toHaveBeenCalled();
        expect(mockUpdateStudent).not.toHaveBeenCalled();
    });

    it('renames a class without touching year/track/color (undefined fallbacks)', () => {
        renderPage();
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[0]);
        fireEvent.click(screen.getByText('studentsPage.action_rename'));
        fireEvent.click(screen.getByText('common.save'));
        expect(mockUpdateClass).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Class A', voTrack: undefined, year: undefined, color: undefined })
        );
    });

    it('renames a class keeping a track and saving via Enter', () => {
        renderPage();
        // c2 has voTrack + year + color → seeds all rename fields as pressed chips.
        const menus = screen.getAllByLabelText('studentsPage.action_class_menu');
        fireEvent.click(menus[1]);
        fireEvent.click(screen.getByText('studentsPage.action_rename'));
        const trackGroup = screen.getByRole('group', { name: 'voTrack.section_label' });
        expect(within(trackGroup).getByRole('button', { name: 'VWO' })).toHaveAttribute('aria-pressed', 'true');
        expect(
            within(screen.getByRole('group', { name: 'studentsPage.form_school_year' })).getByRole('button', {
                name: 'Jaar 1',
            })
        ).toHaveAttribute('aria-pressed', 'true');
        // Enter with an empty name does not save.
        const nameInput = screen.getAllByDisplayValue('Class B').find((el) => el.tagName === 'INPUT')!;
        fireEvent.change(nameInput, { target: { value: '' } });
        fireEvent.keyDown(nameInput, { key: 'Enter' });
        expect(mockUpdateClass).not.toHaveBeenCalled();
        fireEvent.change(nameInput, { target: { value: 'Class B' } });
        fireEvent.keyDown(nameInput, { key: 'Enter' });
        expect(mockUpdateClass).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Class B',
                voTrack: 'vwo',
                voTracks: ['vwo'],
                year: 'jaar-1',
                years: ['jaar-1'],
                color: '#ff0000',
            })
        );
    });

    it('merges a class into a target after confirming, replacing the selection', () => {
        renderPage();
        // c1 is the active (selected) cohort; c3 is also selected (kept unchanged by the merge).
        fireEvent.click(screen.getByRole('button', { name: /Class C/ }));
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[0]);
        fireEvent.click(screen.getByText('studentsPage.action_merge'));
        expect(screen.getByText('studentsPage.merge_class_title')).toBeInTheDocument();
        const mergeSelect = screen.getAllByRole('combobox').find((s) => (s as HTMLSelectElement).options[0]?.disabled)!;
        fireEvent.change(mergeSelect, { target: { value: 'c2' } });
        fireEvent.click(screen.getByText('studentsPage.action_merge_classes'));
        expect(screen.getByText('studentsPage.merge_confirm_action')).toBeInTheDocument();
        fireEvent.click(screen.getByText('studentsPage.merge_confirm_action'));
        expect(mockMergeClasses).toHaveBeenCalledWith('c1', 'c2');
        // The selected cohort is rewritten to the merge target.
        expect(mockUpdateSettings).toHaveBeenCalled();
    });

    it('merges a class that is not in the current selection', () => {
        renderPage();
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[1]);
        fireEvent.click(screen.getByText('studentsPage.action_merge'));
        const mergeSelect = screen.getAllByRole('combobox').find((s) => (s as HTMLSelectElement).options[0]?.disabled)!;
        fireEvent.change(mergeSelect, { target: { value: 'c3' } });
        fireEvent.click(screen.getByText('studentsPage.action_merge_classes'));
        fireEvent.click(screen.getByText('studentsPage.merge_confirm_action'));
        expect(mockMergeClasses).toHaveBeenCalledWith('c2', 'c3');
    });

    it('deletes a class after confirming and deselects it', () => {
        renderPage();
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[0]);
        fireEvent.click(screen.getByText('studentsPage.action_delete'));
        expect(screen.getByText('studentsPage.delete_class_title')).toBeInTheDocument();
        expect(screen.getByText(/studentsPage\.delete_class_warning/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.delete'));
        expect(mockDeleteClass).toHaveBeenCalledWith('c1', true);
    });

    it('opens and closes the class context menu', () => {
        renderPage();
        const menuBtn = screen.getAllByLabelText('studentsPage.action_class_menu')[0];
        fireEvent.click(menuBtn);
        expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(menuBtn);
        expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
    });

    it('shows plural rubric counts and a singular graded badge', () => {
        renderPage();
        // Class D links two rubrics → plural chip title.
        expect(screen.getByTitle('2 studentsPage.rubric_plural')).toBeInTheDocument();
        // Grace has exactly one graded rubric → singular badge text.
        expect(screen.getByText('1 studentsPage.rubric_single')).toBeInTheDocument();
    });

    it('presses Enter on the empty new-class input (no-op)', () => {
        renderPage();
        fireEvent.keyDown(screen.getByPlaceholderText('studentsPage.new_class_placeholder'), { key: 'Enter' });
        expect(mockAddClass).not.toHaveBeenCalled();
    });

    it('shows the delete-student fallback texts when translations are empty', () => {
        h.t.mockImplementation((key: string, opts?: string | Record<string, unknown>) => {
            if (
                key === 'studentsPage.delete_student_title' ||
                key === 'studentsPage.warning_label' ||
                key === 'studentsPage.delete_student_warning'
            ) {
                return '';
            }
            return h.defaultT(key, opts);
        });
        renderPage();
        const rows = screen.getAllByRole('row');
        const aliceRow = rows.find((r) => within(r).queryByText('Alice'))!;
        fireEvent.click(within(aliceRow).getByLabelText('studentsPage.action_delete_student'));
        expect(screen.getByText('Delete Student')).toBeInTheDocument();
        expect(screen.getByText('Warning:')).toBeInTheDocument();
        expect(screen.getByText(/This will permanently delete all grades/)).toBeInTheDocument();
    });

    it('renders with undefined per-student collections', () => {
        mockAppValue.studentRubrics = undefined;
        mockAppValue.selfAssessments = undefined;
        mockAppValue.analysisResults = undefined;
        mockAppValue.studentTests = undefined;
        mockAppValue.tests = undefined;
        renderPage();
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('renders when the students collection is undefined', () => {
        mockAppValue.students = undefined;
        renderPage();
        expect(screen.getByText('studentsPage.all_cohorts')).toBeInTheDocument();
    });

    it('shows a summary for a rubric without a grade scale id', () => {
        renderPage();
        const rows = screen.getAllByRole('row');
        const graceRow = rows.find((r) => within(r).queryByText('Grace'))!;
        fireEvent.click(within(graceRow).getByTitle('studentsPage.action_copy_summary'));
        const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
        expect(textarea.value).toContain('Rubric: Old Rubric');
        expect(textarea.value).toContain('Score: 100.0% (A) — 4/4 pts');
    });

    it('closes every modal via Escape, the close button and cancel', () => {
        renderPage();
        // Every dialog on this page is the shared Radix-backed Modal, so it closes on Escape, ✕ or
        // Cancel. Backdrop dismissal is Radix's own pointerdown-based outside-interaction detection,
        // covered by Modal.test.tsx — a bare fireEvent.click on .modal-overlay doesn't trigger it.
        fireEvent.click(screen.getAllByText('studentsPage.add_student')[0]);
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByText('studentsPage.add_student_title')).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByText('studentsPage.add_student')[0]);
        fireEvent.click(screen.getByLabelText('Close'));
        expect(screen.queryByText('studentsPage.add_student_title')).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByText('studentsPage.add_student')[0]);
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('studentsPage.add_student_title')).not.toBeInTheDocument();

        // Rename modal: overlay, ✕, cancel.
        const openRename = () => {
            fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[0]);
            fireEvent.click(screen.getByText('studentsPage.action_rename'));
        };
        openRename();
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByText('voTrack.class_settings_title')).not.toBeInTheDocument();
        openRename();
        fireEvent.click(screen.getAllByText('✕')[0]);
        expect(screen.queryByText('voTrack.class_settings_title')).not.toBeInTheDocument();
        openRename();
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('voTrack.class_settings_title')).not.toBeInTheDocument();

        // Merge modal: overlay, ✕, cancel.
        const openMerge = () => {
            fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[0]);
            fireEvent.click(screen.getByText('studentsPage.action_merge'));
        };
        openMerge();
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByText('studentsPage.merge_class_title')).not.toBeInTheDocument();
        openMerge();
        fireEvent.click(screen.getAllByText('✕')[0]);
        expect(screen.queryByText('studentsPage.merge_class_title')).not.toBeInTheDocument();
        openMerge();
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('studentsPage.merge_class_title')).not.toBeInTheDocument();

        // Delete-class modal: overlay, ✕, cancel.
        const openDeleteClass = () => {
            fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[0]);
            fireEvent.click(screen.getByText('studentsPage.action_delete'));
        };
        openDeleteClass();
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByText('studentsPage.delete_class_title')).not.toBeInTheDocument();
        openDeleteClass();
        fireEvent.click(screen.getAllByText('✕')[0]);
        expect(screen.queryByText('studentsPage.delete_class_title')).not.toBeInTheDocument();
        openDeleteClass();
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('studentsPage.delete_class_title')).not.toBeInTheDocument();

        // Delete-student modal: overlay, ✕, cancel.
        const aliceRow = screen.getAllByRole('row').find((r) => within(r).queryByText('Alice'))!;
        fireEvent.click(within(aliceRow).getByLabelText('studentsPage.action_delete_student'));
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByText('studentsPage.delete_student_title')).not.toBeInTheDocument();
        fireEvent.click(within(aliceRow).getByLabelText('studentsPage.action_delete_student'));
        fireEvent.click(screen.getAllByText('✕')[0]);
        expect(screen.queryByText('studentsPage.delete_student_title')).not.toBeInTheDocument();
        fireEvent.click(within(aliceRow).getByLabelText('studentsPage.action_delete_student'));
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('studentsPage.delete_student_title')).not.toBeInTheDocument();

        // Summary modal: overlay + ✕.
        fireEvent.click(within(aliceRow).getByTitle('studentsPage.action_copy_summary'));
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(document.querySelector('textarea')).not.toBeInTheDocument();
        fireEvent.click(within(aliceRow).getByTitle('studentsPage.action_copy_summary'));
        fireEvent.click(screen.getAllByText('✕')[0]);
        expect(document.querySelector('textarea')).not.toBeInTheDocument();

        // Link-rubrics modal: overlay + ✕.
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[0]);
        fireEvent.click(screen.getByText('studentsPage.link_rubrics'));
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByText(/link_rubrics_title/)).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[0]);
        fireEvent.click(screen.getByText('studentsPage.link_rubrics'));
        fireEvent.click(screen.getAllByText('✕')[0]);
        expect(screen.queryByText(/link_rubrics_title/)).not.toBeInTheDocument();
    });

    it('toggles a rubric link off in the link-rubrics modal and shows the empty state', () => {
        renderPage();
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[0]);
        fireEvent.click(screen.getByText('studentsPage.link_rubrics'));
        // c1 links r1 → first checkbox is checked; clicking removes it.
        const checkbox = screen.getAllByRole('checkbox')[0];
        expect(checkbox).toBeChecked();
        fireEvent.click(checkbox);
        expect(mockUpdateClass).toHaveBeenCalledWith(expect.objectContaining({ rubricIds: [] }));
    });

    it('shows the no-rubrics empty state in the link modal', () => {
        mockAppValue.rubrics = [];
        renderPage();
        fireEvent.click(screen.getAllByLabelText('studentsPage.action_class_menu')[1]);
        fireEvent.click(screen.getByText('studentsPage.link_rubrics'));
        expect(screen.getByText(/No rubrics yet/)).toBeInTheDocument();
    });

    it('shows the empty state with hint and add button when there are no students', () => {
        mockAppValue.classes = [];
        mockAppValue.students = [];
        mockAppValue.studentRubrics = [];
        renderPage();
        expect(screen.getByText('studentsPage.no_students')).toBeInTheDocument();
        expect(screen.getByText('Add students to this class to start grading.')).toBeInTheDocument();
        // Empty-state add button (header + empty state + modal submit all share the label).
        fireEvent.click(screen.getAllByText('studentsPage.add_student').at(-1)!);
        fireEvent.change(screen.getByPlaceholderText('studentsPage.form_name_placeholder'), {
            target: { value: 'Solo' },
        });
        fireEvent.click(screen.getAllByText('studentsPage.add_student').at(-1)!);
        expect(mockAddStudent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Solo', classId: '' }));
    });

    it('runs the tour and finishes/skips via the joyride events', () => {
        renderPage();
        fireEvent.click(screen.getByText('tutorial.students_tour_button'));
        expect(h.joyrideEvent).toBeDefined();
        h.joyrideEvent!({ status: 'finished' });
        h.joyrideEvent!({ status: 'skipped' });
        h.joyrideEvent!({ status: 'running' });
    });

    it('renders the overall percentage fallback when no grade scale exists', () => {
        mockAppValue.gradeScales = [];
        renderPage();
        // Graded students show the raw percentage text instead of a letter grade, no crash.
        expect(screen.getAllByText(/100%/).length).toBeGreaterThan(0);
    });
});
