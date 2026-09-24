/** CITO-style exam document rendering (HTML -> browser print-to-PDF), mirroring pdfExport.ts's pattern. */
import i18n from 'i18next';
import DOMPurify from 'dompurify';
import QRCode from 'qrcode';
import type { Student, Test, TestQuestion } from '../types';
import { printHtml } from './pdfExport';
import { escapeHtml, sanitizeFilename, stripHtmlTags } from './exportDataPrep';
import { plainQuestionPromptText } from './clozeParse';
import { calcTestMaxPoints } from './testCalc';
import {
    ANSWER_LINE_SPACING_MM,
    LONG_ANSWER_HEIGHT_MM,
    answerKeyText,
    answerSheetGeometry,
    answerSheetQrPayload,
    categorizeBookletData,
    clozeBookletParts,
    fiducialMarkers,
    groupQuestionsBySection,
    hotTextFallbackText,
    hotTextMirrorParts,
    matchingBookletData,
    optionLetter,
    orderingBookletItems,
    partialCreditLadder,
    pointLabel,
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

function questionBodyHtml(question: TestQuestion, number: number, options: TestExamExportOptions): string {
    const isCloze = question.type === 'cloze' || question.type === 'cloze-dropdown';
    const prompt = isCloze
        ? `<div style="line-height:1.8">${clozeBookletHtml(question)}</div>`
        : escapeHtml(stripHtmlTags(plainQuestionPromptText(question)));
    let extra = '';

    if (question.imageUrl) {
        extra += `<div style="margin:8px 0"><img src="${escapeHtml(question.imageUrl)}" style="max-width:100%;max-height:220px" /></div>`;
    }

    switch (question.type) {
        case 'multiple-choice':
        case 'multiple-response':
            extra += `<div style="margin-top:6px">${(question.options ?? [])
                .map(
                    (o, i) =>
                        `<div style="margin:3px 0"><strong>${optionLetter(i)}</strong>&nbsp;&nbsp;${escapeHtml(o.text)}</div>`
                )
                .join('')}</div>`;
            break;
        case 'true-false':
            extra += `<div style="margin-top:6px"><div><strong>A</strong>&nbsp;&nbsp;${tx('true')}</div><div><strong>B</strong>&nbsp;&nbsp;${tx('false')}</div></div>`;
            break;
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

    return `<div style="margin-bottom:16px;page-break-inside:avoid">
    <div style="display:flex;gap:8px">
      <div style="width:26px;flex-shrink:0;font-size:10px;color:#6b7280;padding-top:2px">${pointLabel(question.points)}</div>
      <div style="width:20px;flex-shrink:0;font-weight:700;font-size:12px">${number}</div>
      <div style="flex:1">${prompt}${extra}</div>
    </div>
  </div>`;
}

function blackBannerHtml(text: string): string {
    return `<div style="background:#000;color:#fff;font-weight:700;font-size:13px;padding:8px 14px;text-align:right;margin:28px 0 0">${escapeHtml(text)}</div>`;
}

/** Right-aligned title block + black subject banner + question/point/duration summary — the CITO cover-page pattern. */
function coverPageHtml(test: Test, docLabel: string): string {
    const totalQuestions = test.questions.length;
    const totalPoints = calcTestMaxPoints(test);
    return `<div class="print-page" style="page-break-after:always;padding-top:36px;font-family:inherit">
    <div style="text-align:right">
      <div style="font-weight:700;font-size:16px">${escapeHtml(docLabel)}</div>
      <div style="font-weight:800;font-size:34px;margin-top:2px">${new Date().getFullYear()}</div>
    </div>
    ${blackBannerHtml(test.name)}
    <div style="margin-top:160px;font-size:12px;line-height:1.8">
      ${totalQuestions > 0 ? `<p style="margin:0 0 4px">${tx('question_count_line', { count: totalQuestions })}</p>` : ''}
      ${totalPoints > 0 ? `<p style="margin:0 0 4px">${tx('points_count_line', { points: totalPoints })}</p>` : ''}
      ${test.durationMinutes ? `<p style="margin:0 0 4px">${tx('duration_line', { minutes: test.durationMinutes })}</p>` : ''}
    </div>
  </div>`;
}

function sectionDividerHtml(title: string): string {
    return `<div style="margin:18px 0 12px;page-break-inside:avoid">
    <div style="font-weight:700;font-size:14px;margin-bottom:4px">${escapeHtml(title)}</div>
    <div style="height:3px;background:#9ca3af"></div>
  </div>`;
}

export function buildExamBookletHtml(test: Test, options: TestExamExportOptions): string {
    const groups = groupQuestionsBySection(test);
    let html = coverPageHtml(test, tx('booklet_subtitle'));
    for (const group of groups) {
        if (group.section) {
            html += sectionDividerHtml(group.section.title);
            if (options.attachmentMode === 'inline' && group.section.content) {
                html += `<div style="margin-bottom:10px;font-size:13px">${DOMPurify.sanitize(group.section.content)}</div>`;
            }
        }
        html += group.questions.map(({ question, number }) => questionBodyHtml(question, number, options)).join('');
    }
    return `<div class="print-page">${html}</div>`;
}

export function buildExamAttachmentHtml(test: Test): string {
    const groups = groupQuestionsBySection(test).filter((g) => g.section?.content);
    let html = coverPageHtml(test, tx('attachment_subtitle'));
    groups.forEach((group, i) => {
        if (!group.section) return;
        const pageBreak = i > 0 ? 'page-break-before:always;' : '';
        html += `<div style="${pageBreak}page-break-inside:avoid">${sectionDividerHtml(group.section.title)}</div>`;
        html += `<div style="font-size:13px;margin-bottom:14px">${DOMPurify.sanitize(group.section.content ?? '')}</div>`;
    });
    return `<div class="print-page">${html}</div>`;
}

async function scanMarkerHtml(test: Test, pageIndex: number, studentId?: string): Promise<string> {
    const dataUrl = await QRCode.toDataURL(answerSheetQrPayload(test.id, pageIndex, studentId), {
        width: 96,
        margin: 0,
    });
    const markers = fiducialMarkers()
        .map(
            (m) =>
                `<div style="position:absolute;left:${m.x}mm;top:${m.y}mm;width:${m.size}mm;height:${m.size}mm;background:#000"></div>`
        )
        .join('');
    return `${markers}<img src="${dataUrl}" style="position:absolute;right:6mm;bottom:6mm;width:18mm;height:18mm" />`;
}

/** Renders one question's answer space per its AnswerSpaceSpec — empty bubbles, ruled lines, a half-page box, or numbered sub-lines. */
function answerSpaceHtml(space: AnswerSpaceSpec): string {
    switch (space.kind) {
        case 'choice': {
            const shape = space.multiSelect ? '3px' : '50%';
            return `<div style="display:flex;gap:14px;margin-top:4px;flex-wrap:wrap">${(space.optionLetters ?? [])
                .map(
                    (l) =>
                        `<div style="width:20px;height:20px;border:1.5px solid #000;border-radius:${shape};display:flex;align-items:center;justify-content:center;font-size:11px">${l}</div>`
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
    return `<div style="margin-bottom:14px;page-break-inside:avoid">
    <div style="font-weight:700;font-size:12px">${block.number}</div>
    ${answerSpaceHtml(block.space)}
  </div>`;
}

async function answerSheetPageHtml(test: Test, options: TestExamExportOptions, student?: Student): Promise<string> {
    const marker = options.scanMarkers ? await scanMarkerHtml(test, 0, student?.id) : '';
    const blocks = answerSheetGeometry(test).map(answerBlockHtml).join('');

    return `<div class="print-page" style="page-break-after:always;position:relative;padding-top:24px">
    ${marker}
    <div style="text-align:right;font-weight:700;font-size:16px">${tx('answer_sheet_title')}</div>
    ${blackBannerHtml(test.name)}
    <div style="margin-top:16px;font-size:13px">
      <strong>${tx('candidate_name')}:</strong> ${student ? escapeHtml(student.name) : '______________________'}
    </div>
    <div style="margin-top:16px">${blocks}</div>
  </div>`;
}

export async function buildAnswerSheetHtml(
    test: Test,
    options: TestExamExportOptions,
    students: Student[] = []
): Promise<string> {
    if (students.length === 0) return answerSheetPageHtml(test, options);
    const pages = await Promise.all(students.map((s) => answerSheetPageHtml(test, options, s)));
    return pages.join('');
}

function gradingTableRowsHtml(test: Test): string {
    const groups = groupQuestionsBySection(test);
    const td = (content: string, extra = '') =>
        `<td style="border:1px solid #000;padding:6px 8px;font-size:12px;vertical-align:top;${extra}">${content}</td>`;

    let rows = '';
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
            rows += `<tr>${td(`${number}<br/><span style="font-size:10px;color:#6b7280">${tx('max_score_short', { points: question.points })}</span>`)}${td(answerCell)}${td(scoresCell, 'text-align:right;white-space:nowrap')}</tr>`;
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
    return `<div class="print-page">${html}</div>`;
}

interface ExportExamPdfOptions extends TestExamExportOptions {
    students?: Student[];
}

/** Exports the booklet, (optionally) attachment, answer sheet(s), and grading sheet as separate print-to-PDF flows. */
export async function exportExamPdf(test: Test, options: ExportExamPdfOptions): Promise<void> {
    const orientation = 'portrait';
    await printHtml(buildExamBookletHtml(test, options), orientation, options.fontFamily, options.styleTemplate);
    if (options.attachmentMode === 'separate') {
        await printHtml(buildExamAttachmentHtml(test), orientation, options.fontFamily, options.styleTemplate);
    }
    const answerSheetHtml = await buildAnswerSheetHtml(test, options, options.students);
    await printHtml(answerSheetHtml, orientation, options.fontFamily, options.styleTemplate);
    await printHtml(buildGradingSheetHtml(test), orientation, options.fontFamily, options.styleTemplate);
}

export function examExportFilename(test: Test, doc: 'booklet' | 'attachment' | 'answer-sheet' | 'grading-sheet') {
    return `${sanitizeFilename(test.name)}-${doc}`;
}
