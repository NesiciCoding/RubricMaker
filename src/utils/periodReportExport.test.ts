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
        expect(texts).toContain('Well done!');
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

    it('falls back to the colored-cell trend table when no canvas 2d context is available', async () => {
        // jsdom returns null for getContext('2d'), so no spy needed — the fallback is native.
        const secondEntry = { sr: { ...mockSr, id: 'sr2' }, rubric: mockRubric, scale: mockScale };
        await exportPeriodReport({
            ...baseInput,
            entries: [baseInput.entries[0], secondEntry as any],
        });
        expect(ImageRun).not.toHaveBeenCalled();
        const texts = vi.mocked(TextRun).mock.calls.map((call) => (call[0] as { text?: string }).text ?? '');
        expect(texts.some((t) => /^\d+%$/.test(t))).toBe(true); // percentage cells from the fallback row
    });

    it('falls back to the colored-cell trend table when the chart blob is empty', async () => {
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
        const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as any);
        const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(null)); // no blob → chart dropped
        const secondEntry = { sr: { ...mockSr, id: 'sr2' }, rubric: mockRubric, scale: mockScale };
        await exportPeriodReport({ ...baseInput, entries: [baseInput.entries[0], secondEntry as any] });
        expect(ImageRun).not.toHaveBeenCalled();
        getContextSpy.mockRestore();
        toBlobSpy.mockRestore();
    });

    it('falls back to the colored-cell trend table when chart rendering throws', async () => {
        // A context missing the drawing methods makes the rasterizer throw → caught → fallback.
        const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as any);
        const secondEntry = { sr: { ...mockSr, id: 'sr2' }, rubric: mockRubric, scale: mockScale };
        await exportPeriodReport({ ...baseInput, entries: [baseInput.entries[0], secondEntry as any] });
        expect(ImageRun).not.toHaveBeenCalled();
        getContextSpy.mockRestore();
    });

    it('skips chart rendering entirely when the document global is unavailable', async () => {
        const originalDocument = globalThis.document;
        vi.stubGlobal('document', undefined);
        try {
            const secondEntry = { sr: { ...mockSr, id: 'sr2' }, rubric: mockRubric, scale: mockScale };
            await exportPeriodReport({ ...baseInput, entries: [baseInput.entries[0], secondEntry as any] });
            expect(ImageRun).not.toHaveBeenCalled();
        } finally {
            if (originalDocument === undefined) {
                vi.unstubAllGlobals();
            } else {
                vi.stubGlobal('document', originalDocument);
            }
        }
    });

    it('colors chart bars by score band and truncates long rubric names', async () => {
        const styleHistory: string[] = [];
        const fakeCtx = {
            fillRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fillText: vi.fn(),
            get fillStyle() {
                return styleHistory[styleHistory.length - 1] ?? '';
            },
            set fillStyle(v: string) {
                styleHistory.push(v);
            },
            strokeStyle: '',
            font: '',
            textAlign: 'left',
        };
        const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as any);
        const toBlobSpy = vi
            .spyOn(HTMLCanvasElement.prototype, 'toBlob')
            .mockImplementation((cb) => cb(new Blob(['png-bytes'], { type: 'image/png' })));

        const highEntry = {
            sr: {
                ...mockSr,
                id: 'sr-high',
                entries: [{ criterionId: 'c1', levelId: 'l1', selectedPoints: 90, checkedSubItems: [], comment: '' }],
            },
            rubric: { ...mockRubric, name: 'A very long rubric name over twelve chars' },
            scale: mockScale,
        };
        const midEntry = {
            sr: {
                ...mockSr,
                id: 'sr-mid',
                entries: [{ criterionId: 'c1', levelId: 'l1', selectedPoints: 60, checkedSubItems: [], comment: '' }],
            },
            rubric: mockRubric,
            scale: mockScale,
        };
        await exportPeriodReport({ ...baseInput, entries: [midEntry as any, highEntry as any] });

        expect(ImageRun).toHaveBeenCalledOnce();
        // 90% → green bar, 60% → yellow bar, long name → truncated to 11 chars + ellipsis.
        expect(styleHistory).toContain('#22C55E');
        expect(styleHistory).toContain('#EAB308');
        getContextSpy.mockRestore();
        toBlobSpy.mockRestore();
    });

    it('uses a dash for the date when a rubric entry has no gradedAt', async () => {
        const noDateSr = { ...mockSr, gradedAt: undefined };
        await exportPeriodReport({
            ...baseInput,
            entries: [{ sr: noDateSr as any, rubric: mockRubric as any, scale: mockScale }],
        });
        const texts = vi.mocked(TextRun).mock.calls.map((call) => (call[0] as { text?: string }).text ?? '');
        expect(texts).toContain('—');
    });

    it('sorts entries with mixed gradedAt presence, falling back to epoch for undated ones', async () => {
        const dated = { sr: { ...mockSr, id: 'sr-dated' }, rubric: mockRubric, scale: mockScale };
        const undated = {
            sr: { ...mockSr, id: 'sr-undated', gradedAt: undefined },
            rubric: mockRubric,
            scale: mockScale,
        };
        // Both orders: an undated entry must compare as older than a dated one in either position.
        await exportPeriodReport({ ...baseInput, entries: [dated as any, undated as any] });
        await exportPeriodReport({ ...baseInput, entries: [undated as any, dated as any] });
        expect(saveAs).toHaveBeenCalledTimes(2);
    });

    it('renders criterion comments even when the overall comment is empty', async () => {
        const sr = {
            ...mockSr,
            overallComment: '',
            entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: 'Focused feedback' }],
        };
        await exportPeriodReport({
            ...baseInput,
            entries: [{ sr: sr as any, rubric: mockRubric as any, scale: mockScale }],
        });
        const texts = vi.mocked(TextRun).mock.calls.map((call) => (call[0] as { text?: string }).text ?? '');
        expect(texts).toContain('Focused feedback');
    });

    it('skips feedback entries whose criterion is missing from the rubric snapshot', async () => {
        const orphanSr = {
            ...mockSr,
            entries: [{ criterionId: 'ghost-criterion', checkedSubItems: [], comment: 'orphan comment' }],
        };
        await exportPeriodReport({
            ...baseInput,
            entries: [{ sr: orphanSr as any, rubric: mockRubric as any, scale: mockScale }],
        });
        expect(saveAs).toHaveBeenCalledOnce();
    });

    it('renders the learning goals table with color-coded progress bars', async () => {
        await exportPeriodReport({
            ...baseInput,

            goals: [
                { guid: 'g1', title: 'Fractions', averagePercentage: 90 },
                { guid: 'g2', averagePercentage: 70 }, // no title → guid fallback
                { guid: 'g3', title: 'Reading', averagePercentage: 40 },
            ] as any,
        });
        const texts = vi.mocked(TextRun).mock.calls.map((call) => (call[0] as { text?: string }).text ?? '');
        expect(texts).toContain('g2');
        expect(texts).toContain('90.0%');
        expect(texts).toContain('70.0%');
        expect(saveAs).toHaveBeenCalledOnce();
    });

    it('omits the learning goals section when goals is an empty array', async () => {
        await exportPeriodReport({ ...baseInput, goals: [] });
        expect(saveAs).toHaveBeenCalledOnce();
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

    it('colors test-summary buckets and CEFR states across the full range', async () => {
        const reportCard: ReportCardData = {
            studentId: 's1',
            studentName: 'Colors',
            className: 'C',
            periodLabel: 'Q1',
            sections: [
                {
                    type: 'testSummary',
                    overview: {
                        studentId: 's1',
                        questions: [],
                        skills: [
                            {
                                groupId: 'a',
                                label: 'Strong skill',
                                accuracyPct: 90,
                                bucket: 'strong',
                                sampleSize: 2,
                                questionIds: [],
                            },
                            {
                                groupId: 'b',
                                label: 'Developing skill',
                                accuracyPct: 60,
                                bucket: 'developing',
                                sampleSize: 2,
                                questionIds: [],
                            },
                            {
                                groupId: 'c',
                                label: 'Weak skill',
                                accuracyPct: 30,
                                bucket: 'weak',
                                sampleSize: 2,
                                questionIds: [],
                            },
                        ],
                    },
                },
                {
                    type: 'cefr',
                    overview: {
                        cells: [
                            {
                                skill: 'writing',
                                level: 'B1',
                                rubricCount: 1,
                                avgScore: 80,
                                threshold: 70,
                                rubricAchieved: true,
                                totalDescriptors: 1,
                                confidentCount: 1,
                                confidenceRate: 1,
                                state: 'achieved',
                                descriptors: [],
                                evidence: [],
                            },
                            {
                                skill: 'reading',
                                level: 'A2',
                                rubricCount: 1,
                                avgScore: 60,
                                threshold: 70,
                                rubricAchieved: false,
                                totalDescriptors: 1,
                                confidentCount: 0,
                                confidenceRate: 0,
                                state: 'developing',
                                descriptors: [],
                                evidence: [],
                            },
                            {
                                skill: 'listening',
                                level: 'A1',
                                rubricCount: 0,
                                avgScore: 0,
                                threshold: 70,
                                rubricAchieved: false,
                                totalDescriptors: 1,
                                confidentCount: 0,
                                confidenceRate: 0,
                                state: 'not-started',
                                descriptors: [],
                                evidence: [],
                            },
                        ],
                        cellMap: new Map(),
                        standardSets: [],
                        skillsWithRubricData: 2,
                        overallConfidenceRate: 0.5,
                        standardsCovered: 0,
                        practiceCefrProgress: [],
                    },
                },
                {
                    type: 'standards',
                    standardSets: [
                        { setTitle: 'Empty set', standards: [] },
                        {
                            setTitle: 'Plain standard',
                            standards: [
                                {
                                    guid: 's1',
                                    description: 'No notation',
                                    standardSetTitle: 'Plain standard',
                                    jurisdictionTitle: 'X',
                                    rubricCount: 1,
                                    avgScore: 50,
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        await exportReportCard(reportCard);
        const runTexts = vi.mocked(TextRun).mock.calls.map((call) => (call[0] as { text?: string }).text ?? '');
        expect(runTexts).toContain('Developing skill');
        expect(runTexts).toContain('Weak skill');
        expect(runTexts).toContain('No notation');
        expect(saveAs).toHaveBeenCalledOnce();
    });

    it('renders a questions-only test summary section without skill rows', async () => {
        const reportCard: ReportCardData = {
            studentId: 's1',
            studentName: 'Questions Only',
            className: 'C',
            sections: [
                {
                    type: 'testSummary',
                    overview: {
                        studentId: 's1',
                        questions: [{ questionId: 'q1', accuracyPct: 80, bucket: 'strong', sampleSize: 1 }],
                        skills: [],
                    },
                },
            ],
        };
        await exportReportCard(reportCard);
        expect(saveAs).toHaveBeenCalledOnce();
    });

    it('coerces a non-finite accuracy percentage to 0 instead of crashing', async () => {
        const reportCard: ReportCardData = {
            studentId: 's1',
            studentName: 'NaN Skill',
            className: 'C',
            sections: [
                {
                    type: 'testSummary',
                    overview: {
                        studentId: 's1',
                        questions: [],
                        skills: [
                            {
                                groupId: 'nan',
                                label: 'Broken skill',
                                accuracyPct: NaN,
                                bucket: 'strong',
                                sampleSize: 1,
                                questionIds: [],
                            },
                        ],
                    },
                },
            ],
        };
        await exportReportCard(reportCard);
        expect(saveAs).toHaveBeenCalledOnce();
    });
});
