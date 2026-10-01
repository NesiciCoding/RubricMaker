/** CITO-style exam document rendering (HTML -> browser print-to-PDF), mirroring pdfExport.ts's pattern. */
import i18n from 'i18next';
import DOMPurify from 'dompurify';
import QRCode from 'qrcode';
import type { Student, Test, TestQuestion } from '../types';
import { PRINT_MARGIN_MM, printHtml, withoutBrowserPrintChrome } from './pdfExport';
import { escapeHtml, promptToHtml, sanitizeFilename } from './exportDataPrep';
import { plainQuestionPromptText } from './clozeParse';
import { calcTestMaxPoints } from './testCalc';
import {
    ANSWER_LINE_SPACING_MM,
    CHOICE_CELL_GAP_MM,
    CHOICE_CELL_WIDTH_MM,
    LONG_ANSWER_HEIGHT_MM,
    answerKeyText,
    answerSheetGeometry,
    answerSheetQrPayload,
    categorizeBookletData,
    bankBookletTiles,
    clozeBookletParts,
    EXAM_PAGE_MM,
    fiducialMarkers,
    groupQuestionsBySection,
    hotTextFallbackText,
    hotTextMirrorParts,
    matchingBookletData,
    matrixBookletData,
    optionLetter,
    orderingBookletItems,
    partialCreditLadder,
    type AnswerSpaceSpec,
    type TestExamExportOptions,
} from './testExamContent';

const tx = (key: string, opts?: Record<string, unknown>) => i18n.t(`tests.export.exam.${key}`, opts);

function clozeBookletHtml(question: TestQuestion): string {
    return clozeBookletParts(question)
        .map((p) =>
            p.blankNumber
                ? `<span style="display:inline-block;border-bottom:1px solid #000;min-width:50px;text-align:center;padding:0 4px">(${p.blankNumber})</span>`
                : escapeHtml(p.text)
        )
        .join('');
}

function matchingBookletHtml(question: TestQuestion): string {
    const data = matchingBookletData(question);
    const left = data.left.map((t, i) => `<div style="margin:2px 0">${i + 1}. ${escapeHtml(t)}</div>`).join('');
    const right = data.rightOptions
        .map((o) => `<div style="margin:2px 0"><strong>${o.letter}</strong>&nbsp;&nbsp;${escapeHtml(o.text)}</div>`)
        .join('');
    return `<div style="margin-top:6px;display:flex;gap:24px">
    <div style="flex:1">${left}</div>
    <div style="flex:1">${right}</div>
  </div>`;
}

function orderingBookletHtml(question: TestQuestion): string {
    const items = orderingBookletItems(question);
    return `<div style="margin-top:6px">${items
        .map((it) => `<div style="margin:2px 0"><strong>${it.letter}</strong>&nbsp;&nbsp;${escapeHtml(it.text)}</div>`)
        .join('')}</div>`;
}

function categorizeBookletHtml(question: TestQuestion): string {
    const data = categorizeBookletData(question);
    const items = data.items.map((t, i) => `<div style="margin:2px 0">${i + 1}. ${escapeHtml(t)}</div>`).join('');
    const categories = data.categories.map((c) => escapeHtml(c)).join(' / ');
    return `<div style="margin-top:6px">${items}</div>
  <div style="margin-top:4px;font-size:11px;color:#6b7280">${tx('categories_label')}: ${categories}</div>`;
}

const RICH_CONTENT_CSS =
    '<style>.exam-rich p{margin:0 0 4px}.exam-rich p:empty{min-height:1em}.exam-rich mark{-webkit-print-color-adjust:exact;print-color-adjust:exact}.exam-rich ul,.exam-rich ol{margin:2px 0;padding-left:20px}.exam-rich img{max-width:100%;height:auto;max-height:220px}</style>';

function richPromptHtml(question: TestQuestion): string {
    return `${RICH_CONTENT_CSS}<div class="exam-rich">${DOMPurify.sanitize(promptToHtml(plainQuestionPromptText(question)))}</div>`;
}

function questionBodyHtml(question: TestQuestion, number: number, options: TestExamExportOptions): string {
    const isCloze = question.type === 'cloze' || question.type === 'cloze-dropdown' || question.type === 'cloze-bank';
    const prompt = isCloze
        ? `<div style="line-height:1.8;white-space:pre-line">${clozeBookletHtml(question)}</div>`
        : richPromptHtml(question);
    let extra = '';

    if (question.audioUrl) extra += audioNoteHtml();
    if (question.imageUrl) {
        extra += `<div style="margin:8px 0"><img src="${escapeHtml(question.imageUrl)}" style="max-width:100%;max-height:220px" /></div>`;
    }

    switch (question.type) {
        case 'multiple-choice':
        case 'multiple-response':
            extra += `<div style="margin-top:6px">${(question.options ?? [])
                .map(
                    (o, i) =>
                        `<div style="margin:3px 0"><strong>${optionLetter(i)}</strong>&nbsp;&nbsp;${escapeHtml(o.text)}${
                            o.imageUrl
                                ? `<div style="margin:4px 0 4px 22px"><img src="${escapeHtml(o.imageUrl)}" style="max-width:100%;max-height:120px" /></div>`
                                : ''
                        }</div>`
                )
                .join('')}</div>`;
            break;
        case 'true-false':
            extra += `<div style="margin-top:6px"><div><strong>A</strong>&nbsp;&nbsp;${tx('true')}</div><div><strong>B</strong>&nbsp;&nbsp;${tx('false')}</div></div>`;
            break;
        case 'key-word-transformation':
            extra += `<div style="margin-top:6px"><span style="display:inline-block;padding:2px 12px;border:2px solid #000;font-weight:700;text-transform:uppercase">${escapeHtml(question.keyWord ?? '')}</span><div style="margin-top:6px">${escapeHtml(question.gappedSentence ?? '')}</div></div>`;
            break;
        case 'cloze-bank':
            extra += `<div style="margin-top:6px;padding:6px 10px;border:1px dashed #94a3b8">${bankBookletTiles(
                question
            )
                .map(
                    (t) =>
                        `<span style="display:inline-block;margin:2px 10px 2px 0"><strong>${t.letter}</strong>&nbsp;${escapeHtml(t.text)}</span>`
                )
                .join('')}</div>`;
            break;
        case 'matrix': {
            const data = matrixBookletData(question);
            extra += `<div style="margin-top:6px"><div style="font-size:11px;color:#6b7280">${data.columns
                .map((c) => `<strong>${c.letter}</strong>&nbsp;${escapeHtml(c.text)}`)
                .join(' &nbsp;·&nbsp; ')}</div>${data.rows
                .map((r, i) => `<div style="margin:2px 0">${i + 1}. ${escapeHtml(r)}</div>`)
                .join('')}</div>`;
            break;
        }
        case 'matching':
            extra += matchingBookletHtml(question);
            break;
        case 'ordering':
            extra += orderingBookletHtml(question);
            break;
        case 'categorize':
            extra += categorizeBookletHtml(question);
            break;
        case 'hot-text':
            if (options.hotTextMirror) {
                const marked = hotTextMirrorParts(question)
                    .map((p) =>
                        p.number
                            ? `<span style="text-decoration:underline">[${p.number}] ${escapeHtml(p.text)}</span>`
                            : escapeHtml(p.text)
                    )
                    .join('');
                extra += `<div style="margin-top:6px;padding:8px;background:#f8fafc;border-left:3px solid #94a3b8">${marked}</div>`;
                extra += `<div style="margin-top:4px;font-size:11px;color:#6b7280">${tx('hot_text_instruction')}</div>`;
            } else {
                extra += `<blockquote style="margin:6px 0;padding:8px 12px;background:#f8fafc;border-left:3px solid #94a3b8;font-style:italic">${escapeHtml(hotTextFallbackText(question))}</blockquote>`;
            }
            break;
        case 'audio-response':
            extra += `<div style="margin-top:4px;font-size:11px;color:#6b7280;font-style:italic">${tx('recorded_answer_note')}</div>`;
            break;
        default:
            // short-answer / open / numeric / cloze-dropdown: the prompt (or, for cloze-dropdown, the blanked prompt) is self-sufficient — writing space lives on the answer sheet, not the booklet.
            break;
    }

    return `<div style="margin-bottom:10px;padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;page-break-inside:avoid">
    <div style="display:flex;gap:8px">
      <div style="width:40px;flex-shrink:0;font-size:10px;color:#6b7280;padding-top:2px">${tx('point_label', { count: question.points })}</div>
      <div style="width:20px;flex-shrink:0;font-weight:700;font-size:12px">${number}</div>
      <div style="flex:1">${prompt}${extra}</div>
    </div>
  </div>`;
}

function blackBannerHtml(text: string): string {
    return `<div style="background:#000;color:#fff;font-weight:700;font-size:13px;padding:8px 14px;text-align:right;margin:28px 0 0">${escapeHtml(text)}</div>`;
}

/** Bordered Name / Class / Date fill-in box for a booklet/attachment cover, so a page can still be attributed to a student if it's separated from the answer sheet. */
function nameClassDateBoxHtml(): string {
    const field = (label: string, borderRight: boolean) =>
        `<div style="flex:1;padding:8px 12px;${borderRight ? 'border-right:1px solid #d1d5db' : ''}">
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em">${escapeHtml(label)}</div>
      <div style="height:18px;border-bottom:1px solid #000;margin-top:2px"></div>
    </div>`;
    return `<div style="margin-top:24px;display:flex;border:1px solid #d1d5db;border-radius:4px">
    ${field(tx('candidate_name'), true)}
    ${field(tx('cover_class_label'), true)}
    ${field(tx('cover_date_label'), false)}
  </div>`;
}

/** Right-aligned title block + black subject banner + question/point/duration summary — the CITO cover-page pattern. */
function coverPageHtml(test: Test, docLabel: string, includeNameBox = false): string {
    const totalQuestions = test.questions.length;
    const totalPoints = calcTestMaxPoints(test);
    return `<div class="print-page" style="page-break-after:always;padding-top:36px;font-family:inherit;color:#1e293b;background:#fff">
    <div style="text-align:right">
      <div style="font-weight:700;font-size:16px">${escapeHtml(docLabel)}</div>
      <div style="font-weight:800;font-size:34px;margin-top:2px">${new Date().getFullYear()}</div>
    </div>
    ${blackBannerHtml(test.name)}
    ${includeNameBox ? nameClassDateBoxHtml() : ''}
    <div style="margin-top:${includeNameBox ? 32 : 120}px;font-size:12px;line-height:1.8">
      ${totalQuestions > 0 ? `<p style="margin:0 0 4px">${tx('question_count_line', { count: totalQuestions })}</p>` : ''}
      ${totalPoints > 0 ? `<p style="margin:0 0 4px">${tx('points_count_line', { points: totalPoints })}</p>` : ''}
      ${test.durationMinutes ? `<p style="margin:0 0 4px">${tx('duration_line', { minutes: test.durationMinutes })}</p>` : ''}
    </div>
  </div>`;
}

function audioNoteHtml(): string {
    return `<div style="margin-top:4px;font-size:11px;color:#6b7280;font-style:italic">${tx('audio_note')}</div>`;
}

function passageHtml(content: string, extraStyle: string): string {
    return `${RICH_CONTENT_CSS}<div class="exam-rich" style="${extraStyle};font-size:13px">${DOMPurify.sanitize(content)}</div>`;
}

function sectionDividerHtml(title: string): string {
    return `<div style="margin:18px 0 12px;page-break-inside:avoid">
    <div style="font-weight:700;font-size:14px;margin-bottom:4px">${escapeHtml(title)}</div>
    <div style="height:3px;background:#9ca3af"></div>
  </div>`;
}

export function buildExamBookletHtml(test: Test, options: TestExamExportOptions): string {
    const groups = groupQuestionsBySection(test);
    let html = coverPageHtml(test, tx('booklet_subtitle'), true);
    for (const group of groups) {
        if (group.section) {
            html += sectionDividerHtml(group.section.title);
            if (group.section.audioUrl) html += `<div style="margin-bottom:8px">${audioNoteHtml()}</div>`;
            if (options.attachmentMode === 'inline' && group.section.content) {
                html += passageHtml(group.section.content, 'margin-bottom:10px');
            }
        }
        html += group.questions.map(({ question, number }) => questionBodyHtml(question, number, options)).join('');
    }
    return `<div class="print-page" style="color:#1e293b;background:#fff">${html}</div>`;
}

export function buildExamAttachmentHtml(test: Test): string {
    const groups = groupQuestionsBySection(test).filter((g) => g.section?.content);
    let html = coverPageHtml(test, tx('attachment_subtitle'), true);
    groups.forEach((group, i) => {
        if (!group.section) return;
        const pageBreak = i > 0 ? 'page-break-before:always;' : '';
        html += `<div style="${pageBreak}page-break-inside:avoid">${sectionDividerHtml(group.section.title)}</div>`;
        html += passageHtml(group.section.content ?? '', 'margin-bottom:14px');
    });
    return `<div class="print-page" style="color:#1e293b;background:#fff">${html}</div>`;
}

/** Fiducials + QR for one answer sheet, as offsets inside withoutBrowserPrintChrome()'s repeated header (page coordinates minus the side margin), so they print on every page of that sheet. */
async function scanMarkerHtml(test: Test, studentId?: string): Promise<string> {
    const dataUrl = await QRCode.toDataURL(answerSheetQrPayload(test.id, studentId), {
        width: 96,
        margin: 0,
    });
    const markers = fiducialMarkers()
        .map(
            (m) =>
                `<div style="position:absolute;left:${m.x - PRINT_MARGIN_MM}mm;top:${m.y}mm;width:${m.size}mm;height:${m.size}mm;background:#000"></div>`
        )
        .join('');
    const qrSize = 18;
    const qrInset = 6;
    return `${markers}<img src="${dataUrl}" style="position:absolute;left:${EXAM_PAGE_MM.width - qrInset - qrSize - PRINT_MARGIN_MM}mm;top:${EXAM_PAGE_MM.height - qrInset - qrSize}mm;width:${qrSize}mm;height:${qrSize}mm" />`;
}

/** Renders one question's answer space per its AnswerSpaceSpec — empty bubbles, ruled lines, a half-page box, or numbered sub-lines. */
function answerSpaceHtml(space: AnswerSpaceSpec): string {
    switch (space.kind) {
        case 'choice': {
            const shape = space.multiSelect ? '3px' : '50%';
            // Bubble width and gap share CHOICE_CELL_WIDTH_MM/CHOICE_CELL_GAP_MM with the DOCX
            // renderer and examScanRegions.ts's choiceCellRects(), so a scanned sheet's bubble
            // positions match what was actually printed.
            return `<div style="display:flex;gap:${CHOICE_CELL_GAP_MM}mm;margin-top:4px;flex-wrap:wrap">${(
                space.optionLetters ?? []
            )
                .map(
                    (l) =>
                        `<div style="box-sizing:border-box;width:${CHOICE_CELL_WIDTH_MM}mm;height:${CHOICE_CELL_WIDTH_MM}mm;border:1.5px solid #000;border-radius:${shape};display:flex;align-items:center;justify-content:center;font-size:11px">${l}</div>`
                )
                .join('')}</div>`;
        }
        case 'short':
            return `<div style="margin-top:4px">
        <div style="border-bottom:1px solid #000;height:20px"></div>
        <div style="border-bottom:1px solid #000;height:20px;margin-top:4px"></div>
      </div>`;
        case 'long':
            return `<div style="margin-top:6px;border:1px solid #000;height:${LONG_ANSWER_HEIGHT_MM}mm;width:100%;background-image:repeating-linear-gradient(to bottom, transparent, transparent ${ANSWER_LINE_SPACING_MM}mm, #9ca3af ${ANSWER_LINE_SPACING_MM}mm, #9ca3af calc(${ANSWER_LINE_SPACING_MM}mm + 0.4px))"></div>`;
        case 'numeric':
            return `<div style="margin-top:4px;border-bottom:1px solid #000;width:70px;height:20px"></div>`;
        case 'subitems': {
            const n = space.subItemCount ?? 1;
            return `<div style="margin-top:4px">${Array.from({ length: n }, (_, i) => i + 1)
                .map(
                    (i) =>
                        `<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:3px">
            <span style="width:16px;font-size:11px;color:#6b7280">${i}</span>
            <span style="flex:1;border-bottom:1px solid #000;height:16px"></span>
          </div>`
                )
                .join('')}</div>`;
        }
        case 'none':
        default:
            return `<div style="margin-top:4px;font-size:11px;color:#6b7280;font-style:italic">${tx('recorded_answer_note')}</div>`;
    }
}

function answerBlockHtml(block: ReturnType<typeof answerSheetGeometry>[number]): string {
    return `<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #e5e7eb;page-break-inside:avoid">
    <div style="font-weight:700;font-size:12px">${block.number}</div>
    ${answerSpaceHtml(block.space)}
  </div>`;
}

async function answerSheetPageHtml(test: Test, options: TestExamExportOptions, student?: Student): Promise<string> {
    const blocks = answerSheetGeometry(test).map(answerBlockHtml).join('');

    return `<div class="print-page" style="padding-top:24px;color:#1e293b;background:#fff">
    <div style="text-align:right;font-weight:700;font-size:16px">${tx('answer_sheet_title')}</div>
    ${blackBannerHtml(test.name)}
    <div style="margin-top:16px;font-size:13px">
      <strong>${tx('candidate_name')}:</strong> ${student ? escapeHtml(student.name) : '______________________'}
    </div>
    <div style="margin-top:16px">${blocks}</div>
  </div>`;
}

/** One margin-wrapped table per student (or a single blank sheet), so each sheet's scan markers repeat on all of its own pages and the next sheet starts on a fresh page. */
export async function buildAnswerSheetHtml(
    test: Test,
    options: TestExamExportOptions,
    students: Student[] = []
): Promise<string> {
    const sheets: (Student | undefined)[] = students.length > 0 ? students : [undefined];
    const pages = await Promise.all(
        sheets.map(async (student, i) =>
            withoutBrowserPrintChrome(await answerSheetPageHtml(test, options, student), {
                headerExtra: options.scanMarkers ? await scanMarkerHtml(test, student?.id) : '',
                breakAfter: i < sheets.length - 1,
            })
        )
    );
    return pages.join('');
}

function gradingTableRowsHtml(test: Test): string {
    const groups = groupQuestionsBySection(test);
    const td = (content: string, extra = '') =>
        `<td style="border:1px solid #000;padding:6px 8px;font-size:12px;vertical-align:top;${extra}">${content}</td>`;

    let rows = '';
    let rowIndex = 0;
    for (const group of groups) {
        if (group.section) {
            rows += `<tr><td colspan="3" style="padding:12px 4px 4px;font-weight:700;font-size:13px;border-bottom:2px solid #000">${escapeHtml(group.section.title)}</td></tr>`;
        }
        for (const { question, number } of group.questions) {
            const ladder = partialCreditLadder(question);
            const correct = answerKeyText(question);
            const answerCell = correct
                ? escapeHtml(correct)
                : `<span style="color:#94a3b8">${tx('open_answer')}</span>`;
            const scoresCell = ladder
                ? ladder.map((r) => `${tx('if_n_correct', { n: r.correct })}: ${r.points}`).join('<br/>')
                : String(question.points);
            // Zebra striping (a light, print-safe gray) so a long key stays easy to track row by row.
            const rowBg = rowIndex % 2 === 1 ? 'background:#f8fafc;' : '';
            rowIndex++;
            rows += `<tr style="${rowBg}">${td(`${number}<br/><span style="font-size:10px;color:#6b7280">${tx('max_score_short', { points: question.points })}</span>`)}${td(answerCell)}${td(scoresCell, 'text-align:right;white-space:nowrap')}</tr>`;
        }
    }
    return rows;
}

export function buildGradingSheetHtml(test: Test): string {
    const th = (label: string) =>
        `<th style="border:1px solid #000;padding:6px 8px;font-size:11px;text-align:left">${label}</th>`;
    const table = `<table style="border-collapse:collapse;width:100%;margin-top:16px"><tr>${th(tx('question_col'))}${th(tx('answer_col'))}${th(tx('scores_col'))}</tr>${gradingTableRowsHtml(test)}</table>`;

    let html = coverPageHtml(test, tx('grading_sheet_subtitle'));
    html += table;
    return `<div class="print-page" style="color:#1e293b;background:#fff">${html}</div>`;
}

interface ExportExamPdfOptions extends TestExamExportOptions {
    students?: Student[];
}

/**
 * Exports the booklet, (optionally) attachment, and answer sheet(s) — the documents meant to reach
 * students — as separate print-to-PDF flows. Deliberately excludes the grading sheet: bundling the
 * answer key alongside student-facing materials risks disclosing it if the whole set is shared or
 * handed out as a unit. Export the grading key separately via exportExamGradingKeyPdf().
 */
export async function exportExamPdf(test: Test, options: ExportExamPdfOptions): Promise<void> {
    const orientation = 'portrait';
    const print = (html: string) =>
        printHtml(html, orientation, options.fontFamily, options.styleTemplate, {
            hideBrowserChrome: true,
            waitForPrintDialog: true,
        });
    await print(withoutBrowserPrintChrome(buildExamBookletHtml(test, options)));
    if (options.attachmentMode === 'separate') {
        await print(withoutBrowserPrintChrome(buildExamAttachmentHtml(test)));
    }
    await print(await buildAnswerSheetHtml(test, options, options.students));
}

/** Exports only the grading key/answer sheet — kept as an explicit, separate action from exportExamPdf() so a teacher never bundles it with student-facing materials by default. */
export async function exportExamGradingKeyPdf(test: Test, options: TestExamExportOptions): Promise<void> {
    await printHtml(
        withoutBrowserPrintChrome(buildGradingSheetHtml(test)),
        'portrait',
        options.fontFamily,
        options.styleTemplate,
        {
            hideBrowserChrome: true,
        }
    );
}

export function examExportFilename(test: Test, doc: 'booklet' | 'attachment' | 'answer-sheet' | 'grading-sheet') {
    return `${sanitizeFilename(test.name)}-${doc}`;
}
