import { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, type Table } from 'docx';
import { saveAs } from 'file-saver';
import type {
    EssayAssignment,
    EssaySubmission,
    Student,
    StudentRubric,
    Rubric,
    GradeScale,
    DocumentAnalysisResult,
    VocabularyItem,
} from '../types';
import { buildDocxStyles, buildRubricGridDocxChildren } from './docxExport';
import { printHtml, buildRubricHTML } from './pdfExport';

type EssayLike = Pick<EssayAssignment, 'title'>;

function safeFilename(name: string): string {
    return name.replace(/[^a-z0-9]/gi, '_');
}

// ponytail: walks only the tags EssayEditor's TipTap config actually emits (p, h1-3, strong/em/u/s,
// sup/sub, ul/ol/li, blockquote, hr, a, br, table). Tables/task-lists flatten to plain text in
// Markdown/DOCX — full fidelity there isn't worth a real HTML->Markdown/docx library for two block
// types; extend this walker if a teacher actually needs it.
function parseEssayHtml(html: string): HTMLElement {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    return doc.body.firstElementChild as HTMLElement;
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
        case 'A':
            return `[${inner}](${node.getAttribute('href') ?? ''})`;
        case 'BR':
            return '\n';
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
        case 'OL':
            return (
                Array.from(node.children)
                    .map((li, i) => {
                        const marker = tag === 'OL' ? `${i + 1}.` : '-';
                        return `${'  '.repeat(listDepth)}${marker} ${inlineMarkdown(li).trim()}`;
                    })
                    .join('\n') + '\n\n'
            );
        case 'TABLE':
            return (
                Array.from(node.querySelectorAll('tr'))
                    .map((row) =>
                        Array.from(row.children)
                            .map((cell) => cell.textContent?.trim() ?? '')
                            .join(' | ')
                    )
                    .join('\n') + '\n\n'
            );
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

function inlineDocxRuns(el: ChildNode, bold = false, italics = false, underline = false, strike = false): TextRun[] {
    if (el.nodeType === Node.TEXT_NODE) {
        const text = el.textContent ?? '';
        if (!text) return [];
        return [new TextRun({ text, bold, italics, strike, underline: underline ? {} : undefined })];
    }
    const node = el as HTMLElement;
    const tag = node.tagName;
    const nextBold = bold || tag === 'STRONG' || tag === 'B';
    const nextItalics = italics || tag === 'EM' || tag === 'I';
    const nextUnderline = underline || tag === 'U';
    const nextStrike = strike || tag === 'S' || tag === 'STRIKE' || tag === 'DEL';
    if (tag === 'BR') return [new TextRun({ break: 1 })];
    return Array.from(node.childNodes).flatMap((child) =>
        inlineDocxRuns(child, nextBold, nextItalics, nextUnderline, nextStrike)
    );
}

/** Converts EssayEditor's TipTap HTML output to docx Paragraph nodes. */
export function htmlToDocxChildren(html: string): Paragraph[] {
    const root = parseEssayHtml(html);
    const children: Paragraph[] = [];
    for (const node of Array.from(root.children)) {
        const tag = node.tagName;
        if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
            const heading = tag === 'H1' ? HeadingLevel.HEADING_1 : tag === 'H2' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
            children.push(new Paragraph({ heading, children: Array.from(node.childNodes).flatMap((c) => inlineDocxRuns(c)) }));
        } else if (tag === 'BLOCKQUOTE') {
            children.push(
                new Paragraph({
                    indent: { left: 360 },
                    children: Array.from(node.childNodes).flatMap((c) => inlineDocxRuns(c, false, true)),
                })
            );
        } else if (tag === 'HR') {
            children.push(new Paragraph({ text: '────────────', spacing: { before: 100, after: 100 } }));
        } else if (tag === 'UL' || tag === 'OL') {
            Array.from(node.children).forEach((li, i) => {
                const bullet = tag === 'OL' ? `${i + 1}. ` : '• ';
                children.push(
                    new Paragraph({
                        indent: { left: 360 },
                        children: [new TextRun(bullet), ...Array.from(li.childNodes).flatMap((c) => inlineDocxRuns(c))],
                    })
                );
            });
        } else if (tag === 'TABLE') {
            for (const row of Array.from(node.querySelectorAll('tr'))) {
                const text = Array.from(row.children)
                    .map((cell) => cell.textContent?.trim() ?? '')
                    .join(' | ');
                children.push(new Paragraph({ text }));
            }
        } else {
            children.push(new Paragraph({ children: Array.from(node.childNodes).flatMap((c) => inlineDocxRuns(c)) }));
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
            children: [new TextRun({ text: essayHeaderLine(assignment, student, submission), color: '6b7280', size: 20 })],
            spacing: { after: 240 },
        }),
    ];
}

function essayHtmlHeader(assignment: EssayLike, student: Student, submission: EssaySubmission): string {
    return `
  <div class="print-page" style="page-break-after: always; color: #1e293b; background: #fff;">
    <h1 style="margin:0 0 4px;font-size:20px">${assignment.title}</h1>
    <div style="color:#6b7280;font-size:13px;margin-bottom:18px">${essayHeaderLine(assignment, student, submission)}</div>
    ${submission.contentHtml}
  </div>`;
}

export async function exportEssayMarkdown(assignment: EssayLike, student: Student, submission: EssaySubmission) {
    const md = `# ${assignment.title}\n\n_${essayHeaderLine(assignment, student, submission)}_\n\n${htmlToMarkdown(submission.contentHtml)}\n`;
    saveAs(new Blob([md], { type: 'text/markdown' }), `${safeFilename(student.name)}_${safeFilename(assignment.title)}.md`);
}

export async function exportEssayDocx(assignment: EssayLike, student: Student, submission: EssaySubmission) {
    const doc = new Document({
        sections: [{ children: [...essayDocxHeader(assignment, student, submission), ...htmlToDocxChildren(submission.contentHtml)] }],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${safeFilename(student.name)}_${safeFilename(assignment.title)}.docx`);
}

export async function exportEssayPdf(assignment: EssayLike, student: Student, submission: EssaySubmission) {
    await printHtml(essayHtmlHeader(assignment, student, submission), 'portrait');
}

interface EssayBatchEntry {
    assignment: EssayLike;
    student: Student;
    submission: EssaySubmission;
}

export async function exportEssaysBatch(entries: EssayBatchEntry[], format: 'markdown' | 'docx' | 'pdf', mode: 'separate' | 'combined') {
    if (mode === 'separate') {
        for (const { assignment, student, submission } of entries) {
            if (format === 'markdown') await exportEssayMarkdown(assignment, student, submission);
            else if (format === 'docx') await exportEssayDocx(assignment, student, submission);
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
        const doc = new Document({ sections: [{ children }] });
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
        new Paragraph({ text: 'Grammar & Vocabulary Analysis', heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }),
    ];
    for (const item of analysis.detectedItems) {
        const phrase = vocabularyItems.find((v) => v.id === item.vocabularyItemId)?.phrase ?? item.vocabularyItemId;
        children.push(
            new Paragraph({
                children: [new TextRun({ text: `${item.found ? '✓' : '✗'} ${phrase}`, bold: true }), new TextRun(` — ${item.occurrences} occurrence(s)`)],
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
            return `<li>${item.found ? '✓' : '✗'} <strong>${phrase}</strong> — ${item.occurrences} occurrence(s)</li>`;
        })
        .join('');
    const grammarRows = analysis.grammarErrors.map((err) => `<li>${err.message}</li>`).join('');
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
    analysis?: DocumentAnalysisResult
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
        const doc = new Document({ styles: buildDocxStyles(rubric.format.fontFamily), sections: [{ children }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `${safeFilename(student.name)}_${safeFilename(assignment.title)}_with_rubric.docx`);
        return;
    }

    const html =
        essayHtmlHeader(assignment, student, submission) +
        buildRubricHTML(studentRubric, rubric, student, scale) +
        (analysis ? analysisHtml(analysis, vocabularyItems) : '');
    await printHtml(html, 'portrait', rubric.format.fontFamily);
}
