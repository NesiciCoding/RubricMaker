import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type {
    Class,
    GradeScale,
    Rubric,
    Student,
    StudentRubric,
    AppSettings,
    EssayAssignment,
    EssaySubmission,
} from '../../types';

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
            weight: 100,
            levels: [{ id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] }],
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

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockSr: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
    overallComment: '',
    isPeerReview: false,
    gradedAt: '2024-01-01T00:00:00Z',
};

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
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

const mockShowToast = vi.fn();

let appOverrides: Record<string, unknown> = {};

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        rubrics: [mockRubric],
        students: [mockStudent],
        classes: [mockClass],
        studentRubrics: [mockSr],
        gradeScales: [mockGradeScale],
        settings: mockSettings,
        exportTemplates: [],
        updateSettings: vi.fn(),
        saveStudentRubric: vi.fn(),
        selfAssessments: [],
        analysisResults: [],
        tests: [],
        studentTests: [],
        essayAssignments: [mockEssayAssignment],
        essaySubmissions: [mockEssaySubmission],
        ...appOverrides,
    }),
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

vi.mock('../../utils/docxTemplateExport', () => ({
    exportRubricWithTemplate: vi.fn().mockResolvedValue(undefined),
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

describe('ExportPage', () => {
    beforeEach(async () => {
        appOverrides = {};
        mockShowToast.mockClear();
        vi.clearAllMocks();
        global.URL.createObjectURL = vi.fn(() => 'blob:fake');
        global.URL.revokeObjectURL = vi.fn();
        HTMLAnchorElement.prototype.click = vi.fn();
        const mod = await import('../ExportPage');
        ExportPageComp = mod.default;
    });

    it('renders the rubric export section header', () => {
        renderPage();
        expect(screen.getByText('exportPage.rubric_section_title')).toBeInTheDocument();
    });

    it('exports the rubric as Word via the template/default button', async () => {
        renderPage();
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.export_word_default'));
        });
        expect(mockExportRubricToDocx).toHaveBeenCalled();
    });

    it('selects a student and exports a CSV', async () => {
        renderPage();
        fireEvent.click(screen.getByText('exportPage.rubric_students_section_title'));
        const aliceCell = screen.getAllByText('Alice').find((el) => el.tagName === 'TD');
        expect(aliceCell).toBeInTheDocument();
        fireEvent.click(aliceCell!);
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.csv_export_count/));
        });
        expect(global.URL.createObjectURL).toHaveBeenCalled();
    });

    it('selects all students and exports a batch PDF', async () => {
        renderPage();
        fireEvent.click(screen.getByText('exportPage.rubric_students_section_title'));
        fireEvent.click(screen.getByText('exportPage.select_all'));
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.print_to_pdf/));
        });
        expect(mockExportBatchPdf).toHaveBeenCalled();
    });

    it('exports a batch DOCX for selected students', async () => {
        renderPage();
        fireEvent.click(screen.getByText('exportPage.rubric_students_section_title'));
        fireEvent.click(screen.getByText('exportPage.select_all'));
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.batch_docx_export/));
        });
        expect(mockExportBatchDocx).toHaveBeenCalled();
    });

    it('exports a single student PDF from their row', async () => {
        renderPage();
        fireEvent.click(screen.getByText('exportPage.rubric_students_section_title'));
        await act(async () => {
            fireEvent.click(screen.getByText('PDF'));
        });
        expect(mockExportSinglePdf).toHaveBeenCalled();
    });

    it('exports essay deadlines as ICS', async () => {
        renderPage();
        fireEvent.click(screen.getByText('exportPage.essays_title'));
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.ics_export_button'));
        });
        expect(mockBuildIcs).toHaveBeenCalled();
    });

    it('exports submitted essays for an assignment', async () => {
        renderPage();
        fireEvent.click(screen.getByText('exportPage.essays_title'));
        fireEvent.change(screen.getByDisplayValue('exportPage.essays_select_assignment_placeholder'), {
            target: { value: 'tk1' },
        });
        const selectAllMatches = screen.getAllByText(/exportPage.select_all|exportPage.deselect_all/);
        fireEvent.click(selectAllMatches[selectAllMatches.length - 1]);
        await act(async () => {
            fireEvent.click(screen.getByText('exportPage.essays_export_button'));
        });
        expect(mockExportEssaysBatch).toHaveBeenCalled();
    });

    it('generates a period report for a selected class and students', async () => {
        renderPage();
        fireEvent.click(screen.getByText('exportPage.period_report_title'));
        fireEvent.change(screen.getByDisplayValue('exportPage.period_select_class'), { target: { value: 'c1' } });
        const aliceBtn = screen.getAllByText('Alice').find((el) => el.tagName === 'BUTTON');
        expect(aliceBtn).toBeInTheDocument();
        fireEvent.click(aliceBtn!);
        await act(async () => {
            fireEvent.click(screen.getByText(/exportPage.period_generate_btn/));
        });
        expect(mockExportPeriodReportsBatch).toHaveBeenCalled();
    });

    it('generates a report card batch, reusing the period class/student picker', async () => {
        renderPage();
        // Report Card reuses the Period Report's class + student selection state.
        fireEvent.click(screen.getByText('exportPage.period_report_title'));
        fireEvent.change(screen.getByDisplayValue('exportPage.period_select_class'), { target: { value: 'c1' } });
        const aliceBtn2 = screen.getAllByText('Alice').find((el) => el.tagName === 'BUTTON');
        expect(aliceBtn2).toBeInTheDocument();
        fireEvent.click(aliceBtn2!);
        fireEvent.click(screen.getByText('reportCard.title'));
        await act(async () => {
            fireEvent.click(screen.getByText(/reportCard.generate_batch_btn/));
        });
        expect(mockExportReportCardsBatch).toHaveBeenCalled();
    });
});
