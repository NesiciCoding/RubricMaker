import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('docx', () => ({
    Document: vi.fn(),
    Packer: { toBlob: vi.fn().mockResolvedValue(new Blob(['test'])) },
    Paragraph: vi.fn(),
    Table: vi.fn(),
    TableCell: vi.fn(),
    TableRow: vi.fn(),
    TextRun: vi.fn(),
    WidthType: { PERCENTAGE: 'pct', AUTO: 'auto' },
    AlignmentType: { LEFT: 'left', CENTER: 'center' },
    HeadingLevel: { HEADING_1: 'h1', HEADING_2: 'h2' },
    BorderStyle: { SINGLE: 'single', NONE: 'none' },
    ShadingType: { CLEAR: 'clear' },
}));

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

import { saveAs } from 'file-saver';
import { exportPeriodReport, exportPeriodReportsBatch } from './periodReportExport';
import type { PeriodReportInput } from './periodReportExport';

const mockRubric = {
    id: 'r1',
    name: 'Test Rubric',
    criteria: [
        {
            id: 'c1',
            title: 'Criterion',
            description: '',
            weight: 100,
            levels: [{ id: 'l1', label: 'Good', minPoints: 0, maxPoints: 100, description: '', subItems: [] }],
        },
    ],
    gradeScaleId: 'gs1',
    scoringMode: 'weighted-percentage' as const,
    totalMaxPoints: 100,
};

const mockScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter' as const,
    ranges: [{ min: 90, max: 100, label: 'A', color: '#22c55e' }],
};

const mockSr = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: 'Good job' }],
    overallComment: 'Well done',
    isPeerReview: false,
    gradedAt: '2024-01-15T10:00:00Z',
};

const baseInput: PeriodReportInput = {
    student: { id: 's1', name: 'Alice', classId: 'c1' },
    className: 'Class A',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entries: [{ sr: mockSr as any, rubric: mockRubric as any, scale: mockScale as any }],
    periodLabel: 'Q1 2024',
};

describe('periodReportExport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('generates and saves a docx file for a student', async () => {
        await exportPeriodReport(baseInput);
        expect(saveAs).toHaveBeenCalledOnce();
        const [, filename] = vi.mocked(saveAs).mock.calls[0];
        expect(filename).toBe('Alice_period_report.docx');
    });

    it('sanitises special characters in the student name for the filename', async () => {
        await exportPeriodReport({
            ...baseInput,
            student: { id: 's2', name: 'Alice de Vries', classId: 'c1' },
        });
        const [, filename] = vi.mocked(saveAs).mock.calls[0];
        expect(filename).toBe('Alice_de_Vries_period_report.docx');
    });

    it('handles zero entries without throwing', async () => {
        await exportPeriodReport({ ...baseInput, entries: [] });
        expect(saveAs).toHaveBeenCalledOnce();
    });

    it('works without a periodLabel', async () => {
        await exportPeriodReport({ ...baseInput, periodLabel: undefined });
        expect(saveAs).toHaveBeenCalledOnce();
    });

    it('exportPeriodReportsBatch calls saveAs once per input', async () => {
        await exportPeriodReportsBatch([baseInput, baseInput]);
        expect(saveAs).toHaveBeenCalledTimes(2);
    });

    it('handles entries with no comments in the feedback section', async () => {
        const noCommentSr = { ...mockSr, overallComment: '', entries: [{ ...mockSr.entries[0], comment: '' }] };
        await exportPeriodReport({
            ...baseInput,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entries: [{ sr: noCommentSr as any, rubric: mockRubric as any, scale: mockScale as any }],
        });
        expect(saveAs).toHaveBeenCalledOnce();
    });
});
