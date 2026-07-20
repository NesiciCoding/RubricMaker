import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    PageBreak,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    AlignmentType,
    LineRuleType,
} from 'docx';
import { saveAs } from 'file-saver';
import DOMPurify from 'dompurify';
import type {
    EssayAssignment,
    EssaySubmission,
    Student,
    StudentRubric,
    Rubric,
    GradeScale,
    DocumentAnalysisResult,
    VocabularyItem,
    ExportTemplate,
} from '../types';
import { buildDocxStyles, buildRubricGridDocxChildren } from './docxExport';
import { printHtml, buildRubricHTML } from './pdfExport';
import { sanitizeFilename } from './exportDataPrep';

type EssayLike = Pick<EssayAssignment, 'title'>;

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ponytail: walks only the tags EssayEditor's TipTap config actually emits (p, h1-3, strong/em/u/s,
// sup/sub, color/highlight/font/line-height spans, ul/ol/li incl. task lists, blockquote, hr, a, br,
// table). Markdown has no native representation for paragraph text-align/line-height, so those two
// degrade silently there (DOCX carries them); everything else round-trips in both formats.
function parseEssayHtml(html: string): HTMLElement {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    return doc.body.firstElementChild as HTMLElement;
}

/** Reads a single CSS property out of an element's inline `style` attribute (raw string, not the computed/normalized CSSStyleDeclaration, so hex colors survive intact). */
function styleValue(el: HTMLElement, prop: string): string | undefined {
    const raw = el.getAttribute('style');
    if (!raw) return undefined;
    return new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(raw)?.[1]?.trim();
}

function inlineMarkdown(el: ChildNode): string {
    if (el.nodeType === Node.TEXT_NODE) return el.textContent ?? '';
    const node = el as HTMLElement;
    const inner = Array.from(node.childNodes).map(inlineMarkdown).join('');
    switch (node.tagName) {
        case 'STRONG':
        case 'B':
            return `**${inner}**`;
        case 'EM':
        case 'I':
            return `_${inner}_`;
        case 'S':
        case 'STRIKE':
        case 'DEL':
            return `~~${inner}~~`;
        case 'U':
            return `<u>${inner}</u>`;
        case 'SUP':
            return `<sup>${inner}</sup>`;
        case 'SUB':
            return `<sub>${inner}</sub>`;
        case 'MARK': {
            const bg = styleValue(node, 'background-color') ?? node.getAttribute('data-color');
            return bg ? `<mark style="background-color: ${bg}">${inner}</mark>` : `==${inner}==`;
        }
        case 'A':
            return `[${inner}](${node.getAttribute('href') ?? ''})`;
        case 'BR':
            return '\n';
        case 'SPAN': {
            const color = styleValue(node, 'color');
            const fontFamily = styleValue(node, 'font-family');
            const fontSize = styleValue(node, 'font-size');
            const styles = [
                color && `color: ${color}`,
                fontFamily && `font-family: ${fontFamily}`,
                fontSize && `font-size: ${fontSize}`,
            ].filter(Boolean);
            return styles.length > 0 ? `<span style="${styles.join('; ')}">${inner}</span>` : inner;
        }
        default:
            return inner;
    }
}

function blockToMarkdown(node: Element, listDepth = 0): string {
    const tag = node.tagName;
    switch (tag) {
        case 'H1':
            return `# ${inlineMarkdown(node).trim()}\n\n`;
        case 'H2':
            return `## ${inlineMarkdown(node).trim()}\n\n`;
        case 'H3':
            return `### ${inlineMarkdown(node).trim()}\n\n`;
        case 'P':
            return `${inlineMarkdown(node).trim()}\n\n`;
        case 'BLOCKQUOTE':
            return `> ${inlineMarkdown(node).trim()}\n\n`;
        case 'HR':
            return `---\n\n`;
        case 'UL':
        case 'OL': {
            const isTaskList = node.getAttribute('data-type') === 'taskList';
            return (
                Array.from(node.children)
                    .map((li, i) => {
                        const marker = isTaskList
                            ? li.getAttribute('data-checked') === 'true'
                                ? '- [x]'
                                : '- [ ]'
                            : tag === 'OL'
                              ? `${i + 1}.`
                              : '-';
                        // Task items wrap their text in a <div>/<label>; strip those, keep nested lists out of scope.
                        const text = isTaskList
                            ? (li.querySelector('div')?.textContent?.trim() ?? li.textContent?.trim() ?? '')
                            : inlineMarkdown(li).trim();
                        return `${'  '.repeat(listDepth)}${marker} ${text}`;
                    })
                    .join('\n') + '\n\n'
            );
        }
        case 'TABLE': {
            const rows = Array.from(node.querySelectorAll('tr'));
            if (rows.length === 0) return '\n\n';
            const cellsOf = (row: Element) =>
                Array.from(row.children).map((cell) =>
                    (cell.textContent?.trim() ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
                );
            const header = cellsOf(rows[0]);
            const body = rows.slice(1).map(cellsOf);
            const lines = [
                `| ${header.join(' | ')} |`,
                `| ${header.map(() => '---').join(' | ')} |`,
                ...body.map((row) => `| ${row.join(' | ')} |`),
            ];
            return lines.join('\n') + '\n\n';
        }
        default:
            return `${node.textContent?.trim() ?? ''}\n\n`;
    }
}

/** Converts EssayEditor's TipTap HTML output to Markdown. */
export function htmlToMarkdown(html: string): string {
    const root = parseEssayHtml(html);
    return Array.from(root.children)
        .map((child) => blockToMarkdown(child))
        .join('')
        .trim();
}

interface InlineStyle {
    bold: boolean;
    italics: boolean;
    underline: boolean;
    strike: boolean;
    superScript: boolean;
    subScript: boolean;
    color?: string;
    highlightFill?: string;
    font?: string;
    size?: number; // half-points
}

const PLAIN_STYLE: InlineStyle = {
    bold: false,
    italics: false,
    underline: false,
    strike: false,
    superScript: false,
    subScript: false,
};

function ptToHalfPoints(pt: string): number | undefined {
    const n = parseFloat(pt);
    return Number.isFinite(n) ? Math.round(n * 2) : undefined;
}

function inlineDocxRuns(el: ChildNode, style: InlineStyle = PLAIN_STYLE): TextRun[] {
    if (el.nodeType === Node.TEXT_NODE) {
        const text = el.textContent ?? '';
        if (!text) return [];
        return [
            new TextRun({
                text,
                bold: style.bold,
                italics: style.italics,
                strike: style.strike,
                underline: style.underline ? {} : undefined,
                superScript: style.superScript || undefined,
                subScript: style.subScript || undefined,
                color: style.color,
                font: style.font,
                size: style.size,
                shading: style.highlightFill ? { fill: style.highlightFill.replace('#', '') } : undefined,
            }),
        ];
    }
    const node = el as HTMLElement;
    const tag = node.tagName;
    if (tag === 'BR') return [new TextRun({ break: 1 })];

    const color = styleValue(node, 'color');
    const fontFamily = styleValue(node, 'font-family');
    const fontSize = styleValue(node, 'font-size');
    const highlightBg =
        tag === 'MARK' ? (styleValue(node, 'background-color') ?? node.getAttribute('data-color')) : undefined;
    const next: InlineStyle = {
        bold: style.bold || tag === 'STRONG' || tag === 'B',
        italics: style.italics || tag === 'EM' || tag === 'I',
        underline: style.underline || tag === 'U',
        strike: style.strike || tag === 'S' || tag === 'STRIKE' || tag === 'DEL',
        superScript: style.superScript || tag === 'SUP',
        subScript: style.subScript || tag === 'SUB',
        color: color ? color.replace('#', '') : style.color,
        highlightFill: highlightBg ? highlightBg.replace('#', '') : style.highlightFill,
        font: fontFamily ? fontFamily.split(',')[0].replace(/['"]/g, '').trim() : style.font,
        size: fontSize ? (ptToHalfPoints(fontSize) ?? style.size) : style.size,
    };
    return Array.from(node.childNodes).flatMap((child) => inlineDocxRuns(child, next));
}

function blockAlignment(node: Element): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
    switch (styleValue(node as HTMLElement, 'text-align')) {
        case 'center':
            return AlignmentType.CENTER;
        case 'right':
            return AlignmentType.RIGHT;
        case 'justify':
            return AlignmentType.JUSTIFIED;
        case 'left':
            return AlignmentType.LEFT;
        default:
            return undefined;
    }
}

function blockSpacing(
    node: Element
): { line: number; lineRule: (typeof LineRuleType)[keyof typeof LineRuleType] } | undefined {
    const lineHeight = styleValue(node as HTMLElement, 'line-height');
    const multiplier = lineHeight ? parseFloat(lineHeight) : undefined;
    return multiplier && Number.isFinite(multiplier)
        ? { line: Math.round(multiplier * 240), lineRule: LineRuleType.AUTO }
        : undefined;
}

const TABLE_CELL_BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
const TABLE_CELL_BORDERS = {
    top: TABLE_CELL_BORDER,
    bottom: TABLE_CELL_BORDER,
    left: TABLE_CELL_BORDER,
    right: TABLE_CELL_BORDER,
};

function tableToDocx(node: Element): Table {
    const rows = Array.from(node.querySelectorAll('tr'));
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map(
            (row) =>
                new TableRow({
                    children: Array.from(row.children).map((cell) => {
                        const isHeader = cell.tagName === 'TH';
                        return new TableCell({
                            borders: TABLE_CELL_BORDERS,
                            shading: isHeader ? { fill: 'F1F5F9' } : undefined,
                            children: [
                                new Paragraph({
                                    children: Array.from(cell.childNodes).flatMap((c) =>
                                        inlineDocxRuns(c, isHeader ? { ...PLAIN_STYLE, bold: true } : PLAIN_STYLE)
                                    ),
                                }),
                            ],
                        });
                    }),
                })
        ),
    });
}

function taskListToDocx(node: Element): Paragraph[] {
    return Array.from(node.children).map((li) => {
        const checked = li.getAttribute('data-checked') === 'true';
        const content = li.querySelector(':scope > div') ?? li;
        return new Paragraph({
            indent: { left: 360 },
            children: [
                new TextRun(checked ? '☑ ' : '☐ '),
                ...Array.from(content.childNodes).flatMap((c) => inlineDocxRuns(c)),
            ],
        });
    });
}

/** Converts EssayEditor's TipTap HTML output to docx Paragraph/Table nodes. */
export function htmlToDocxChildren(html: string): (Paragraph | Table)[] {
    const root = parseEssayHtml(html);
    const children: (Paragraph | Table)[] = [];
    for (const node of Array.from(root.children)) {
        const tag = node.tagName;
        const alignment = blockAlignment(node);
        const spacing = blockSpacing(node);
        if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
            const heading =
                tag === 'H1' ? HeadingLevel.HEADING_1 : tag === 'H2' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
            children.push(
                new Paragraph({
                    heading,
                    alignment,
                    spacing,
                    children: Array.from(node.childNodes).flatMap((c) => inlineDocxRuns(c)),
                })
            );
        } else if (tag === 'BLOCKQUOTE') {
            children.push(
                new Paragraph({
                    indent: { left: 360 },
                    children: Array.from(node.childNodes).flatMap((c) =>
                        inlineDocxRuns(c, { ...PLAIN_STYLE, italics: true })
                    ),
                })
            );
        } else if (tag === 'HR') {
            children.push(new Paragraph({ text: '────────────', spacing: { before: 100, after: 100 } }));
        } else if (tag === 'UL' || tag === 'OL') {
            if (node.getAttribute('data-type') === 'taskList') {
                children.push(...taskListToDocx(node));
            } else {
                Array.from(node.children).forEach((li, i) => {
                    const bullet = tag === 'OL' ? `${i + 1}. ` : '• ';
                    children.push(
                        new Paragraph({
                            indent: { left: 360 },
                            children: [
                                new TextRun(bullet),
                                ...Array.from(li.childNodes).flatMap((c) => inlineDocxRuns(c)),
                            ],
                        })
                    );
                });
            }
        } else if (tag === 'TABLE') {
            children.push(tableToDocx(node));
        } else {
            children.push(
                new Paragraph({
                    alignment,
                    spacing,
                    children: Array.from(node.childNodes).flatMap((c) => inlineDocxRuns(c)),
                })
            );
        }
    }
    return children;
}

function essayHeaderLine(assignment: EssayLike, student: Student, submission: EssaySubmission): string {
    return `${student.name} · ${new Date(submission.submittedAt).toLocaleDateString()} · ${submission.wordCount} words`;
}

function essayDocxHeader(assignment: EssayLike, student: Student, submission: EssaySubmission): Paragraph[] {
    return [
        new Paragraph({ text: assignment.title, heading: HeadingLevel.HEADING_1, spacing: { after: 80 } }),
        new Paragraph({
            children: [
                new TextRun({ text: essayHeaderLine(assignment, student, submission), color: '6b7280', size: 20 }),
            ],
            spacing: { after: 240 },
        }),
    ];
}

function essayHtmlHeader(assignment: EssayLike, student: Student, submission: EssaySubmission): string {
    return `
  <div class="print-page" style="page-break-after: always; color: #1e293b; background: #fff;">
    <h1 style="margin:0 0 4px;font-size:20px">${escapeHtml(assignment.title)}</h1>
    <div style="color:#6b7280;font-size:13px;margin-bottom:18px">${escapeHtml(essayHeaderLine(assignment, student, submission))}</div>
    ${DOMPurify.sanitize(submission.contentHtml)}
  </div>`;
}

export async function exportEssayMarkdown(assignment: EssayLike, student: Student, submission: EssaySubmission) {
    const md = `# ${assignment.title}\n\n_${essayHeaderLine(assignment, student, submission)}_\n\n${htmlToMarkdown(submission.contentHtml)}\n`;
    saveAs(
        new Blob([md], { type: 'text/markdown' }),
        `${sanitizeFilename(student.name)}_${sanitizeFilename(assignment.title)}.md`
    );
}

export async function exportEssayDocx(
    assignment: EssayLike,
    student: Student,
    submission: EssaySubmission,
    styleTemplate?: ExportTemplate
) {
    const doc = new Document({
        styles: buildDocxStyles(undefined, styleTemplate),
        sections: [
            {
                children: [
                    ...essayDocxHeader(assignment, student, submission),
                    ...htmlToDocxChildren(submission.contentHtml),
                ],
            },
        ],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${sanitizeFilename(student.name)}_${sanitizeFilename(assignment.title)}.docx`);
}

export async function exportEssayPdf(assignment: EssayLike, student: Student, submission: EssaySubmission) {
    await printHtml(essayHtmlHeader(assignment, student, submission), 'portrait');
}

interface EssayBatchEntry {
    assignment: EssayLike;
    student: Student;
    submission: EssaySubmission;
}

export async function exportEssaysBatch(
    entries: EssayBatchEntry[],
    format: 'markdown' | 'docx' | 'pdf',
    mode: 'separate' | 'combined',
    styleTemplate?: ExportTemplate
) {
    if (mode === 'separate') {
        for (const { assignment, student, submission } of entries) {
            if (format === 'markdown') await exportEssayMarkdown(assignment, student, submission);
            else if (format === 'docx') await exportEssayDocx(assignment, student, submission, styleTemplate);
            else await exportEssayPdf(assignment, student, submission);
        }
        return;
    }

    if (format === 'markdown') {
        const md = entries
            .map(
                ({ assignment, student, submission }) =>
                    `# ${assignment.title}\n\n_${essayHeaderLine(assignment, student, submission)}_\n\n${htmlToMarkdown(submission.contentHtml)}`
            )
            .join('\n\n---\n\n');
        saveAs(new Blob([md], { type: 'text/markdown' }), 'essays_batch.md');
        return;
    }

    if (format === 'docx') {
        const children = entries.flatMap(({ assignment, student, submission }, idx) => [
            ...(idx > 0 ? [new Paragraph({ children: [new PageBreak()] })] : []),
            ...essayDocxHeader(assignment, student, submission),
            ...htmlToDocxChildren(submission.contentHtml),
        ]);
        const doc = new Document({ styles: buildDocxStyles(undefined, styleTemplate), sections: [{ children }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, 'essays_batch.docx');
        return;
    }

    const html = entries
        .map(({ assignment, student, submission }) => essayHtmlHeader(assignment, student, submission))
        .join('');
    await printHtml(html, 'portrait');
}

function analysisDocxChildren(analysis: DocumentAnalysisResult, vocabularyItems: VocabularyItem[]): Paragraph[] {
    const children: Paragraph[] = [
        new Paragraph({
            text: 'Grammar & Vocabulary Analysis',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
        }),
    ];
    for (const item of analysis.detectedItems) {
        const phrase = vocabularyItems.find((v) => v.id === item.vocabularyItemId)?.phrase ?? item.vocabularyItemId;
        children.push(
            new Paragraph({
                children: [
                    new TextRun({ text: `${item.found ? '✓' : '✗'} ${phrase}`, bold: true }),
                    new TextRun(` — ${item.occurrences} occurrence(s)`),
                ],
            })
        );
    }
    if (analysis.grammarErrors.length > 0) {
        children.push(new Paragraph({ text: 'Grammar issues:', spacing: { before: 120 } }));
        for (const err of analysis.grammarErrors) {
            children.push(new Paragraph({ text: `• ${err.message}`, indent: { left: 360 } }));
        }
    }
    return children;
}

function analysisHtml(analysis: DocumentAnalysisResult, vocabularyItems: VocabularyItem[]): string {
    const vocabRows = analysis.detectedItems
        .map((item) => {
            const phrase = vocabularyItems.find((v) => v.id === item.vocabularyItemId)?.phrase ?? item.vocabularyItemId;
            return `<li>${item.found ? '✓' : '✗'} <strong>${escapeHtml(phrase)}</strong> — ${item.occurrences} occurrence(s)</li>`;
        })
        .join('');
    const grammarRows = analysis.grammarErrors.map((err) => `<li>${escapeHtml(err.message)}</li>`).join('');
    return `
    <div style="margin-top:18px;page-break-inside: avoid;">
      <h2 style="font-size:16px">Grammar &amp; Vocabulary Analysis</h2>
      ${vocabRows ? `<ul style="font-size:13px">${vocabRows}</ul>` : ''}
      ${grammarRows ? `<div style="font-size:13px"><strong>Grammar issues:</strong><ul>${grammarRows}</ul></div>` : ''}
    </div>`;
}

/** Combined essay + graded rubric (+ optional grammar/vocabulary analysis) export. Markdown is intentionally not offered — a grade grid has no clean Markdown representation. */
export async function exportEssayWithRubric(
    assignment: EssayLike,
    student: Student,
    submission: EssaySubmission,
    studentRubric: StudentRubric,
    rubric: Rubric,
    scale: GradeScale | null,
    format: 'docx' | 'pdf',
    analysis?: DocumentAnalysisResult,
    styleTemplate?: ExportTemplate
) {
    const vocabularyItems = rubric.vocabularyItems ?? [];

    if (format === 'docx') {
        const children: (Paragraph | Table)[] = [
            ...essayDocxHeader(assignment, student, submission),
            ...htmlToDocxChildren(submission.contentHtml),
            new Paragraph({ children: [new PageBreak()] }),
            ...buildRubricGridDocxChildren(rubric, studentRubric, scale, student),
            ...(analysis ? analysisDocxChildren(analysis, vocabularyItems) : []),
        ];
        const doc = new Document({
            styles: buildDocxStyles(rubric.format.fontFamily, styleTemplate),
            sections: [{ children }],
        });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `${sanitizeFilename(student.name)}_${sanitizeFilename(assignment.title)}_with_rubric.docx`);
        return;
    }

    const html =
        essayHtmlHeader(assignment, student, submission) +
        buildRubricHTML(studentRubric, rubric, student, scale) +
        (analysis ? analysisHtml(analysis, vocabularyItems) : '');
    await printHtml(html, 'portrait', rubric.format.fontFamily);
}
