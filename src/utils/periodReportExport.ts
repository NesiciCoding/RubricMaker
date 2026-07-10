import {
    Document,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    WidthType,
    TextRun,
    AlignmentType,
    HeadingLevel,
    BorderStyle,
    ShadingType,
    ImageRun,
} from 'docx';
import { saveAs } from 'file-saver';
import type {
    Student,
    StudentRubric,
    Rubric,
    GradeScale,
    ReportCardData,
    ReportCardSection,
    ExportTemplate,
} from '../types';
import { calcGradeSummary } from './gradeCalc';
import { buildDocxStyles } from './docxExport';
import type { LearningGoalAggregate } from './learningGoalsAggregator';

export interface PeriodReportEntry {
    sr: StudentRubric;
    rubric: Rubric;
    scale: GradeScale | null;
}

export interface PeriodReportInput {
    student: Student;
    className: string;
    entries: PeriodReportEntry[];
    periodLabel?: string;
    goals?: LearningGoalAggregate[];
}

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

// Comment text is free-form and may contain pasted HTML; strip tags so they never show up literally
// in the exported document (TextRun renders text literally, it doesn't parse markup).
function stripHtml(text: string): string {
    return text
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function gradeColor(pct: number): string {
    if (pct >= 75) return 'DCFCE7'; // green-100
    if (pct >= 55) return 'FEF9C3'; // yellow-100
    return 'FEE2E2'; // red-100
}

function normalizePct(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
}

function barColor(pct: number): string {
    if (pct >= 75) return '22C55E'; // green-500
    if (pct >= 55) return 'EAB308'; // yellow-500
    return 'EF4444'; // red-500
}

interface ChartPng {
    data: Uint8Array;
    width: number;
    height: number;
}

// ponytail: rasterizes a plain <canvas> bar chart instead of pulling Recharts (a React component
// tree) into this non-React export utility — no headless-render infra needed. Falls back to the
// pre-existing colored-cell trend table (handled by the caller) when canvas 2d context isn't
// available, e.g. under jsdom in tests.
async function renderGradeTrendChartPng(summaries: RubricGradeSummary[]): Promise<ChartPng | null> {
    if (typeof document === 'undefined') return null;
    try {
        const width = 600;
        const height = 200;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        const padding = { top: 16, right: 12, bottom: 46, left: 12 };
        const chartW = width - padding.left - padding.right;
        const chartH = height - padding.top - padding.bottom;
        const gap = 10;
        const barW = (chartW - gap * (summaries.length - 1)) / summaries.length;

        ctx.strokeStyle = '#E5E7EB';
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + chartH);
        ctx.lineTo(padding.left + chartW, padding.top + chartH);
        ctx.stroke();

        summaries.forEach((s, i) => {
            const pct = normalizePct(s.summary.modifiedPercentage);
            const barH = (pct / 100) * chartH;
            const x = padding.left + i * (barW + gap);
            const y = padding.top + chartH - barH;

            ctx.fillStyle = `#${barColor(pct)}`;
            ctx.fillRect(x, y, barW, barH);

            ctx.fillStyle = '#374151';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${pct.toFixed(0)}%`, x + barW / 2, Math.max(y - 4, 10));

            const label = s.rubric.name.length > 12 ? `${s.rubric.name.slice(0, 11)}…` : s.rubric.name;
            ctx.fillStyle = '#6B7280';
            ctx.font = '10px sans-serif';
            ctx.fillText(label, x + barW / 2, padding.top + chartH + 16);
        });

        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) return null;
        return { data: new Uint8Array(await blob.arrayBuffer()), width, height };
    } catch {
        return null;
    }
}

function sparkBar(pct: number): string {
    const bars = '▁▂▃▄▅▆▇█';
    const safe = normalizePct(pct);
    const idx = Math.min(7, Math.floor((safe / 100) * 8));
    return bars[idx] ?? bars[0];
}

function headerCell(text: string, pct = 25): TableCell {
    return new TableCell({
        children: [
            new Paragraph({ children: [new TextRun({ text, bold: true, size: 20 })], alignment: AlignmentType.LEFT }),
        ],
        width: { size: pct, type: WidthType.PERCENTAGE },
        borders: { top: BORDER, bottom: BORDER, left: NO_BORDER, right: NO_BORDER },
        shading: { fill: 'F3F4F6', type: ShadingType.CLEAR, color: 'auto' },
    });
}

function dataCell(text: string, pct = 25, fill?: string): TableCell {
    return new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, size: 20 })], alignment: AlignmentType.LEFT })],
        width: { size: pct, type: WidthType.PERCENTAGE },
        borders: { top: BORDER, bottom: BORDER, left: NO_BORDER, right: NO_BORDER },
        ...(fill ? { shading: { fill, type: ShadingType.CLEAR, color: 'auto' } } : {}),
    });
}

function buildGoalsTable(goals: LearningGoalAggregate[]): Table {
    const goalRows: TableRow[] = [
        new TableRow({
            children: [headerCell('Goal', 50), headerCell('Average', 20), headerCell('Progress', 30)],
        }),
        ...goals.map((g) => {
            const pct = normalizePct(g.averagePercentage);
            const filledBlocks = Math.round((pct / 100) * 10);
            const bar = '█'.repeat(filledBlocks) + '░'.repeat(10 - filledBlocks);
            return new TableRow({
                children: [
                    dataCell(g.title || g.guid, 50),
                    dataCell(`${pct.toFixed(1)}%`, 20, gradeColor(pct)),
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: bar,
                                        size: 18,
                                        font: 'Courier New',
                                        color: pct >= 75 ? '16A34A' : pct >= 55 ? 'CA8A04' : 'DC2626',
                                    }),
                                ],
                            }),
                        ],
                        width: { size: 30, type: WidthType.PERCENTAGE },
                        borders: { top: BORDER, bottom: BORDER, left: NO_BORDER, right: NO_BORDER },
                    }),
                ],
            });
        }),
    ];

    return new Table({
        rows: goalRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
    });
}

interface RubricGradeSummary {
    sr: StudentRubric;
    rubric: Rubric;
    summary: ReturnType<typeof calcGradeSummary>;
    dateStr: string;
}

function summarizeRubricEntries(entries: PeriodReportEntry[]): RubricGradeSummary[] {
    const sorted = [...entries].sort((a, b) => {
        const da = a.sr.gradedAt ? new Date(a.sr.gradedAt).getTime() : 0;
        const db = b.sr.gradedAt ? new Date(b.sr.gradedAt).getTime() : 0;
        return da - db;
    });

    return sorted.map((e) => ({
        ...e,
        summary: calcGradeSummary(e.sr, (e.sr.rubricSnapshot ?? e.rubric).criteria, e.scale),
        dateStr: e.sr.gradedAt ? new Date(e.sr.gradedAt).toLocaleDateString() : '—',
    }));
}

async function buildRubricGradeSections(summaries: RubricGradeSummary[]): Promise<(Paragraph | Table)[]> {
    const blocks: (Paragraph | Table)[] = [];

    const avg =
        summaries.length > 0
            ? summaries.reduce((acc, s) => acc + s.summary.modifiedPercentage, 0) / summaries.length
            : null;

    if (avg !== null) {
        const spark = summaries.map((s) => sparkBar(s.summary.modifiedPercentage)).join(' ');
        blocks.push(
            new Paragraph({
                children: [
                    new TextRun({ text: 'Period average: ', bold: true, size: 22 }),
                    new TextRun({ text: `${avg.toFixed(1)}%`, size: 22 }),
                    new TextRun({ text: `   ${spark}`, size: 22, color: '6B7280', font: 'Courier New' }),
                ],
                spacing: { after: 240 },
            })
        );
    }

    if (summaries.length >= 2) {
        blocks.push(
            new Paragraph({
                text: 'Grade Trend',
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 160, after: 120 },
            })
        );

        const chart = await renderGradeTrendChartPng(summaries);
        if (chart) {
            blocks.push(
                new Paragraph({
                    children: [
                        new ImageRun({
                            type: 'png',
                            data: chart.data,
                            transformation: { width: chart.width, height: chart.height },
                        }),
                    ],
                    spacing: { after: 160 },
                })
            );
        } else {
            // Canvas 2d context unavailable (e.g. jsdom in tests) — fall back to a colored-cell row.
            const trendCells = summaries.map((s) => {
                const pct = s.summary.modifiedPercentage;
                return new TableCell({
                    children: [
                        new Paragraph({
                            children: [new TextRun({ text: `${pct.toFixed(0)}%`, size: 16, bold: true })],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 40 },
                        }),
                        new Paragraph({
                            children: [new TextRun({ text: s.rubric.name, size: 14, color: '6B7280' })],
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 40 },
                        }),
                    ],
                    width: { size: Math.round(100 / summaries.length), type: WidthType.PERCENTAGE },
                    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
                    shading: { fill: gradeColor(pct), type: ShadingType.CLEAR, color: 'auto' },
                });
            });

            blocks.push(
                new Table({
                    rows: [new TableRow({ children: trendCells })],
                    width: { size: 100, type: WidthType.PERCENTAGE },
                })
            );
        }
    }

    blocks.push(
        new Paragraph({ text: 'Grades', heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 } })
    );

    const tableRows: TableRow[] = [
        new TableRow({
            children: [
                headerCell('Assignment', 40),
                headerCell('Date', 20),
                headerCell('Score', 20),
                headerCell('Grade', 20),
            ],
        }),
        ...summaries.map(
            (s) =>
                new TableRow({
                    children: [
                        dataCell(s.rubric.name, 40),
                        dataCell(s.dateStr, 20),
                        dataCell(
                            `${s.summary.modifiedPercentage.toFixed(1)}%`,
                            20,
                            gradeColor(s.summary.modifiedPercentage)
                        ),
                        dataCell(s.summary.letterGrade || '—', 20),
                    ],
                })
        ),
    ];

    blocks.push(
        new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
        })
    );

    const withComments = summaries.filter((s) => s.sr.overallComment || s.sr.entries.some((e) => e.comment));
    if (withComments.length > 0) {
        blocks.push(
            new Paragraph({ text: 'Feedback', heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 120 } })
        );

        for (const s of withComments) {
            blocks.push(
                new Paragraph({
                    children: [new TextRun({ text: s.rubric.name, bold: true, size: 22 })],
                    spacing: { before: 200, after: 60 },
                })
            );

            if (s.sr.overallComment) {
                blocks.push(
                    new Paragraph({
                        children: [new TextRun({ text: stripHtml(s.sr.overallComment), size: 20, color: '374151' })],
                        spacing: { after: 60 },
                    })
                );
            }

            const criterionComments = s.sr.entries.filter((e) => e.comment);
            for (const entry of criterionComments) {
                const rubricForEntry = s.sr.rubricSnapshot ?? s.rubric;
                const criterion = rubricForEntry.criteria.find((c) => c.id === entry.criterionId);
                if (!criterion) continue;
                blocks.push(
                    new Paragraph({
                        children: [
                            new TextRun({ text: `${criterion.title}: `, bold: true, size: 20 }),
                            new TextRun({ text: stripHtml(entry.comment ?? ''), size: 20, color: '374151' }),
                        ],
                        spacing: { after: 40 },
                    })
                );
            }
        }
    }

    return blocks;
}

export async function exportPeriodReport(input: PeriodReportInput, styleTemplate?: ExportTemplate): Promise<void> {
    const { student, className, entries, periodLabel, goals } = input;

    const sections: ReportCardSection[] = [{ type: 'rubrics', entries }];
    if (goals && goals.length > 0) sections.push({ type: 'learningGoals', goals });

    const blocks = await buildReportCardSections({
        studentId: student.id,
        studentName: student.name,
        className,
        periodLabel,
        sections,
    });

    const doc = new Document({ styles: buildDocxStyles(undefined, styleTemplate), sections: [{ children: blocks }] });
    const blob = await Packer.toBlob(doc);
    const safeName = student.name.replace(/[^a-z0-9]/gi, '_');
    saveAs(blob, `${safeName}_period_report.docx`);
}

export async function exportPeriodReportsBatch(
    inputs: PeriodReportInput[],
    styleTemplate?: ExportTemplate
): Promise<void> {
    for (const input of inputs) {
        await exportPeriodReport(input, styleTemplate);
    }
}

// ─── Report cards ──────────────────────────────────────────────────────────────

function bucketColor(bucket: 'strong' | 'developing' | 'weak'): string {
    if (bucket === 'strong') return '16A34A';
    if (bucket === 'developing') return 'CA8A04';
    return 'DC2626';
}

function buildStandardsSection(section: Extract<ReportCardSection, { type: 'standards' }>): (Paragraph | Table)[] {
    const blocks: (Paragraph | Table)[] = [
        new Paragraph({ text: 'Standards', heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 120 } }),
    ];

    const allStandards = section.standardSets.flatMap((set) => set.standards);
    if (allStandards.length === 0) {
        blocks.push(
            new Paragraph({
                children: [new TextRun({ text: 'No standards coverage recorded.', size: 20, color: '6B7280' })],
                spacing: { after: 120 },
            })
        );
        return blocks;
    }

    for (const set of section.standardSets) {
        if (set.standards.length === 0) continue;
        blocks.push(
            new Paragraph({
                children: [new TextRun({ text: set.setTitle, bold: true, size: 22 })],
                spacing: { before: 160, after: 80 },
            })
        );

        const rows: TableRow[] = [
            new TableRow({
                children: [headerCell('Standard', 60), headerCell('Avg Score', 20), headerCell('Count', 20)],
            }),
            ...set.standards.map((s) => {
                const pct = normalizePct(s.avgScore);
                return new TableRow({
                    children: [
                        dataCell(s.statementNotation ? `${s.statementNotation} — ${s.description}` : s.description, 60),
                        dataCell(`${pct.toFixed(1)}%`, 20, gradeColor(pct)),
                        dataCell(String(s.rubricCount), 20),
                    ],
                });
            }),
        ];

        blocks.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
    }

    return blocks;
}

function buildCefrSection(section: Extract<ReportCardSection, { type: 'cefr' }>): (Paragraph | Table)[] {
    const blocks: (Paragraph | Table)[] = [
        new Paragraph({ text: 'CEFR Overview', heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 120 } }),
    ];

    const { overview } = section;
    if (overview.cells.length === 0) {
        blocks.push(
            new Paragraph({
                children: [new TextRun({ text: 'No CEFR data recorded.', size: 20, color: '6B7280' })],
                spacing: { after: 120 },
            })
        );
        return blocks;
    }

    const rows: TableRow[] = [
        new TableRow({
            children: [
                headerCell('Skill', 25),
                headerCell('Level', 15),
                headerCell('Status', 30),
                headerCell('Confidence', 30),
            ],
        }),
        ...overview.cells.map((cell) => {
            const confPct = normalizePct(cell.confidenceRate * 100);
            return new TableRow({
                children: [
                    dataCell(cell.skill, 25),
                    dataCell(cell.level, 15),
                    dataCell(
                        cell.state,
                        30,
                        cell.state === 'achieved' ? 'DCFCE7' : cell.state === 'developing' ? 'FEF9C3' : undefined
                    ),
                    dataCell(`${confPct.toFixed(0)}%`, 30),
                ],
            });
        }),
    ];

    blocks.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
    return blocks;
}

function buildTestSummarySection(section: Extract<ReportCardSection, { type: 'testSummary' }>): (Paragraph | Table)[] {
    const blocks: (Paragraph | Table)[] = [
        new Paragraph({ text: 'Test Summary', heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 120 } }),
    ];

    const { overview } = section;
    if (overview.skills.length === 0 && overview.questions.length === 0) {
        blocks.push(
            new Paragraph({
                children: [new TextRun({ text: 'No test data available.', size: 20, color: '6B7280' })],
                spacing: { after: 120 },
            })
        );
        return blocks;
    }

    if (overview.skills.length > 0) {
        const rows: TableRow[] = [
            new TableRow({
                children: [headerCell('Skill / Standard', 50), headerCell('Accuracy', 25), headerCell('Sample', 25)],
            }),
            ...overview.skills.map((skill) => {
                const pct = normalizePct(skill.accuracyPct);
                return new TableRow({
                    children: [
                        dataCell(skill.label, 50),
                        new TableCell({
                            children: [
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: `${pct.toFixed(1)}%`,
                                            size: 20,
                                            color: bucketColor(skill.bucket),
                                        }),
                                    ],
                                }),
                            ],
                            width: { size: 25, type: WidthType.PERCENTAGE },
                            borders: { top: BORDER, bottom: BORDER, left: NO_BORDER, right: NO_BORDER },
                        }),
                        dataCell(String(skill.sampleSize), 25),
                    ],
                });
            }),
        ];

        blocks.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
    }

    return blocks;
}

async function buildReportCardSections(data: ReportCardData): Promise<(Paragraph | Table)[]> {
    const blocks: (Paragraph | Table)[] = [];

    blocks.push(
        new Paragraph({
            text: data.studentName,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 80 },
        })
    );

    blocks.push(
        new Paragraph({
            children: [
                new TextRun({ text: data.className, size: 22, color: '6B7280' }),
                data.periodLabel
                    ? new TextRun({ text: `  ·  ${data.periodLabel}`, size: 22, color: '6B7280' })
                    : new TextRun(''),
            ],
            spacing: { after: 200 },
        })
    );

    for (const section of data.sections) {
        switch (section.type) {
            case 'rubrics': {
                const summaries = summarizeRubricEntries(section.entries);
                if (summaries.length === 0) {
                    blocks.push(
                        new Paragraph({
                            text: 'Grades',
                            heading: HeadingLevel.HEADING_2,
                            spacing: { before: 280, after: 120 },
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({ text: 'No graded rubrics in this period.', size: 20, color: '6B7280' }),
                            ],
                            spacing: { after: 120 },
                        })
                    );
                } else {
                    blocks.push(...(await buildRubricGradeSections(summaries)));
                }
                break;
            }
            case 'standards':
                blocks.push(...buildStandardsSection(section));
                break;
            case 'learningGoals': {
                blocks.push(
                    new Paragraph({
                        text: 'Learning Goals',
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 360, after: 120 },
                    })
                );
                if (section.goals.length === 0) {
                    blocks.push(
                        new Paragraph({
                            children: [new TextRun({ text: 'No learning goals tracked.', size: 20, color: '6B7280' })],
                            spacing: { after: 120 },
                        })
                    );
                } else {
                    blocks.push(buildGoalsTable(section.goals));
                }
                break;
            }
            case 'cefr':
                blocks.push(...buildCefrSection(section));
                break;
            case 'testSummary':
                blocks.push(...buildTestSummarySection(section));
                break;
        }
    }

    return blocks;
}

export async function exportReportCard(data: ReportCardData, styleTemplate?: ExportTemplate): Promise<void> {
    const blocks = await buildReportCardSections(data);
    const doc = new Document({ styles: buildDocxStyles(undefined, styleTemplate), sections: [{ children: blocks }] });
    const blob = await Packer.toBlob(doc);
    const safeName = data.studentName.replace(/[^a-z0-9]/gi, '_');
    saveAs(blob, `${safeName}_report_card.docx`);
}

export async function exportReportCardsBatch(
    dataList: ReportCardData[],
    styleTemplate?: ExportTemplate
): Promise<void> {
    for (const data of dataList) {
        await exportReportCard(data, styleTemplate);
    }
}
