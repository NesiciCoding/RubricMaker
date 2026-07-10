import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('docx', () => ({
    Document: vi.fn(),
    Packer: { toBlob: vi.fn().mockResolvedValue(new Blob(['test'])) },
    Paragraph: vi.fn(),
    Table: vi.fn(),
    TableCell: vi.fn(),
    TableRow: vi.fn(),
    TextRun: vi.fn(),
    ImageRun: vi.fn(),
    WidthType: { PERCENTAGE: 'pct', AUTO: 'auto' },
    AlignmentType: { LEFT: 'left', CENTER: 'center' },
    HeadingLevel: { HEADING_1: 'h1', HEADING_2: 'h2' },
    BorderStyle: { SINGLE: 'single', NONE: 'none' },
    ShadingType: { CLEAR: 'clear' },
}));

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

import { saveAs } from 'file-saver';
import { TextRun, ImageRun, Paragraph } from 'docx';
import {
    exportPeriodReport,
    exportPeriodReportsBatch,
    exportReportCard,
    exportReportCardsBatch,
} from './periodReportExport';
import type { PeriodReportInput } from './periodReportExport';
import type { ReportCardData } from '../types';

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

    it('strips HTML tags out of comment text instead of rendering them literally', async () => {
        const htmlCommentSr = {
            ...mockSr,
            overallComment: '<p>Well <strong>done</strong>!</p>',
            entries: [{ ...mockSr.entries[0], comment: '<em>Nice</em> work' }],
        };
        await exportPeriodReport({
            ...baseInput,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entries: [{ sr: htmlCommentSr as any, rubric: mockRubric as any, scale: mockScale as any }],
        });
        const texts = vi.mocked(TextRun).mock.calls.map((call) => (call[0] as { text?: string }).text ?? '');
        expect(texts.some((t) => t.includes('<'))).toBe(false);
        expect(texts).toContain('Well done !');
        expect(texts).toContain('Nice work');
    });

    it('embeds a rasterized grade-trend chart image when a canvas 2d context is available', async () => {
        const fakeCtx = {
            fillRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fillText: vi.fn(),
            fillStyle: '',
            strokeStyle: '',
            font: '',
            textAlign: 'left',
        };
        const getContextSpy = vi
            .spyOn(HTMLCanvasElement.prototype, 'getContext')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .mockReturnValue(fakeCtx as any);
        const toBlobSpy = vi
            .spyOn(HTMLCanvasElement.prototype, 'toBlob')
            .mockImplementation((cb) => cb(new Blob(['png-bytes'], { type: 'image/png' })));

        const secondEntry = {
            sr: { ...mockSr, id: 'sr2' },
            rubric: mockRubric,
            scale: mockScale,
        };
        await exportPeriodReport({
            ...baseInput,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entries: [baseInput.entries[0], secondEntry as any],
        });

        expect(ImageRun).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'png',
                transformation: expect.objectContaining({ width: 600, height: 200 }),
            })
        );

        getContextSpy.mockRestore();
        toBlobSpy.mockRestore();
    });
});

describe('exportReportCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const fullReportCard: ReportCardData = {
        studentId: 's1',
        studentName: 'Bob Builder',
        className: 'Class A',
        periodLabel: 'Q1 2024',
        sections: [
            {
                type: 'rubrics',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                entries: [{ sr: mockSr as any, rubric: mockRubric as any, scale: mockScale as any }],
            },
            {
                type: 'standards',
                standardSets: [
                    {
                        setTitle: 'CCSS ELA',
                        standards: [
                            {
                                guid: 'std1',
                                statementNotation: 'W.4.1',
                                description: 'Write opinion pieces',
                                standardSetTitle: 'CCSS ELA',
                                jurisdictionTitle: 'Common Core',
                                rubricCount: 2,
                                avgScore: 82,
                            },
                        ],
                    },
                ],
            },
            {
                type: 'learningGoals',
                goals: [{ guid: 'g1', title: 'Master fractions', averagePercentage: 70, rubricCount: 3 }],
            },
            {
                type: 'cefr',
                overview: {
                    cells: [
                        {
                            skill: 'Writing',
                            level: 'B1',
                            rubricCount: 2,
                            avgScore: 75,
                            threshold: 70,
                            rubricAchieved: true,
                            totalDescriptors: 4,
                            confidentCount: 3,
                            confidenceRate: 0.75,
                            state: 'achieved',
                            descriptors: [],
                        },
                    ],
                    cellMap: new Map(),
                    standardSets: [],
                    skillsWithRubricData: 1,
                    overallConfidenceRate: 0.75,
                    standardsCovered: 1,
                },
            },
            {
                type: 'testSummary',
                overview: {
                    studentId: 's1',
                    questions: [{ questionId: 'q1', accuracyPct: 80, bucket: 'strong', sampleSize: 1 }],
                    skills: [{ groupId: 'sk1', label: 'Reading', accuracyPct: 80, bucket: 'strong', sampleSize: 1 }],
                },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
    };

    const emptyReportCard: ReportCardData = {
        studentId: 's2',
        studentName: 'Empty Student',
        className: 'Class B',
        sections: [
            { type: 'rubrics', entries: [] },
            { type: 'standards', standardSets: [] },
            { type: 'learningGoals', goals: [] },
            {
                type: 'cefr',
                overview: {
                    cells: [],
                    cellMap: new Map(),
                    standardSets: [],
                    skillsWithRubricData: 0,
                    overallConfidenceRate: 0,
                    standardsCovered: 0,
                    practiceCefrProgress: [],
                },
            },
            { type: 'testSummary', overview: { studentId: 's2', questions: [], skills: [] } },
        ],
    };

    it('generates a docx file for a report card with all sections populated', async () => {
        await exportReportCard(fullReportCard);
        expect(saveAs).toHaveBeenCalledOnce();
        const [, filename] = vi.mocked(saveAs).mock.calls[0];
        expect(filename).toBe('Bob_Builder_report_card.docx');
    });

    it('handles a report card with all sections empty without throwing', async () => {
        await exportReportCard(emptyReportCard);
        expect(saveAs).toHaveBeenCalledOnce();
        const [, filename] = vi.mocked(saveAs).mock.calls[0];
        expect(filename).toBe('Empty_Student_report_card.docx');
    });

    it('exportReportCardsBatch calls saveAs once per student', async () => {
        await exportReportCardsBatch([fullReportCard, emptyReportCard]);
        expect(saveAs).toHaveBeenCalledTimes(2);
    });

    it('renders a Feedback section from the rubrics section, matching period report behavior', async () => {
        await exportReportCard(fullReportCard);
        const paragraphTexts = vi.mocked(Paragraph).mock.calls.map((call) => (call[0] as { text?: string }).text);
        expect(paragraphTexts).toContain('Feedback');
        const runTexts = vi.mocked(TextRun).mock.calls.map((call) => (call[0] as { text?: string }).text ?? '');
        expect(runTexts).toContain('Well done');
        expect(runTexts.some((t) => t.includes('Good job'))).toBe(true);
    });
});
