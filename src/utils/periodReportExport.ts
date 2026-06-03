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
} from 'docx';
import { saveAs } from 'file-saver';
import type { Student, StudentRubric, Rubric, GradeScale } from '../types';
import { calcGradeSummary } from './gradeCalc';
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

function gradeColor(pct: number): string {
    if (pct >= 75) return 'DCFCE7'; // green-100
    if (pct >= 55) return 'FEF9C3'; // yellow-100
    return 'FEE2E2'; // red-100
}

function sparkBar(pct: number): string {
    const bars = '▁▂▃▄▅▆▇█';
    const idx = Math.min(7, Math.floor((pct / 100) * 8));
    return bars[idx];
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

export async function exportPeriodReport(input: PeriodReportInput): Promise<void> {
    const { student, className, entries, periodLabel, goals } = input;

    const sorted = [...entries].sort((a, b) => {
        const da = a.sr.gradedAt ? new Date(a.sr.gradedAt).getTime() : 0;
        const db = b.sr.gradedAt ? new Date(b.sr.gradedAt).getTime() : 0;
        return da - db;
    });

    const summaries = sorted.map((e) => ({
        ...e,
        summary: calcGradeSummary(e.sr, (e.sr.rubricSnapshot ?? e.rubric).criteria, e.scale),
        dateStr: e.sr.gradedAt ? new Date(e.sr.gradedAt).toLocaleDateString() : '—',
    }));

    const avg =
        summaries.length > 0
            ? summaries.reduce((acc, s) => acc + s.summary.modifiedPercentage, 0) / summaries.length
            : null;

    const sections: (Paragraph | Table)[] = [];

    // ── Title ──────────────────────────────────────────────────────────────────
    sections.push(
        new Paragraph({
            text: student.name,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 80 },
        })
    );

    sections.push(
        new Paragraph({
            children: [
                new TextRun({ text: className, size: 22, color: '6B7280' }),
                periodLabel ? new TextRun({ text: `  ·  ${periodLabel}`, size: 22, color: '6B7280' }) : new TextRun(''),
            ],
            spacing: { after: 200 },
        })
    );

    // ── Summary row (average + sparkline) ──────────────────────────────────────
    if (avg !== null) {
        const spark = summaries.map((s) => sparkBar(s.summary.modifiedPercentage)).join(' ');
        sections.push(
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

    // ── Grade trend mini-chart ─────────────────────────────────────────────────
    if (summaries.length >= 2) {
        sections.push(
            new Paragraph({
                text: 'Grade Trend',
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 160, after: 120 },
            })
        );

        const trendCells = summaries.map((s) => {
            const pct = s.summary.modifiedPercentage;
            return new TableCell({
                children: [
                    new Paragraph({
                        children: [
                            new TextRun({ text: `${pct.toFixed(0)}%`, size: 16, bold: true }),
                        ],
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

        sections.push(
            new Table({
                rows: [new TableRow({ children: trendCells })],
                width: { size: 100, type: WidthType.PERCENTAGE },
            })
        );
    }

    // ── Grades table ──────────────────────────────────────────────────────────
    sections.push(
        new Paragraph({ text: 'Grades', heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 } })
    );

    const tableRows: TableRow[] = [
        new TableRow({
            children: [headerCell('Assignment', 40), headerCell('Date', 20), headerCell('Score', 20), headerCell('Grade', 20)],
        }),
        ...summaries.map(
            (s) =>
                new TableRow({
                    children: [
                        dataCell(s.rubric.name, 40),
                        dataCell(s.dateStr, 20),
                        dataCell(`${s.summary.modifiedPercentage.toFixed(1)}%`, 20, gradeColor(s.summary.modifiedPercentage)),
                        dataCell(s.summary.letterGrade || '—', 20),
                    ],
                })
        ),
    ];

    sections.push(
        new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
        })
    );

    // ── Learning Goals overview ────────────────────────────────────────────────
    if (goals && goals.length > 0) {
        sections.push(
            new Paragraph({
                text: 'Learning Goals',
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 360, after: 120 },
            })
        );

        const goalRows: TableRow[] = [
            new TableRow({
                children: [
                    headerCell('Goal', 50),
                    headerCell('Average', 20),
                    headerCell('Progress', 30),
                ],
            }),
            ...goals.map((g) => {
                const pct = g.averagePercentage;
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
                                        new TextRun({ text: bar, size: 18, font: 'Courier New', color: pct >= 75 ? '16A34A' : pct >= 55 ? 'CA8A04' : 'DC2626' }),
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

        sections.push(
            new Table({
                rows: goalRows,
                width: { size: 100, type: WidthType.PERCENTAGE },
            })
        );
    }

    // ── Feedback section ───────────────────────────────────────────────────────
    const withComments = summaries.filter((s) => s.sr.overallComment || s.sr.entries.some((e) => e.comment));

    if (withComments.length > 0) {
        sections.push(
            new Paragraph({ text: 'Feedback', heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 120 } })
        );

        for (const s of withComments) {
            sections.push(
                new Paragraph({
                    children: [new TextRun({ text: s.rubric.name, bold: true, size: 22 })],
                    spacing: { before: 200, after: 60 },
                })
            );

            if (s.sr.overallComment) {
                sections.push(
                    new Paragraph({
                        children: [new TextRun({ text: s.sr.overallComment, size: 20, color: '374151' })],
                        spacing: { after: 60 },
                    })
                );
            }

            const criterionComments = s.sr.entries.filter((e) => e.comment);
            for (const entry of criterionComments) {
                const rubricForEntry = s.sr.rubricSnapshot ?? s.rubric;
                const criterion = rubricForEntry.criteria.find((c) => c.id === entry.criterionId);
                if (!criterion) continue;
                sections.push(
                    new Paragraph({
                        children: [
                            new TextRun({ text: `${criterion.title}: `, bold: true, size: 20 }),
                            new TextRun({ text: entry.comment, size: 20, color: '374151' }),
                        ],
                        spacing: { after: 40 },
                    })
                );
            }
        }
    }

    const doc = new Document({ sections: [{ children: sections }] });
    const blob = await Packer.toBlob(doc);
    const safeName = student.name.replace(/[^a-z0-9]/gi, '_');
    saveAs(blob, `${safeName}_period_report.docx`);
}

export async function exportPeriodReportsBatch(inputs: PeriodReportInput[]): Promise<void> {
    for (const input of inputs) {
        await exportPeriodReport(input);
    }
}
