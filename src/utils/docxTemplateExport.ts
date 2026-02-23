/**
 * docxTemplateExport.ts
 *
 * Exports a rubric to DOCX using a user-uploaded blank template.
 * Option A approach: extract column header labels + header colour from the
 * uploaded template, then build the output document with the existing `docx`
 * library, preserving those styling cues.
 */

import {
    Document, Packer, Paragraph, Table, TableCell, TableRow,
    WidthType, TextRun, AlignmentType, HeadingLevel, ShadingType,
} from 'docx';
import { saveAs } from 'file-saver';
import type { Rubric, RubricCriterion, ExportTemplate } from '../types';

// ─── Template parsing (mammoth extracts the HTML table header) ────────────────

export async function parseTemplateHeaders(file: File): Promise<{
    levelHeaders: string[];
    headerColor: string;
}> {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });

    const parser = new DOMParser();
    const doc = parser.parseFromString(result.value, 'text/html');

    const table = doc.querySelector('table');
    if (!table) return { levelHeaders: [], headerColor: '#1e3a5f' };

    // First row = level headers; skip first cell (criterion column)
    const headerRow = table.querySelector('tr');
    const headerCells = Array.from(headerRow?.querySelectorAll('td, th') ?? []);

    // All cells after the first are level columns
    const levelHeaders = headerCells.slice(1).map(td => td.textContent?.trim() ?? '').filter(Boolean);

    // Try to detect a background colour from inline style or class (basic extraction)
    let headerColor = '#1e3a5f';
    const style = (headerRow as HTMLElement)?.getAttribute('style') ?? '';
    const match = style.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/i);
    if (match) headerColor = match[1];

    return { levelHeaders, headerColor };
}

// ─── Export ────────────────────────────────────────────────────────────────────

export async function exportRubricWithTemplate(rubric: Rubric, template: ExportTemplate): Promise<void> {
    const fmt = rubric.format;

    // Use template level headers if count matches; fall back to rubric's own labels
    const firstCriterion = rubric.criteria[0];
    const rubricLevelLabels = firstCriterion
        ? (fmt.levelOrder === 'worst-first' ? [...firstCriterion.levels].reverse() : firstCriterion.levels).map(l => l.label)
        : [];

    const useTemplateHeaders = template.levelHeaders.length === rubricLevelLabels.length
        && template.levelHeaders.length > 0;

    const levelLabels = useTemplateHeaders ? template.levelHeaders : rubricLevelLabels;
    const headerBg = (template.headerColor ?? fmt.headerColor).replace('#', '');

    const getLevels = (c: RubricCriterion) =>
        fmt.levelOrder === 'worst-first' ? [...c.levels].reverse() : c.levels;

    // ── Header Row ──────────────────────────────────────────────────────────────
    const headerRow = new TableRow({
        tableHeader: true,
        children: [
            new TableCell({
                width: { size: 22, type: WidthType.PERCENTAGE },
                shading: { fill: headerBg, type: ShadingType.CLEAR, color: headerBg },
                children: [new Paragraph({
                    children: [new TextRun({ text: 'Criterion', bold: true, color: 'FFFFFF', size: fmt.fontSize * 2 })],
                })],
            }),
            ...levelLabels.map((label, i) => {
                const rubricLevel = rubric.criteria[0] ? getLevels(rubric.criteria[0])[i] : undefined;
                const pointsStr = fmt.showPoints && rubricLevel
                    ? ` (${rubricLevel.minPoints === rubricLevel.maxPoints ? rubricLevel.maxPoints : `${rubricLevel.minPoints}–${rubricLevel.maxPoints}`} pts)`
                    : '';
                return new TableCell({
                    width: { size: (78 / levelLabels.length), type: WidthType.PERCENTAGE },
                    shading: { fill: headerBg, type: ShadingType.CLEAR, color: headerBg },
                    children: [new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: label, bold: true, color: 'FFFFFF', size: fmt.fontSize * 2 }),
                            ...(pointsStr ? [new TextRun({ text: pointsStr, color: 'FFFFFF', size: (fmt.fontSize - 2) * 2 })] : []),
                        ],
                    })],
                });
            }),
        ],
    });

    // ── Body Rows ───────────────────────────────────────────────────────────────
    const bodyRows = rubric.criteria.map(c => {
        const levels = getLevels(c);
        return new TableRow({
            children: [
                // Criterion cell
                new TableCell({
                    width: { size: 22, type: WidthType.PERCENTAGE },
                    shading: { fill: 'F8F9FA', type: ShadingType.CLEAR, color: 'F8F9FA' },
                    children: [
                        new Paragraph({ children: [new TextRun({ text: c.title, bold: true, size: fmt.fontSize * 2 })] }),
                        ...(c.description ? [new Paragraph({ children: [new TextRun({ text: c.description, size: (fmt.fontSize - 2) * 2, color: '666666' })] })] : []),
                        ...(fmt.showWeights ? [new Paragraph({ children: [new TextRun({ text: `Weight: ${c.weight}%`, size: (fmt.fontSize - 2) * 2, color: '888888' })], spacing: { before: 80 } })] : []),
                    ],
                }),
                // Level cells
                ...levels.map(l => new TableCell({
                    width: { size: (78 / levels.length), type: WidthType.PERCENTAGE },
                    children: [
                        new Paragraph({ children: [new TextRun({ text: l.description || '—', size: fmt.fontSize * 2 })] }),
                        ...(fmt.showPoints ? [new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            spacing: { before: 80 },
                            children: [new TextRun({
                                text: `${l.minPoints === l.maxPoints ? l.maxPoints : `${l.minPoints}–${l.maxPoints}`} pts`,
                                bold: true,
                                size: (fmt.fontSize - 2) * 2,
                            })],
                        })] : []),
                    ],
                })),
            ],
        });
    });

    // ── Assemble Document ────────────────────────────────────────────────────────
    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({
                    text: rubric.name,
                    heading: HeadingLevel.HEADING_1,
                    spacing: { after: 200 },
                }),
                ...(rubric.subject ? [new Paragraph({
                    text: rubric.subject,
                    heading: HeadingLevel.HEADING_2,
                    spacing: { after: 300 },
                })] : []),
                ...(rubric.description ? [new Paragraph({
                    children: [new TextRun({ text: rubric.description, italics: true, color: '555555' })],
                    spacing: { after: 400 },
                })] : []),
                new Table({
                    rows: [headerRow, ...bodyRows],
                    width: { size: 100, type: WidthType.PERCENTAGE },
                }),
                ...(useTemplateHeaders ? [] : [
                    new Paragraph({
                        children: [new TextRun({
                            text: `Note: Template column count (${template.levelHeaders.length}) did not match rubric levels (${rubricLevelLabels.length}); rubric level labels were used instead.`,
                            color: '888888', italics: true, size: 18,
                        })],
                        spacing: { before: 300 },
                    }),
                ]),
            ],
        }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${rubric.name.replace(/[^a-z0-9]/gi, '_')}_rubric.docx`);
}
