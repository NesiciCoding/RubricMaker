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
} from 'docx';
import { saveAs } from 'file-saver';
import type { Student, StudentRubric, Rubric, GradeScale } from '../types';
import { calcGradeSummary } from './gradeCalc';

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
}

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function headerCell(text: string): TableCell {
    return new TableCell({
        children: [
            new Paragraph({ children: [new TextRun({ text, bold: true, size: 20 })], alignment: AlignmentType.LEFT }),
        ],
        width: { size: 25, type: WidthType.PERCENTAGE },
        borders: { top: BORDER, bottom: BORDER, left: NO_BORDER, right: NO_BORDER },
        shading: { fill: 'F3F4F6' },
    });
}

function dataCell(text: string, pct = 25): TableCell {
    return new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, size: 20 })], alignment: AlignmentType.LEFT })],
        width: { size: pct, type: WidthType.PERCENTAGE },
        borders: { top: BORDER, bottom: BORDER, left: NO_BORDER, right: NO_BORDER },
    });
}

export async function exportPeriodReport(input: PeriodReportInput): Promise<void> {
    const { student, className, entries, periodLabel } = input;

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
            spacing: { after: 300 },
        })
    );

    if (avg !== null) {
        sections.push(
            new Paragraph({
                children: [
                    new TextRun({ text: 'Period average: ', bold: true, size: 22 }),
                    new TextRun({ text: `${avg.toFixed(1)}%`, size: 22 }),
                ],
                spacing: { after: 240 },
            })
        );
    }

    // ── Grades table ──────────────────────────────────────────────────────────
    sections.push(
        new Paragraph({ text: 'Grades', heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 120 } })
    );

    const tableRows: TableRow[] = [
        new TableRow({
            children: [headerCell('Assignment'), headerCell('Date'), headerCell('Score'), headerCell('Grade')],
        }),
        ...summaries.map(
            (s) =>
                new TableRow({
                    children: [
                        dataCell(s.rubric.name),
                        dataCell(s.dateStr),
                        dataCell(`${s.summary.modifiedPercentage.toFixed(1)}%`),
                        dataCell(s.summary.letterGrade || '—'),
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
