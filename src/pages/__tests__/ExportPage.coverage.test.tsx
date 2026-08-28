import React from 'react';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type {
    Class,
    DocumentAnalysisResult,
    ExportTemplate,
    GradeScale,
    Rubric,
    Student,
    StudentRubric,
    AppSettings,
    EssayAssignment,
    EssaySubmission,
    StudentTest,
    Test as RmTest,
} from '../../types';

// ---- Hoisted mock state ----
const joyrideState = vi.hoisted(() => ({ onEvent: null as null | ((d: { status: string }) => void) }));
const inlineForShare = vi.hoisted(() => vi.fn((sr: StudentRubric) => Promise.resolve(sr)));

vi.mock('react-joyride', () => {
    const STATUS = { FINISHED: 'finished', SKIPPED: 'skipped', RUNNING: 'running' };
    return {
        STATUS,
        Joyride: ({ onEvent }: { onEvent: (d: { status: string }) => void }) => {
            joyrideState.onEvent = onEvent;
            return React.createElement('div', { 'data-testid': 'joyride-mock' });
        },
    };
});

vi.mock('../../services/database', () => ({
    storageSync: {
        feedbackAudioSync: { inlineForShare },
    },
}));

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const level = (id: string, label: string, min: number, max: number) => ({
    id,
    label,
    minPoints: min,
    maxPoints: max,
    description: '',
    subItems: [],
});

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [
        { id: 'c1', title: 'Content', description: '', weight: 40, levels: [level('l1', 'Great', 90, 100)] },
        { id: 'c2', title: 'Structure', description: '', weight: 30, levels: [level('l2', 'OK', 60, 89)] },
        { id: 'c3', title: 'Fixed', description: '', weight: 15, levels: [level('l3', 'Full', 50, 50)] },
        { id: 'c4', title: 'Range', description: '', weight: 10, levels: [level('l4', 'Partial', 10, 20)] },
        { id: 'c5', title: 'Untouched', description: '', weight: 5, levels: [level('l5', 'None', 0, 9)] },
    ],
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
    name: 'Rubric 2',
    gradeScaleId: 'none',
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const emptyClass: Class = { id: 'c2', name: 'Empty Class' };

const mockStudent: Student = {
    id: 's1',
    name: 'Alice',
    email: 'alice@example.com',
    studentNumber: 'A1',
    classId: 'c1',
};
const mockStudent2: Student = { id: 's2', name: 'Bob', classId: 'c1' };
const orphanStudent: Student = { id: 's3', name: 'Carol', classId: 'c1' };

const baseSr = (over: Partial<StudentRubric>): StudentRubric => ({
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [
        { criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' },
        { criterionId: 'c2', levelId: 'l2', checkedSubItems: [], comment: '' },
    ],
    overallComment: 'Well done',
    isPeerReview: false,
    gradedAt: '2024-01-15T10:00:00Z',
    ...over,
});

const mockSr: StudentRubric = baseSr({});

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    exportTemplateId: 'tbl1',
    styleTemplateId: 'sty1',
};

const mockEssayAssignment: EssayAssignment = {
    rubricId: 'r1',
    studentId: 's1',
    teacherKey: 'tk1',
    title: 'My Essay',
    readOnlyAfterSubmit: true,
    createdAt: '2024-01-01T00:00:00Z',
    expiresAt: '2024-02-01T00:00:00Z',
};

const mockEssaySubmission: EssaySubmission = {
    id: 'sub1',
    assignmentRubricId: 'r1',
    assignmentStudentId: 's1',
    teacherKey: 'tk1',
    contentHtml: '<p>hi</p>',
    wordCount: 1,
    submittedAt: '2024-01-02T00:00:00Z',
};

const mockTableTemplate: ExportTemplate = {
    id: 'tbl1',
    name: 'Table T',
    kind: 'table',
    dataUrl: '',
    levelHeaders: ['A', 'B'],
    size: 1024,
    addedAt: '2024-01-01T00:00:00Z',
};

const mockStyleTemplate: ExportTemplate = {
    id: 'sty1',
    name: 'Style T',
    kind: 'style',
    dataUrl: '',
    levelHeaders: [],
    size: 2048,
    addedAt: '2024-01-01T00:00:00Z',
};

const mockAnalysis: DocumentAnalysisResult = {
    id: 'a1',
    studentId: 's1',
    rubricId: 'r1',
    attachmentId: 'at1',
    extractedText: 'text',
    analyzedAt: '2024-01-02T00:00:00Z',
    detectedItems: [],
    grammarErrors: [],
    grammarCheckerUsed: 'none',
};

const mockTest: RmTest = {
    id: 't1',
    name: 'Period Test',
    questions: [],
    sections: [],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-01T00:00:00Z',
};

const mockStudentTest: StudentTest = {
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [],
    status: 'graded',
    startedAt: '2024-01-10T00:00:00Z',
    gradedAt: '2024-01-16T10:00:00Z',
};

const mockShowToast = vi.fn();

let appOverrides: Record<string, unknown> = {};

const makeAppContextMock = () => ({
    rubrics: [mockRubric, mockRubric2],
    students: [mockStudent, mockStudent2, orphanStudent],
    classes: [mockClass, emptyClass],
    studentRubrics: [mockSr],
    gradeScales: [mockGradeScale],
    settings: mockSettings,
    exportTemplates: [mockTableTemplate, mockStyleTemplate],
    updateSettings: vi.fn(),
    saveStudentRubric: vi.fn(),
    selfAssessments: [],
    analysisResults: [mockAnalysis],
    tests: [mockTest],
    studentTests: [mockStudentTest],
    essayAssignments: [mockEssayAssignment],
    essaySubmissions: [mockEssaySubmission],
    ...appOverrides,
});
vi.mock('../../context/AppContext', () => ({
    useRoster: () => makeAppContextMock(),
    useStudents: () => makeAppContextMock(),
    useClasses: () => makeAppContextMock(),
    useGrading: () => makeAppContextMock(),
    useAuthoring: () => makeAppContextMock(),
    useAssessment: () => makeAppContextMock(),
    useEssays: () => makeAppContextMock(),
    useFlashcards: () => makeAppContextMock(),
    useSettings: () => makeAppContextMock(),
    usePlatform: () => makeAppContextMock(),
}));
vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: Record<string, unknown>) => unknown) => selector(makeAppContextMock()),
    useStoreActions: () => makeAppContextMock(),
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

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../services/database/AuditLogger', () => ({ logAuditEvent: vi.fn() }));

const mockExportSinglePdf = vi.fn().mockResolvedValue(undefined);
const mockExportBatchPdf = vi.fn().mockResolvedValue(undefined);
vi.mock('../../utils/pdfExport', () => ({
    exportSinglePdf: (...args: unknown[]) => mockExportSinglePdf(...args),
    exportBatchPdf: (...args: unknown[]) => mockExportBatchPdf(...args),
}));

const mockExportBatchDocx = vi.fn().mockResolvedValue(undefined);
const mockExportRubricToDocx = vi.fn().mockResolvedValue(undefined);
vi.mock('../../utils/docxExport', () => ({
    exportBatchDocx: (...args: unknown[]) => mockExportBatchDocx(...args),
    exportRubricToDocx: (...args: unknown[]) => mockExportRubricToDocx(...args),
}));

const mockExportRubricWithTemplate = vi.fn().mockResolvedValue(undefined);
vi.mock('../../utils/docxTemplateExport', () => ({
    exportRubricWithTemplate: (...args: unknown[]) => mockExportRubricWithTemplate(...args),
}));

const mockExportEssaysBatch = vi.fn().mockResolvedValue(undefined);
const mockExportEssayWithRubric = vi.fn().mockResolvedValue(undefined);
vi.mock('../../utils/essayExport', () => ({
    exportEssaysBatch: (...args: unknown[]) => mockExportEssaysBatch(...args),
    exportEssayWithRubric: (...args: unknown[]) => mockExportEssayWithRubric(...args),
}));

const mockBuildIcs = vi.fn((..._args: unknown[]) => 'BEGIN:VCALENDAR');
vi.mock('../../utils/icsExport', () => ({ buildIcs: (...args: unknown[]) => mockBuildIcs(...args) }));

const mockExportPeriodReportsBatch = vi.fn().mockResolvedValue(undefined);
const mockExportReportCard = vi.fn().mockResolvedValue(undefined);
const mockExportReportCardsBatch = vi.fn().mockResolvedValue(undefined);
vi.mock('../../utils/periodReportExport', () => ({
    exportPeriodReportsBatch: (...args: unknown[]) => mockExportPeriodReportsBatch(...args),
    exportReportCard: (...args: unknown[]) => mockExportReportCard(...args),
    exportReportCardsBatch: (...args: unknown[]) => mockExportReportCardsBatch(...args),
}));

vi.mock('../../utils/reportCardAggregator', () => ({
    buildReportCardData: vi.fn().mockResolvedValue({}),
}));

let ExportPageComp: React.ComponentType;

function renderPage() {
    const router = createMemoryRouter([{ path: '/export', element: <ExportPageComp /> }], {
        initialEntries: ['/export'],
    });
    return render(<RouterProvider router={router} />);
}

function openSection(titleKey: string) {
    fireEvent.click(screen.getByText(titleKey));
}

function selectStudentRow() {
    openSection('exportPage.rubric_students_section_title');
    const aliceCell = screen.getAllByText('Alice').find((el) => el.tagName === 'TD');
    fireEvent.click(aliceCell!);
}

describe('ExportPage coverage', () => {
    beforeEach(async () => {
        appOverrides = {};
        mockShowToast.mockClear();
        vi.clearAllMocks();
        joyrideState.onEvent = null;
        inlineForShare.mockImplementation((sr: StudentRubric) => Promise.resolve(sr));
        global.URL.createObjectURL = vi.fn(() => 'blob:fake');
        global.URL.revokeObjectURL = vi.fn();
        HTMLAnchorElement.prototype.click = vi.fn();
        Object.assign(navigator, {
            clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
        vi.spyOn(window, 'open').mockImplementation(() => null);
        const mod = await import('../ExportPage');
        ExportPageComp = mod.default;
    });

    it('shows the empty state when no rubrics exist', () => {
        appOverrides = { rubrics: [] };
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        expect(screen.getByText('exportPage.no_rubric')).toBeInTheDocument();
    });

    it('switches rubrics and shows the no-students empty state', () => {
        renderPage();
        fireEvent.change(screen.getByDisplayValue('Essay Rubric'), { target: { value: 'r2' } });
        openSection('exportPage.rubric_students_section_title');
        expect(screen.getByText('exportPage.no_students')).toBeInTheDocument();
    });

    it('toggles a student off and deselects all', () => {
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        fireEvent.click(screen.getByText('exportPage.select_all'));
        fireEvent.click(screen.getByText('exportPage.deselect_all'));
        expect(screen.getByText('exportPage.select_all')).toBeInTheDocument();
        // select all again, then uncheck the single row
        fireEvent.click(screen.getByText('exportPage.select_all'));
        const checkbox = screen.getByLabelText('Alice') as HTMLInputElement;
        expect(checkbox.checked).toBe(true);
        fireEvent.click(checkbox);
        expect(checkbox.checked).toBe(false);
    });

    it('copies a feedback link and opens the dev preview', async () => {
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        await act(async () => {
            fireEvent.click(screen.getByTitle('Copy student feedback link'));
        });
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith('Feedback link copied to clipboard', 'success');
        await act(async () => {
            fireEvent.click(screen.getByTitle('Open as student (dev only)'));
        });
        expect(window.open).toHaveBeenCalled();
    });

    it('exports the generic CSV with all per-criterion score shapes', async () => {
        appOverrides = {
            studentRubrics: [
                baseSr({
                    id: 'sr1',
                    entries: [
                        { criterionId: 'c1', levelId: null, overridePoints: 85, checkedSubItems: [], comment: 'fixed' },
                        { criterionId: 'c2', levelId: null, selectedPoints: 40, checkedSubItems: [], comment: '' },
                        { criterionId: 'c3', levelId: 'l3', checkedSubItems: [], comment: '' },
                        { criterionId: 'c4', levelId: 'l4', checkedSubItems: [], comment: '' },
                    ],
                    globalModifier: { type: 'points', value: 2, reason: 'curve' },
                    overallComment: 'Nice',
                    gradedAt: '2024-01-15T10:00:00Z',
                }),
            ],
        };
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        fireEvent.click(screen.getByText('exportPage.select_all'));
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.csv_export_count/));
        });
        expect(global.URL.createObjectURL).toHaveBeenCalled();
    });

    it('exports a preset CSV and returns early', async () => {
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        fireEvent.change(screen.getByLabelText('exportPage.csv_preset_label'), { target: { value: 'magister' } });
        fireEvent.click(screen.getByText('exportPage.select_all'));
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.csv_export_count/));
        });
        expect(global.URL.createObjectURL).toHaveBeenCalled();
    });

    it('bulk-marks not handed in and bulk-appends a comment', () => {
        const saveStudentRubric = vi.fn();
        appOverrides = { saveStudentRubric };
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        fireEvent.click(screen.getByText('exportPage.select_all'));
        // toggle the bulk comment input open/closed and reopen
        fireEvent.click(screen.getByText('exportPage.bulk_add_comment'));
        fireEvent.click(screen.getByLabelText('common.close'));
        fireEvent.click(screen.getByText('exportPage.bulk_add_comment'));
        // empty Enter does nothing
        const input = screen.getByPlaceholderText('exportPage.bulk_comment_placeholder');
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(saveStudentRubric).not.toHaveBeenCalled();
        // type and confirm via Enter
        fireEvent.change(input, { target: { value: 'See me' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(saveStudentRubric).toHaveBeenCalledWith(expect.objectContaining({ overallComment: 'Well done See me' }));
        // bulk mark NHI
        fireEvent.click(screen.getByText('exportPage.bulk_nhi'));
        expect(saveStudentRubric).toHaveBeenCalledWith(expect.objectContaining({ notHandedIn: true }));
        expect(mockShowToast).toHaveBeenCalledWith('Marked 1 student(s) as not handed in', 'success');
    });

    it('exports essays with rubric analysis and skips ungraded ones', async () => {
        const secondAssignment: EssayAssignment = {
            ...mockEssayAssignment,
            studentId: 's2',
            title: 'Bob Essay',
            createdAt: '2024-01-02T00:00:00Z',
            expiresAt: '2024-02-02T00:00:00Z',
        };
        const secondSubmission: EssaySubmission = {
            ...mockEssaySubmission,
            id: 'sub2',
            assignmentStudentId: 's2',
            submittedAt: '2024-01-03T00:00:00Z',
        };
        appOverrides = {
            essayAssignments: [mockEssayAssignment, secondAssignment],
            essaySubmissions: [mockEssaySubmission, secondSubmission],
        };
        renderPage();
        openSection('exportPage.essays_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.essays_select_assignment_placeholder'), {
            target: { value: 'tk1' },
        });
        // include rubric analysis + docx format
        fireEvent.click(screen.getByText('exportPage.essays_include_rubric_analysis'));
        fireEvent.change(screen.getByDisplayValue('PDF'), { target: { value: 'docx' } });
        fireEvent.click(screen.getAllByText(/exportPage.select_all/)[1]);
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.essays_export_button'));
        });
        expect(mockExportEssayWithRubric).toHaveBeenCalledTimes(1);
        expect(mockShowToast).toHaveBeenCalledWith(
            expect.stringContaining('exportPage.essays_skipped_ungraded'),
            'error'
        );
    });

    it('exports essays via the batch path and handles analysis export failure', async () => {
        renderPage();
        openSection('exportPage.essays_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.essays_select_assignment_placeholder'), {
            target: { value: 'tk1' },
        });
        // markdown disables analysis; combined batch mode
        fireEvent.change(screen.getByDisplayValue('PDF'), { target: { value: 'markdown' } });
        fireEvent.change(screen.getByDisplayValue('exportPage.essays_mode_separate'), {
            target: { value: 'combined' },
        });
        fireEvent.click(screen.getAllByText(/exportPage.select_all/)[1]);
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.essays_export_button'));
        });
        expect(mockExportEssaysBatch).toHaveBeenCalled();
        // failure path
        mockExportEssaysBatch.mockRejectedValueOnce(new Error('boom'));
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.essays_export_button'));
        });
        expect(mockShowToast).toHaveBeenCalledWith('toast.export_error', 'error');
    });

    it('shows no-submissions and no-ops the export without selections', () => {
        appOverrides = {
            essayAssignments: [{ ...mockEssayAssignment, studentId: 's3', title: 'Orphan Essay' }],
            essaySubmissions: [],
        };
        renderPage();
        openSection('exportPage.essays_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.essays_select_assignment_placeholder'), {
            target: { value: 'tk1' },
        });
        expect(screen.getByText('exportPage.essays_no_submissions')).toBeInTheDocument();
        fireEvent.click(screen.getByText('exportPage.essays_export_button'));
        expect(mockExportEssaysBatch).not.toHaveBeenCalled();
    });

    it('dedupes essay deadlines per teacher key in ICS', async () => {
        const secondAssignment: EssayAssignment = {
            ...mockEssayAssignment,
            studentId: 's2',
            title: 'Bob Essay',
            createdAt: '2024-01-02T00:00:00Z',
            expiresAt: '2024-02-02T00:00:00Z',
        };
        const noDeadline: EssayAssignment = {
            ...mockEssayAssignment,
            studentId: 's3',
            title: 'No Deadline',
            createdAt: '2024-01-02T00:00:00Z',
        };
        appOverrides = { essayAssignments: [mockEssayAssignment, secondAssignment, noDeadline] };
        renderPage();
        openSection('exportPage.essays_title');
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.ics_export_button'));
        });
        expect(mockBuildIcs).toHaveBeenCalledTimes(1);
    });

    it('toasts when no essay deadlines exist', async () => {
        appOverrides = { essayAssignments: [{ ...mockEssayAssignment, expiresAt: undefined }] };
        renderPage();
        openSection('exportPage.essays_title');
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.ics_export_button'));
        });
        expect(mockShowToast).toHaveBeenCalledWith('exportPage.ics_export_none', 'error');
    });

    it('exports a single PDF with landscape orientation', async () => {
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        fireEvent.change(screen.getByDisplayValue('rubricBuilder.format_portrait'), {
            target: { value: 'landscape' },
        });
        await act(async () => {
            fireEvent.click(screen.getByText('PDF'));
        });
        expect(mockExportSinglePdf).toHaveBeenCalled();
        // batch PDF with pad-for-double-sided toggled
        fireEvent.click(screen.getByText('exportPage.pad_double_sided'));
        fireEvent.click(screen.getByText('exportPage.select_all'));
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.print_to_pdf/));
        });
        expect(mockExportBatchPdf).toHaveBeenCalled();
    });

    it('exports the word template and clears it', async () => {
        renderPage();
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.export_word_template/));
        });
        expect(mockExportRubricWithTemplate).toHaveBeenCalled();
        // switch the template select then clear it
        const templateSelect = screen.getByDisplayValue(/Table T/);
        fireEvent.change(templateSelect, { target: { value: '' } });
        expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('generates period reports with date filters and peer-review exclusion', async () => {
        const peerReview = baseSr({ id: 'sr2', studentId: 's1', isPeerReview: true });
        const notHandedIn = baseSr({ id: 'sr3', studentId: 's1', notHandedIn: true });
        const outOfWindow = baseSr({ id: 'sr4', studentId: 's1', gradedAt: '2024-03-01T10:00:00Z' });
        const snapshotSr = baseSr({
            id: 'sr5',
            studentId: 's2',
            rubricId: 'r2',
            gradedAt: '2024-01-16T10:00:00Z',
            rubricSnapshot: { ...mockRubric2, gradeScaleId: 'none' },
        });
        // no matching rubric and no snapshot → entry dropped by the gather guard
        const missingRubric = baseSr({ id: 'sr6', rubricId: 'missing' });
        appOverrides = {
            studentRubrics: [mockSr, peerReview, notHandedIn, outOfWindow, snapshotSr, missingRubric],
        };
        renderPage();
        openSection('exportPage.period_report_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.period_select_class'), { target: { value: 'c1' } });
        // select all then deselect all (period section's own button is the last one)
        fireEvent.click(screen.getAllByText(/exportPage.select_all/).at(-1)!);
        fireEvent.click(screen.getAllByText(/exportPage.deselect_all/).at(-1)!);
        // toggle Alice on, off, and back on (covers the delete + add sides of the toggle)
        const aliceBtn = screen.getAllByText('Alice').find((el) => el.tagName === 'BUTTON');
        fireEvent.click(aliceBtn!);
        fireEvent.click(aliceBtn!);
        fireEvent.click(aliceBtn!);
        // Bob is included so the snapshot entry (gradeScaleId 'none') hits the scale fallback
        const bobBtn = screen.getAllByText('Bob').find((el) => el.tagName === 'BUTTON');
        fireEvent.click(bobBtn!);
        // set the period window, from/to and label (labels aren't associated, so grab the inputs directly)
        const [fromInput, toInput] = document.querySelectorAll('input[type="date"]');
        fireEvent.change(fromInput, { target: { value: '2024-01-01' } });
        fireEvent.change(toInput, { target: { value: '2024-01-31' } });
        fireEvent.change(screen.getByPlaceholderText('exportPage.period_label_placeholder'), {
            target: { value: 'Semester 1' },
        });
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.period_generate_btn/));
        });
        expect(mockExportPeriodReportsBatch).toHaveBeenCalledTimes(1);
        expect(mockShowToast).toHaveBeenCalledWith(
            expect.stringContaining('exportPage.period_report_success'),
            'success'
        );
    });

    it('no-ops period generation without selected students and shows an empty class', () => {
        renderPage();
        openSection('exportPage.period_report_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.period_select_class'), { target: { value: 'c2' } });
        expect(screen.getByText('exportPage.period_no_students')).toBeInTheDocument();
        fireEvent.click(screen.getByText(/exportPage.period_generate_btn/));
        expect(mockExportPeriodReportsBatch).not.toHaveBeenCalled();
    });

    it('generates a single report card with config toggles', async () => {
        renderPage();
        openSection('exportPage.period_report_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.period_select_class'), { target: { value: 'c1' } });
        const aliceBtn = screen.getAllByText('Alice').find((el) => el.tagName === 'BUTTON');
        fireEvent.click(aliceBtn!);
        openSection('reportCard.title');
        // toggle every config checkbox
        fireEvent.click(screen.getByText('reportCard.section_rubrics'));
        fireEvent.click(screen.getByText('reportCard.section_standards'));
        fireEvent.click(screen.getByText('reportCard.section_learning_goals'));
        fireEvent.click(screen.getByText('reportCard.section_cefr'));
        fireEvent.click(screen.getByText('reportCard.section_test_summary'));
        await act(async () => {
            fireEvent.click(screen.getByText('reportCard.generate_single_btn'));
        });
        expect(mockExportReportCard).toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith(
            expect.stringContaining('exportPage.report_card_success'),
            'success'
        );
    });

    it('runs the export tour and finishes it', () => {
        renderPage();
        fireEvent.click(screen.getByText('tutorial.export_tour_button'));
        expect(joyrideState.onEvent).not.toBeNull();
        joyrideState.onEvent!({ status: 'finished' });
        joyrideState.onEvent!({ status: 'skipped' });
        joyrideState.onEvent!({ status: 'running' });
    });

    it('shows the feedback-only and anchor badges', () => {
        appOverrides = {
            studentRubrics: [baseSr({ id: 'sr1', feedbackOnly: true, isAnchor: true })],
        };
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        expect(screen.getByText('exportPage.feedback_only_badge')).toBeInTheDocument();
        expect(screen.getByText('exportPage.anchor_badge')).toBeInTheDocument();
    });

    it('toasts when a batch PDF export fails', async () => {
        mockExportBatchPdf.mockRejectedValueOnce(new Error('boom'));
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        fireEvent.click(screen.getByText('exportPage.select_all'));
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.print_to_pdf/));
        });
        expect(mockShowToast).toHaveBeenCalledWith('toast.export_error', 'error');
    });

    it('exports the default word doc when no template is active', async () => {
        appOverrides = {
            settings: { ...mockSettings, exportTemplateId: undefined },
            exportTemplates: [],
        };
        renderPage();
        // no-templates help renders when the list is empty (mock t returns the fallback string)
        expect(screen.getByText(/No templates saved/)).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.export_word_default'));
        });
        expect(mockExportRubricToDocx).toHaveBeenCalled();
    });

    it('re-collapses the rubric section after opening it', () => {
        renderPage();
        const header = screen.getByText('exportPage.rubric_section_title');
        fireEvent.click(header); // open (delete from the collapsed set)
        fireEvent.click(header); // collapse again (add back)
        // content stays mounted either way; both toggle branches now covered
        expect(screen.getByText('exportPage.select_rubric')).toBeInTheDocument();
    });

    it('toggles essay students and the essay select-all', () => {
        // orphan submission has no matching assignment → dropped from the entry list
        appOverrides = {
            essaySubmissions: [
                mockEssaySubmission,
                { ...mockEssaySubmission, id: 'subOrphan', assignmentStudentId: 's9' },
            ],
        };
        renderPage();
        openSection('exportPage.essays_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.essays_select_assignment_placeholder'), {
            target: { value: 'tk1' },
        });
        const essaySection = document.getElementById('export-section-essays')!;
        const aliceBox = within(essaySection).getByLabelText('Alice') as HTMLInputElement;
        fireEvent.click(aliceBox); // add
        expect(aliceBox.checked).toBe(true);
        fireEvent.click(aliceBox); // delete
        expect(aliceBox.checked).toBe(false);
        fireEvent.click(within(essaySection).getByText(/exportPage.select_all/));
        expect(aliceBox.checked).toBe(true);
        fireEvent.click(within(essaySection).getByText(/exportPage.deselect_all/));
        expect(aliceBox.checked).toBe(false);
    });

    it('no-ops essay export when the selection no longer matches the group', async () => {
        const secondAssignment: EssayAssignment = {
            ...mockEssayAssignment,
            studentId: 's2',
            teacherKey: 'tk2',
            title: 'Bob Group',
        };
        appOverrides = {
            essayAssignments: [mockEssayAssignment, secondAssignment],
            essaySubmissions: [
                mockEssaySubmission,
                { ...mockEssaySubmission, id: 'sub2', assignmentStudentId: 's2', teacherKey: 'tk2' },
            ],
        };
        renderPage();
        openSection('exportPage.essays_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.essays_select_assignment_placeholder'), {
            target: { value: 'tk1' },
        });
        const essaySection = document.getElementById('export-section-essays')!;
        fireEvent.click(within(essaySection).getByLabelText('Alice'));
        // switch to tk2: the selection (s1) no longer matches any entry → early return
        fireEvent.change(within(essaySection).getByDisplayValue('My Essay'), { target: { value: 'tk2' } });
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.essays_export_button'));
        });
        expect(mockExportEssaysBatch).not.toHaveBeenCalled();
        expect(mockExportEssayWithRubric).not.toHaveBeenCalled();
    });

    it('toasts when the ICS export fails', async () => {
        // buildIcs is called synchronously (not awaited), so it must throw rather than reject
        mockBuildIcs.mockImplementationOnce(() => {
            throw new Error('boom');
        });
        renderPage();
        openSection('exportPage.essays_title');
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.ics_export_button'));
        });
        expect(mockShowToast).toHaveBeenCalledWith('toast.export_error', 'error');
    });

    it('drops snapshot-less rows and falls back to a null scale', () => {
        const thirdRubric: Rubric = { ...mockRubric, id: 'r3', name: 'Rubric 3', gradeScaleId: 'zzz' };
        appOverrides = {
            rubrics: [mockRubric, mockRubric2, thirdRubric],
            studentRubrics: [mockSr, baseSr({ id: 'srN', studentId: 's2', rubricId: 'missing' })],
        };
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        // the missing-rubric row has no summary → dropped from the table
        expect(screen.getByLabelText('Alice')).toBeInTheDocument();
        expect(screen.queryByLabelText('Bob')).not.toBeInTheDocument();
        // switch to a rubric whose scale id is unknown → page-level scale becomes null
        fireEvent.change(screen.getByDisplayValue('Essay Rubric'), { target: { value: 'r3' } });
        expect(screen.getByText('exportPage.no_students')).toBeInTheDocument();
    });

    it('handles an empty rubric list with an empty default scale id', () => {
        appOverrides = {
            rubrics: [],
            settings: { ...mockSettings, defaultGradeScaleId: '' },
            studentRubrics: [baseSr({ id: 'srE', rubricId: '' })],
        };
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        // no rubric at all → the no-rubric empty state (the sr still evaluates summary: null)
        expect(screen.getByText('exportPage.no_rubric')).toBeInTheDocument();
    });

    it('bulk ops skip unselected students and normalize comment spacers', () => {
        const saveStudentRubric = vi.fn();
        appOverrides = {
            studentRubrics: [
                mockSr,
                baseSr({ id: 'sr2', studentId: 's2', overallComment: '' }),
                baseSr({ id: 'sr3', studentId: 's3', overallComment: 'Well done ' }),
            ],
            saveStudentRubric,
        };
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        fireEvent.click(screen.getByLabelText('Alice'));
        fireEvent.click(screen.getByLabelText('Bob')); // Carol stays unselected → skipped
        fireEvent.click(screen.getByText('exportPage.bulk_add_comment'));
        const input = screen.getByPlaceholderText('exportPage.bulk_comment_placeholder');
        fireEvent.change(input, { target: { value: 'See me' } });
        fireEvent.keyDown(input, { key: 'Shift' }); // non-Enter key does nothing
        fireEvent.keyDown(input, { key: 'Enter' });
        // Alice ('Well done' → spacer ' '), Bob ('' → no spacer); Carol untouched
        expect(saveStudentRubric).toHaveBeenCalledWith(expect.objectContaining({ overallComment: 'Well done See me' }));
        expect(saveStudentRubric).toHaveBeenCalledWith(expect.objectContaining({ overallComment: 'See me' }));
        expect(saveStudentRubric).toHaveBeenCalledTimes(2);
        fireEvent.click(screen.getByText('exportPage.bulk_nhi'));
        expect(saveStudentRubric).toHaveBeenCalledWith(expect.objectContaining({ notHandedIn: true }));
        expect(mockShowToast).toHaveBeenCalledWith('Marked 2 student(s) as not handed in', 'success');
    });

    it('exports CSV with snapshot criterion fallbacks and date-less students', async () => {
        const snapshotRubric: Rubric = {
            ...mockRubric,
            id: 'r1',
            criteria: [mockRubric.criteria[0], mockRubric.criteria[1], mockRubric.criteria[2]],
        };
        const srA = baseSr({ id: 'srA', gradedAt: undefined });
        const srB = baseSr({
            id: 'srB',
            studentId: 's2',
            rubricSnapshot: snapshotRubric,
            entries: [
                { criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '', overridePoints: 88 },
                { criterionId: 'c2', levelId: 'l2', checkedSubItems: [], comment: '', selectedPoints: 77 },
                { criterionId: 'c3', levelId: 'l3', checkedSubItems: [], comment: '' },
                { criterionId: 'c4', levelId: 'zzz', checkedSubItems: [], comment: '' },
                { criterionId: 'c5', levelId: null, checkedSubItems: [], comment: 'Only a comment' },
            ],
        });
        appOverrides = { studentRubrics: [srA, srB] };
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        fireEvent.click(screen.getByText('exportPage.select_all'));
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.csv_export_count/));
        });
        expect(global.URL.createObjectURL).toHaveBeenCalled();
    });

    it('period reports fall back to a null scale without grade scales', async () => {
        appOverrides = { gradeScales: [] };
        renderPage();
        openSection('exportPage.period_report_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.period_select_class'), { target: { value: 'c1' } });
        const aliceBtn = screen.getAllByText('Alice').find((el) => el.tagName === 'BUTTON');
        fireEvent.click(aliceBtn!);
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.period_generate_btn/));
        });
        expect(mockExportPeriodReportsBatch).toHaveBeenCalledTimes(1);
    });

    it('toasts when the period report export fails', async () => {
        mockExportPeriodReportsBatch.mockRejectedValueOnce(new Error('boom'));
        renderPage();
        openSection('exportPage.period_report_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.period_select_class'), { target: { value: 'c1' } });
        const aliceBtn = screen.getAllByText('Alice').find((el) => el.tagName === 'BUTTON');
        fireEvent.click(aliceBtn!);
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.period_generate_btn/));
        });
        expect(mockShowToast).toHaveBeenCalledWith('toast.export_error', 'error');
    });

    it('report cards resolve student-test window variants', async () => {
        appOverrides = {
            studentTests: [
                { ...mockStudentTest, id: 'st1' },
                { ...mockStudentTest, id: 'st2', status: 'draft' },
                { ...mockStudentTest, id: 'st3', gradedAt: undefined, submittedAt: '2024-01-20T00:00:00Z' },
                { ...mockStudentTest, id: 'st4', gradedAt: undefined, submittedAt: undefined },
                { ...mockStudentTest, id: 'st5', studentId: 's2' },
            ],
        };
        renderPage();
        openSection('exportPage.period_report_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.period_select_class'), { target: { value: 'c1' } });
        const aliceBtn = screen.getAllByText('Alice').find((el) => el.tagName === 'BUTTON');
        fireEvent.click(aliceBtn!);
        // set the period window so the test-window comparisons use the date branches
        const [fromInput, toInput] = document.querySelectorAll('input[type="date"]');
        fireEvent.change(fromInput, { target: { value: '2024-01-01' } });
        fireEvent.change(toInput, { target: { value: '2024-01-31' } });
        openSection('reportCard.title');
        await act(async () => {
            fireEvent.click(screen.getByText('reportCard.generate_single_btn'));
        });
        expect(mockExportReportCard).toHaveBeenCalledTimes(1);
    });

    it('generates report cards in batch and toasts on failure', async () => {
        renderPage();
        openSection('exportPage.period_report_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.period_select_class'), { target: { value: 'c1' } });
        const aliceBtn = screen.getAllByText('Alice').find((el) => el.tagName === 'BUTTON');
        const bobBtn = screen.getAllByText('Bob').find((el) => el.tagName === 'BUTTON');
        fireEvent.click(aliceBtn!);
        fireEvent.click(bobBtn!);
        openSection('reportCard.title');
        // the handler chains several dynamic imports per student, so poll until the batch lands
        await act(async () => {
            fireEvent.click(screen.getByText(/reportCard.generate_batch_btn/));
            await waitFor(() => expect(mockExportReportCardsBatch).toHaveBeenCalledTimes(1));
        });
        expect(mockShowToast).toHaveBeenCalledWith(
            expect.stringContaining('exportPage.report_card_success'),
            'success'
        );
        mockExportReportCardsBatch.mockRejectedValueOnce(new Error('boom'));
        await act(async () => {
            fireEvent.click(screen.getByText(/reportCard.generate_batch_btn/));
            await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('toast.export_error', 'error'));
        });
    });

    it('toasts when the single report card export fails', async () => {
        mockExportReportCard.mockRejectedValueOnce(new Error('boom'));
        renderPage();
        openSection('exportPage.period_report_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.period_select_class'), { target: { value: 'c1' } });
        const aliceBtn = screen.getAllByText('Alice').find((el) => el.tagName === 'BUTTON');
        fireEvent.click(aliceBtn!);
        openSection('reportCard.title');
        await act(async () => {
            fireEvent.click(screen.getByText('reportCard.generate_single_btn'));
        });
        expect(mockShowToast).toHaveBeenCalledWith('toast.export_error', 'error');
    });

    it('resolves per-essay scales including none and unknown', async () => {
        const thirdRubric: Rubric = { ...mockRubric, id: 'r3', name: 'Rubric 3', gradeScaleId: 'zzz' };
        appOverrides = {
            rubrics: [mockRubric, mockRubric2, thirdRubric],
            studentRubrics: [
                mockSr,
                baseSr({ id: 'sr7', rubricId: 'r2', studentId: 's2' }),
                baseSr({ id: 'sr8', rubricId: 'r3', studentId: 's3' }),
            ],
            essayAssignments: [
                mockEssayAssignment,
                { ...mockEssayAssignment, studentId: 's2', rubricId: 'r2', title: 'Bob Essay' },
                { ...mockEssayAssignment, studentId: 's3', rubricId: 'r3', title: 'Carol Essay' },
            ],
            essaySubmissions: [
                mockEssaySubmission,
                { ...mockEssaySubmission, id: 'sub2', assignmentStudentId: 's2' },
                { ...mockEssaySubmission, id: 'sub3', assignmentStudentId: 's3' },
            ],
        };
        renderPage();
        openSection('exportPage.essays_title');
        fireEvent.change(screen.getByDisplayValue('exportPage.essays_select_assignment_placeholder'), {
            target: { value: 'tk1' },
        });
        fireEvent.click(screen.getByText('exportPage.essays_include_rubric_analysis'));
        fireEvent.click(screen.getAllByText(/exportPage.select_all/).at(-1)!);
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.essays_export_button'));
        });
        // all three have rubric records → nothing skipped, and none/zzz hit the scale fallbacks
        expect(mockExportEssayWithRubric).toHaveBeenCalledTimes(3);
        expect(mockShowToast).not.toHaveBeenCalledWith(
            expect.stringContaining('exportPage.essays_skipped_ungraded'),
            'error'
        );
    });

    it('toasts when the batch docx export fails', async () => {
        mockExportBatchDocx.mockRejectedValueOnce(new Error('boom'));
        renderPage();
        openSection('exportPage.rubric_students_section_title');
        fireEvent.click(screen.getByText('exportPage.select_all'));
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.batch_docx_export/));
        });
        expect(mockShowToast).toHaveBeenCalledWith('toast.export_error', 'error');
    });

    it('toasts when the word export fails', async () => {
        appOverrides = {
            settings: { ...mockSettings, exportTemplateId: undefined },
            exportTemplates: [],
        };
        mockExportRubricToDocx.mockRejectedValueOnce(new Error('boom'));
        renderPage();
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.export_word_default'));
        });
        expect(mockShowToast).toHaveBeenCalledWith('toast.export_error', 'error');
    });

    it('clears the active word template via the clear button', () => {
        const updateSettings = vi.fn();
        appOverrides = { updateSettings };
        renderPage();
        fireEvent.click(screen.getByTitle('Clear template'));
        expect(updateSettings).toHaveBeenCalledWith({ exportTemplateId: undefined });
    });
});
