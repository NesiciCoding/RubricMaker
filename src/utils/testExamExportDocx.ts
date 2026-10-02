/** CITO-style exam document rendering (DOCX), mirroring docxExport.ts's pattern. */
import {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    ImageRun,
    WidthType,
    HeadingLevel,
    PageBreak,
    BorderStyle,
    HeightRule,
    type ITableCellBorders,
} from 'docx';
import { saveAs } from 'file-saver';
import i18n from 'i18next';
import type { Student, Test, TestQuestion } from '../types';
import { buildDocxStyles } from './docxExport';
import { promptToHtml, sanitizeFilename } from './exportDataPrep';
import { htmlToDocxChildren, htmlToDocxLead, type DocxImageMap } from './essayExport';
import { plainQuestionPromptText } from './clozeParse';
import { calcTestMaxPoints } from './testCalc';
import {
    ANSWER_LINE_SPACING_MM,
    CHOICE_CELL_GAP_MM,
    CHOICE_CELL_WIDTH_MM,
    LONG_ANSWER_HEIGHT_MM,
    answerKeyText,
    answerSheetGeometry,
    categorizeBookletData,
    clozeBookletParts,
    groupQuestionsBySection,
    hotTextFallbackText,
    hotTextMirrorParts,
    matchingBookletData,
    matrixBookletData,
    bankBookletTiles,
    builderBookletTiles,
    errorBookletParts,
    optionLetter,
    orderingBookletItems,
    partialCreditLadder,
    type AnswerSpaceSpec,
    type TestExamExportOptions,
} from './testExamContent';

/** 1mm in docx twips (1/1440 inch, 1mm = 1/25.4 inch). */
const MM_TO_TWIPS = 56.6929;

const HTML_BLOCK_TAGS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'DIV']);

/**
 * Single document-order pass collecting one text segment per "run" of inline content: a block
 * boundary (entering or leaving a block element) flushes whatever inline text has accumulated so
 * far as its own segment, so text that surrounds a nested block — e.g.
 * `<blockquote>Before<p>Inside</p>After</blockquote>` — comes out in source order ("Before",
 * "Inside", "After") instead of the nested block's text being reordered around it. A plain `<div>`
 * (which `querySelectorAll('p, li, ...')` would miss) is included via the same block-boundary
 * flush, and a passage with no block tags at all still produces one segment from the trailing flush.
 */
export function collectParagraphTexts(root: Element): string[] {
    const texts: string[] = [];
    let buffer = '';
    const flush = () => {
        const text = buffer.replace(/\s+/g, ' ').trim();
        if (text) texts.push(text);
        buffer = '';
    };
    const walk = (node: ChildNode) => {
        if (node.nodeType === Node.TEXT_NODE) {
            buffer += node.textContent ?? '';
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as Element;
        const isBlock = HTML_BLOCK_TAGS.has(el.tagName);
        if (isBlock) flush();
        el.childNodes.forEach(walk);
        if (isBlock) flush();
    };
    root.childNodes.forEach(walk);
    flush();
    return texts;
}

const tx = (key: string, opts?: Record<string, unknown>) => i18n.t(`tests.export.exam.${key}`, opts);

const CELL_BORDER: ITableCellBorders = {
    top: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
    bottom: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
    left: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
    right: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
};

const NO_BORDER: ITableCellBorders = {
    top: { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE },
};

/** One-cell shaded table used as a full-width black subject banner, matching the print/HTML rendering. */
function blackBannerTable(text: string): Table {
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        shading: { fill: '000000' },
                        borders: NO_BORDER,
                        children: [
                            new Paragraph({
                                alignment: 'right',
                                children: [new TextRun({ text, bold: true, color: 'FFFFFF' })],
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });
}

const LIGHT_BORDER: ITableCellBorders = {
    top: { style: BorderStyle.SINGLE, size: 2, color: 'd1d5db' },
    bottom: { style: BorderStyle.SINGLE, size: 2, color: 'd1d5db' },
    left: { style: BorderStyle.SINGLE, size: 2, color: 'd1d5db' },
    right: { style: BorderStyle.SINGLE, size: 2, color: 'd1d5db' },
};

/** Bordered Name / Class / Date fill-in row for a booklet/attachment cover, so a page can still be attributed to a student if it's separated from the answer sheet. */
function nameClassDateTable(): Table {
    const field = (label: string) =>
        new TableCell({
            borders: LIGHT_BORDER,
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [
                new Paragraph({ children: [new TextRun({ text: label, size: 16, color: '6b7280' })] }),
                new Paragraph({
                    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' } },
                    spacing: { before: 120 },
                    children: [new TextRun({ text: ' ' })],
                }),
            ],
        });
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [field(tx('candidate_name')), field(tx('cover_class_label')), field(tx('cover_date_label'))],
            }),
        ],
    });
}

function coverParagraphs(test: Test, docLabel: string, includeNameBox = false): (Paragraph | Table)[] {
    const totalQuestions = test.questions.length;
    const totalPoints = calcTestMaxPoints(test);
    const summaryLines: Paragraph[] = [];
    if (totalQuestions > 0) {
        summaryLines.push(new Paragraph({ text: tx('question_count_line', { count: totalQuestions }) }));
    }
    if (totalPoints > 0) {
        summaryLines.push(new Paragraph({ text: tx('points_count_line', { points: totalPoints }) }));
    }
    if (test.durationMinutes) {
        summaryLines.push(new Paragraph({ text: tx('duration_line', { minutes: test.durationMinutes }) }));
    }
    return [
        new Paragraph({ text: docLabel, alignment: 'right' }),
        new Paragraph({
            children: [new TextRun({ text: String(new Date().getFullYear()), bold: true, size: 56 })],
            alignment: 'right',
            spacing: { after: 120 },
        }),
        blackBannerTable(test.name),
        ...(includeNameBox ? [new Paragraph({ text: '', spacing: { before: 200 } }), nameClassDateTable()] : []),
        new Paragraph({ text: '', spacing: { before: includeNameBox ? 200 : 400 } }),
        ...summaryLines,
        new Paragraph({ children: [new PageBreak()] }),
    ];
}

function audioNoteParagraph(): Paragraph {
    return new Paragraph({
        children: [new TextRun({ text: tx('audio_note'), italics: true, size: 18, color: '6b7280' })],
        spacing: { after: 80 },
    });
}

function sectionDivider(title: string): Paragraph {
    return new Paragraph({ text: title, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } });
}

function clozeRuns(question: TestQuestion): TextRun[] {
    return clozeBookletParts(question).flatMap((p) =>
        p.blankNumber
            ? [new TextRun({ text: `(${p.blankNumber})`, bold: true, underline: {} })]
            : p.text.split('\n').map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : undefined }))
    );
}

function matchingTable(question: TestQuestion): Table {
    const data = matchingBookletData(question);
    const leftCell = new TableCell({
        borders: NO_BORDER,
        width: { size: 50, type: WidthType.PERCENTAGE },
        children: data.left.map((t, i) => new Paragraph({ text: `${i + 1}.  ${t}` })),
    });
    const rightCell = new TableCell({
        borders: NO_BORDER,
        width: { size: 50, type: WidthType.PERCENTAGE },
        children: data.rightOptions.map(
            (o) =>
                new Paragraph({
                    children: [new TextRun({ text: `${o.letter}  `, bold: true }), new TextRun(o.text)],
                })
        ),
    });
    return new Table({
        rows: [new TableRow({ children: [leftCell, rightCell] })],
        width: { size: 100, type: WidthType.PERCENTAGE },
    });
}

function orderingParagraphs(question: TestQuestion): Paragraph[] {
    return orderingBookletItems(question).map(
        (it) =>
            new Paragraph({
                children: [new TextRun({ text: `${it.letter}  `, bold: true }), new TextRun(it.text)],
                indent: { left: 360 },
            })
    );
}

function categorizeParagraphs(question: TestQuestion): Paragraph[] {
    const data = categorizeBookletData(question);
    const items = data.items.map((t, i) => new Paragraph({ text: `${i + 1}.  ${t}`, indent: { left: 360 } }));
    const categoryLine = new Paragraph({
        children: [
            new TextRun({ text: `${tx('categories_label')}: `, bold: true }),
            new TextRun(data.categories.join(' / ')),
        ],
        spacing: { before: 80 },
    });
    return [...items, categoryLine];
}

/** Image MIME types docx can embed directly; anything else (e.g. webp, svg) is skipped rather than crash the export. */
const DOCX_IMAGE_TYPE: Record<string, 'jpg' | 'png' | 'gif' | 'bmp'> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
};

/**
 * Fetches a question's image (data URI or URL) and wraps it as a docx ImageRun, scaled to a
 * consistent max width. Returns null on any failure (unsupported format, network/CORS error) so
 * the export still completes with the rest of the question's text intact — the HTML booklet
 * renders `imageUrl` directly (browsers decode/display it natively), but docx needs the raw bytes,
 * a known MIME type, and explicit pixel dimensions up front.
 */
/** A hung image request would otherwise block buildBookletChildren (and the whole zip) indefinitely. */
const IMAGE_FETCH_TIMEOUT_MS = 8000;

interface FetchedDocxImage {
    type: 'jpg' | 'png' | 'gif' | 'bmp';
    data: ArrayBuffer;
    width: number;
    height: number;
}

async function fetchDocxImage(imageUrl: string, maxWidthPx: number): Promise<FetchedDocxImage | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    try {
        const blob = await fetch(imageUrl, { signal: controller.signal }).then((r) => r.blob());
        const type = DOCX_IMAGE_TYPE[blob.type];
        if (!type) return null;
        const bitmap = await createImageBitmap(blob);
        const scale = Math.min(1, maxWidthPx / bitmap.width);
        return {
            type,
            data: await blob.arrayBuffer(),
            width: Math.round(bitmap.width * scale),
            height: Math.round(bitmap.height * scale),
        };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

const docxImageRun = ({ type, data, width, height }: FetchedDocxImage) =>
    new ImageRun({ type, data, transformation: { width, height } });

async function questionImageRun(imageUrl: string, maxWidthPx = 380): Promise<ImageRun | null> {
    const image = await fetchDocxImage(imageUrl, maxWidthPx);
    return image ? docxImageRun(image) : null;
}

/** Fetches every <img> in a rich-text fragment up front (the converters are synchronous); an image that can't be loaded is simply absent from the map. */
async function loadDocxImages(html: string): Promise<DocxImageMap> {
    const root = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body;
    const sources = new Set(
        Array.from(root.querySelectorAll('img'))
            .map((img) => img.getAttribute('src'))
            .filter((src): src is string => !!src)
    );
    const images = new Map<string, () => ImageRun>();
    await Promise.all(
        Array.from(sources).map(async (src) => {
            const image = await fetchDocxImage(src, 380);
            if (image) images.set(src, () => docxImageRun(image));
        })
    );
    return images;
}

/** Rich-text passage → docx blocks, keeping bold/italic/highlight/lists/tables and images in place. */
export async function richPassageToDocx(html: string, spacingAfter = 120): Promise<(Paragraph | Table)[]> {
    const normalized = promptToHtml(html);
    return htmlToDocxChildren(normalized, spacingAfter, await loadDocxImages(normalized));
}

/** Question prompt → the first paragraph's inline runs (so the point/number label can share its line) plus the remaining blocks. */
export async function richPromptToDocx(
    html: string
): Promise<{ leadRuns: (TextRun | ImageRun)[]; rest: (Paragraph | Table)[] }> {
    const normalized = promptToHtml(html);
    return htmlToDocxLead(normalized, await loadDocxImages(normalized));
}

async function questionParagraphs(
    question: TestQuestion,
    number: number,
    options: TestExamExportOptions
): Promise<(Paragraph | Table)[]> {
    const isCloze = question.type === 'cloze' || question.type === 'cloze-dropdown' || question.type === 'cloze-bank';
    const rich = isCloze ? null : await richPromptToDocx(plainQuestionPromptText(question));
    const promptRuns = rich ? rich.leadRuns : clozeRuns(question);

    const blocks: (Paragraph | Table)[] = [
        new Paragraph({
            children: [
                new TextRun({ text: `${tx('point_label', { count: question.points })}  `, color: '6b7280', size: 18 }),
                new TextRun({ text: `${number}  `, bold: true }),
                ...promptRuns,
            ],
            spacing: { after: 60 },
        }),
        ...(rich?.rest ?? []),
        ...(question.audioUrl ? [audioNoteParagraph()] : []),
    ];

    if (question.imageUrl) {
        const imageRun = await questionImageRun(question.imageUrl);
        if (imageRun) blocks.push(new Paragraph({ children: [imageRun], spacing: { after: 80 } }));
    }

    switch (question.type) {
        case 'multiple-choice':
        case 'multiple-response':
            for (const [i, o] of (question.options ?? []).entries()) {
                blocks.push(
                    new Paragraph({
                        children: [new TextRun({ text: `${optionLetter(i)}  `, bold: true }), new TextRun(o.text)],
                        indent: { left: 360 },
                    })
                );
                const optionImage = o.imageUrl ? await questionImageRun(o.imageUrl, 160) : null;
                if (optionImage) blocks.push(new Paragraph({ children: [optionImage], indent: { left: 360 } }));
            }
            break;
        case 'true-false':
            blocks.push(
                new Paragraph({
                    children: [new TextRun({ text: 'A  ', bold: true }), new TextRun(tx('true'))],
                    indent: { left: 360 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'B  ', bold: true }), new TextRun(tx('false'))],
                    indent: { left: 360 },
                })
            );
            break;
        case 'error-correction':
            blocks.push(
                new Paragraph({
                    children: errorBookletParts(question).map(
                        (p) =>
                            new TextRun({
                                text: p.number ? `[${p.number}] ${p.text}` : p.text,
                                underline: p.number ? {} : undefined,
                            })
                    ),
                    spacing: { after: 60 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: tx('error_correction_instruction'), size: 18, color: '6b7280' })],
                })
            );
            break;
        case 'sentence-builder':
            blocks.push(
                new Paragraph({
                    children: builderBookletTiles(question).map((t) => new TextRun(`${t.text}    `)),
                    indent: { left: 360 },
                })
            );
            break;
        case 'key-word-transformation':
            blocks.push(
                new Paragraph({
                    children: [new TextRun({ text: (question.keyWord ?? '').toUpperCase(), bold: true })],
                    indent: { left: 360 },
                    border: {
                        top: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                        bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                        left: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                        right: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
                    },
                }),
                new Paragraph({ text: question.gappedSentence ?? '', indent: { left: 360 }, spacing: { before: 80 } })
            );
            break;
        case 'cloze-bank':
            blocks.push(
                new Paragraph({
                    children: bankBookletTiles(question).flatMap((t) => [
                        new TextRun({ text: `${t.letter} `, bold: true }),
                        new TextRun(`${t.text}    `),
                    ]),
                    indent: { left: 360 },
                })
            );
            break;
        case 'matrix': {
            const data = matrixBookletData(question);
            blocks.push(
                new Paragraph({
                    children: data.columns.flatMap((c) => [
                        new TextRun({ text: `${c.letter} `, bold: true }),
                        new TextRun(`${c.text}    `),
                    ]),
                    indent: { left: 360 },
                }),
                ...data.rows.map((r, i) => new Paragraph({ text: `${i + 1}.  ${r}`, indent: { left: 360 } }))
            );
            break;
        }
        case 'matching':
            blocks.push(matchingTable(question));
            break;
        case 'ordering':
            blocks.push(...orderingParagraphs(question));
            break;
        case 'categorize':
            blocks.push(...categorizeParagraphs(question));
            break;
        case 'hot-text':
            if (options.hotTextMirror) {
                const runs = hotTextMirrorParts(question).map(
                    (p) =>
                        new TextRun({
                            text: p.number ? `[${p.number}] ${p.text}` : p.text,
                            underline: p.number ? {} : undefined,
                        })
                );
                blocks.push(new Paragraph({ children: runs, spacing: { after: 60 } }));
                blocks.push(
                    new Paragraph({
                        children: [new TextRun({ text: tx('hot_text_instruction'), size: 18, color: '6b7280' })],
                    })
                );
            } else {
                blocks.push(
                    new Paragraph({
                        children: [new TextRun({ text: hotTextFallbackText(question), italics: true })],
                        spacing: { after: 60 },
                    })
                );
            }
            break;
        case 'audio-response':
            blocks.push(
                new Paragraph({
                    children: [
                        new TextRun({ text: tx('recorded_answer_note'), italics: true, size: 18, color: '6b7280' }),
                    ],
                })
            );
            break;
        default:
            // short-answer / open / numeric / (cloze prompt already carries its blanks): no extra booklet content — writing space lives on the answer sheet.
            break;
    }

    return blocks;
}

/** Wraps one question's content in a light bordered card, matching answerSpaceHtml()'s question card in the HTML renderer. */
function questionCard(blocks: (Paragraph | Table)[]): Table {
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        borders: LIGHT_BORDER,
                        margins: { top: 120, bottom: 120, left: 140, right: 140 },
                        children: blocks,
                    }),
                ],
            }),
        ],
    });
}

/** The teacher-written header/intro/footer (rich text); nothing when it is blank, so an untouched field leaves no empty paragraph. */
async function printTextBlocks(html: string | undefined): Promise<(Paragraph | Table)[]> {
    const hasContent = !!html && (html.replace(/<[^>]*>/g, '').trim() !== '' || /<img/i.test(html));
    return hasContent ? richPassageToDocx(html, 120) : [];
}

async function buildBookletChildren(test: Test, options: TestExamExportOptions): Promise<(Paragraph | Table)[]> {
    const children: (Paragraph | Table)[] = [
        ...(await printTextBlocks(test.printHeader)),
        ...coverParagraphs(test, tx('booklet_subtitle'), true),
        ...(await printTextBlocks(test.printIntro)),
    ];
    for (const group of groupQuestionsBySection(test)) {
        if (group.section) {
            children.push(sectionDivider(group.section.title));
            if (group.section.audioUrl) children.push(audioNoteParagraph());
            if (options.attachmentMode === 'inline' && group.section.content) {
                children.push(...(await richPassageToDocx(group.section.content, 120)));
            }
        }
        for (const { question, number } of group.questions) {
            children.push(questionCard(await questionParagraphs(question, number, options)));
            children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
        }
    }
    children.push(...(await printTextBlocks(test.printFooter)));
    return children;
}

async function buildAttachmentChildren(test: Test): Promise<(Paragraph | Table)[]> {
    const children: (Paragraph | Table)[] = [...coverParagraphs(test, tx('attachment_subtitle'), true)];
    const groups = groupQuestionsBySection(test).filter((g) => g.section?.content);
    for (const [i, group] of groups.entries()) {
        if (!group.section?.content) continue;
        if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
        children.push(sectionDivider(group.section.title));
        children.push(...(await richPassageToDocx(group.section.content, 200)));
    }
    return children;
}

/**
 * Compact bordered box row — one cell per option letter — approximating the HTML rendering's
 * empty bubbles (docx has no true circle primitive). Cells use a fixed DXA (absolute twips)
 * width and are separated by an unbordered CHOICE_CELL_GAP_MM spacer cell, so every
 * MC/true-false/multiple-response question's bubble sits at the same width/pitch as the HTML
 * renderer and examScanRegions.ts's choiceCellRects() — a scanning pipeline can then assume one
 * constant cell geometry across the whole answer sheet instead of recomputing it per question.
 */
function choiceAnswerTable(letters: string[]): Table {
    const cellWidthTwips = Math.round(CHOICE_CELL_WIDTH_MM * MM_TO_TWIPS);
    const gapWidthTwips = Math.round(CHOICE_CELL_GAP_MM * MM_TO_TWIPS);
    const cells = letters.map(
        (l) =>
            new TableCell({
                borders: CELL_BORDER,
                width: { size: cellWidthTwips, type: WidthType.DXA },
                children: [
                    new Paragraph({
                        alignment: 'center',
                        children: [new TextRun({ text: l, bold: true })],
                    }),
                ],
            })
    );
    const spacer = () =>
        new TableCell({ borders: NO_BORDER, width: { size: gapWidthTwips, type: WidthType.DXA }, children: [] });
    const children = cells.flatMap((cell, i) => (i === 0 ? [cell] : [spacer(), cell]));
    return new Table({
        rows: [new TableRow({ children })],
        width: {
            size: cellWidthTwips * letters.length + gapWidthTwips * Math.max(0, letters.length - 1),
            type: WidthType.DXA,
        },
    });
}

/**
 * Ruled writing box for a 'long' open-answer question: a bordered table with one thin row per
 * ANSWER_LINE_SPACING_MM, each carrying a bottom rule, so handwriting stays on straight lines
 * instead of drifting — easier for a teacher to read and far more reliable for OCR than a single
 * blank cell.
 */
function longAnswerTable(): Table {
    const rowCount = Math.max(1, Math.round(LONG_ANSWER_HEIGHT_MM / ANSWER_LINE_SPACING_MM));
    const rowHeightTwips = Math.round(ANSWER_LINE_SPACING_MM * MM_TO_TWIPS);
    const rows = Array.from({ length: rowCount }, (_, i) => {
        const isFirst = i === 0;
        const isLast = i === rowCount - 1;
        return new TableRow({
            height: { value: rowHeightTwips, rule: HeightRule.EXACT },
            children: [
                new TableCell({
                    borders: {
                        top: isFirst ? CELL_BORDER.top : { style: BorderStyle.NONE },
                        bottom: isLast ? CELL_BORDER.bottom : { style: BorderStyle.SINGLE, size: 2, color: 'd1d5db' },
                        left: CELL_BORDER.left,
                        right: CELL_BORDER.right,
                    },
                    children: [new Paragraph({ text: '' })],
                }),
            ],
        });
    });
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function numericAnswerTable(): Table {
    return new Table({
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        borders: CELL_BORDER,
                        width: { size: 30, type: WidthType.PERCENTAGE },
                        children: [new Paragraph({ text: '' })],
                    }),
                ],
            }),
        ],
        width: { size: 30, type: WidthType.PERCENTAGE },
    });
}

/**
 * N independent ruled lines as one table (optionally numbered in a leading column). A table, not
 * consecutive bordered Paragraphs: Word/LibreOffice silently merges adjacent paragraphs that carry
 * the same border into a single rule under the LAST one, so two "two-line" or N-line answer spaces
 * built from Paragraph borders render as just one visible line — a table's per-row borders don't
 * merge that way, so every line actually shows.
 */
function ruledLinesTable(n: number, numbered: boolean): Table {
    const rows = Array.from({ length: n }, (_, i) => {
        const lineCell = new TableCell({
            borders: { ...NO_BORDER, bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' } },
            width: { size: numbered ? 92 : 100, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ text: '' })],
        });
        if (!numbered) return new TableRow({ children: [lineCell] });
        const numberCell = new TableCell({
            borders: NO_BORDER,
            width: { size: 8, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: String(i + 1), color: '6b7280', size: 18 })] })],
        });
        return new TableRow({ children: [numberCell, lineCell] });
    });
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

/** Renders one question's answer space per its AnswerSpaceSpec, mirroring answerSpaceHtml() in testExamExportHtml.ts. */
function answerSpaceChildren(space: AnswerSpaceSpec): (Paragraph | Table)[] {
    switch (space.kind) {
        case 'choice':
            return [choiceAnswerTable(space.optionLetters ?? [])];
        case 'short':
            return [ruledLinesTable(2, false)];
        case 'long':
            return [longAnswerTable()];
        case 'numeric':
            return [numericAnswerTable()];
        case 'subitems':
            return [ruledLinesTable(space.subItemCount ?? 1, true)];
        case 'none':
        default:
            return [
                new Paragraph({
                    children: [
                        new TextRun({ text: tx('recorded_answer_note'), italics: true, size: 18, color: '6b7280' }),
                    ],
                }),
            ];
    }
}

function answerSheetChildren(test: Test, student?: Student): (Paragraph | Table)[] {
    const blocks = answerSheetGeometry(test).flatMap((block) => [
        new Paragraph({
            children: [new TextRun({ text: String(block.number), bold: true })],
            spacing: { before: 160 },
        }),
        ...answerSpaceChildren(block.space),
        // Hairline divider between answer blocks, matching answerBlockHtml()'s border-bottom in the HTML renderer.
        new Paragraph({
            text: '',
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'e5e7eb' } },
            spacing: { before: 80 },
        }),
    ]);

    return [
        new Paragraph({ text: tx('answer_sheet_title'), heading: HeadingLevel.HEADING_1, alignment: 'right' }),
        blackBannerTable(test.name),
        new Paragraph({
            children: [
                new TextRun({ text: `${tx('candidate_name')}: `, bold: true }),
                new TextRun(student?.name ?? ''),
            ],
            spacing: { before: 200, after: 200 },
        }),
        ...blocks,
    ];
}

function gradingTableRows(test: Test): TableRow[] {
    const groups = groupQuestionsBySection(test);
    const rows: TableRow[] = [];
    let rowIndex = 0;
    const cell = (children: Paragraph[], size: number, shaded: boolean) =>
        new TableCell({
            borders: CELL_BORDER,
            width: { size, type: WidthType.PERCENTAGE },
            // Zebra striping (a light, print-safe gray) so a long key stays easy to track row by row.
            ...(shaded ? { shading: { fill: 'F8FAFC' } } : {}),
            children,
        });

    for (const group of groups) {
        if (group.section) {
            rows.push(
                new TableRow({
                    children: [
                        new TableCell({
                            columnSpan: 3,
                            borders: { ...NO_BORDER, bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
                            children: [
                                new Paragraph({
                                    children: [new TextRun({ text: group.section.title, bold: true })],
                                    spacing: { before: 200 },
                                }),
                            ],
                        }),
                    ],
                })
            );
        }
        for (const { question, number } of group.questions) {
            const ladder = partialCreditLadder(question);
            const correct = answerKeyText(question);
            const questionPara = [
                new Paragraph({ children: [new TextRun({ text: String(number), bold: true })] }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: tx('max_score_short', { points: question.points }),
                            size: 16,
                            color: '6b7280',
                        }),
                    ],
                }),
            ];
            const answerPara = [
                new Paragraph({
                    children: [new TextRun({ text: correct || tx('open_answer'), italics: !correct })],
                }),
            ];
            // Built with alignment set at construction time — Paragraph is a class instance, so
            // spreading it (`{...p, alignment}`) does NOT copy its content, only its own enumerable
            // fields, silently producing an empty paragraph. That bug previously left this column blank.
            const scoresPara = ladder
                ? ladder.map(
                      (r) =>
                          new Paragraph({
                              alignment: 'right',
                              children: [
                                  new TextRun({
                                      text: `${tx('if_n_correct', { n: r.correct })}: ${r.points}`,
                                      size: 18,
                                  }),
                              ],
                          })
                  )
                : [new Paragraph({ alignment: 'right', children: [new TextRun({ text: String(question.points) })] })];

            const shaded = rowIndex % 2 === 1;
            rowIndex++;
            rows.push(
                new TableRow({
                    children: [
                        cell(questionPara, 15, shaded),
                        cell(answerPara, 55, shaded),
                        cell(scoresPara, 30, shaded),
                    ],
                })
            );
        }
    }
    return rows;
}

function buildGradingSheetChildren(test: Test): (Paragraph | Table)[] {
    const headerRow = new TableRow({
        children: [
            new TableCell({
                borders: CELL_BORDER,
                width: { size: 15, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ children: [new TextRun({ text: tx('question_col'), bold: true })] })],
            }),
            new TableCell({
                borders: CELL_BORDER,
                width: { size: 55, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ children: [new TextRun({ text: tx('answer_col'), bold: true })] })],
            }),
            new TableCell({
                borders: CELL_BORDER,
                width: { size: 30, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ children: [new TextRun({ text: tx('scores_col'), bold: true })] })],
            }),
        ],
    });
    const table = new Table({
        rows: [headerRow, ...gradingTableRows(test)],
        width: { size: 100, type: WidthType.PERCENTAGE },
    });
    return [...coverParagraphs(test, tx('grading_sheet_subtitle')), table];
}

async function buildDocxBlob(children: (Paragraph | Table)[], options: TestExamExportOptions): Promise<Blob> {
    const doc = new Document({
        styles: buildDocxStyles(options.fontFamily, options.styleTemplate),
        sections: [{ children }],
    });
    return Packer.toBlob(doc);
}

interface ExportExamDocxOptions extends TestExamExportOptions {
    students?: Student[];
}

/**
 * Exports the booklet, (optionally) attachment, one answer-sheet doc (one page per student), and
 * the grading sheet as a single .zip of .docx files. Bundling into one zip — rather than several
 * sequential saveAs() calls — avoids Chrome's "wants to download multiple files" block, which
 * silently drops every download after the first when a page triggers more than one without an
 * intervening user gesture.
 */
/**
 * Exports the booklet, (optionally) attachment, and one answer-sheet doc (one page per student) —
 * the documents meant to reach students — bundled into a single .zip when there's more than one
 * file (see the module doc comment on why sequential downloads get silently dropped otherwise).
 * Deliberately excludes the grading sheet: bundling the answer key alongside student-facing
 * materials risks disclosing it if the whole archive is shared or handed out as a unit. Export the
 * grading key separately via exportExamGradingKeyDocx().
 */
export async function exportExamDocx(test: Test, options: ExportExamDocxOptions): Promise<void> {
    const base = sanitizeFilename(test.name);
    const files: { name: string; blob: Blob }[] = [
        {
            name: `${base}-booklet.docx`,
            blob: await buildDocxBlob(await buildBookletChildren(test, options), options),
        },
    ];
    if (options.attachmentMode === 'separate') {
        files.push({
            name: `${base}-attachment.docx`,
            blob: await buildDocxBlob(await buildAttachmentChildren(test), options),
        });
    }
    const students = options.students ?? [];
    const answerChildren: (Paragraph | Table)[] =
        students.length > 0
            ? students.flatMap((s, i) => [
                  ...(i > 0 ? [new Paragraph({ children: [new PageBreak()] })] : []),
                  ...answerSheetChildren(test, s),
              ])
            : answerSheetChildren(test);
    files.push({ name: `${base}-answer-sheet.docx`, blob: await buildDocxBlob(answerChildren, options) });

    if (files.length === 1) {
        saveAs(files[0].blob, files[0].name);
        return;
    }
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const file of files) zip.file(file.name, file.blob);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `${base}-exam.zip`);
}

/** Exports only the grading key — kept as an explicit, separate action from exportExamDocx() so a teacher never bundles it with student-facing materials by default. */
export async function exportExamGradingKeyDocx(test: Test, options: TestExamExportOptions): Promise<void> {
    const blob = await buildDocxBlob(buildGradingSheetChildren(test), options);
    saveAs(blob, `${sanitizeFilename(test.name)}-grading-sheet.docx`);
}
