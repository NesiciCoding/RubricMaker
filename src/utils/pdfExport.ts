import i18n from 'i18next';
import type { Rubric, Student, StudentRubric, GradeScale, StudentTest, Test, TestStrengthBucket } from '../types';
import { calcGradeSummary } from './gradeCalc';
import { isTicked, subItemMode, subItemRange, subItemScore } from './subItems';
import {
    calcQuestionBreakdowns,
    calcSkillBreakdowns,
    calcTestItemAnalysis,
    effectiveTestQuestions,
} from './testSummaryAggregator';
import {
    ANSWER_STATUS_MARK,
    buildAnswerRows,
    describePlacementPath,
    describeTestCefr,
    describeTestMeta,
    pickLatestAttempt,
} from './testAnswerText';
import DOMPurify from 'dompurify';
import { formatPointsRange, stripCommentHtml, stripHtmlTags, escapeHtml } from './exportDataPrep';
import { plainQuestionPromptText } from './clozeParse';
import { orderedLevels as sharedOrderedLevels } from './gradeCalc';
import type { DocxStyleTemplateOverrides } from './docxExport';

/**
 * Minimal emphasis parser for the free text that reaches a printout: `**bold**` and `*italic*`.
 *
 * Both markers have to hug their text and, for italics, start on a word boundary and end at one, so
 * arithmetic in a comment (`3 * 4`, `2*3 = 6`) is left alone instead of turning into italics — the
 * old `\*(.*?)\*` regex italicised everything between the first two asterisks on the line (#701).
 */
// Shares the `exportDoc.*` keys docxExport.ts's own docLabel() uses, so the same label is
// identical across the DOCX and PDF/HTML rubric exports.
const docLabel = (key: string, opts?: Record<string, unknown>): string => i18n.t(`exportDoc.${key}`, opts);

function parseMd(text: string) {
    if (!text) return text;
    let html = text.replace(/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[\s([{"'“‘—-])\*([^*\s](?:[^*]*[^*\s])?)\*(?=$|[\s)\]}"'”’.,;:!?—-])/g, '$1<em>$2</em>');
    html = html.replace(/\n/g, '<br/>');
    return html;
}

function buildSinglePointGridHtml(rubric: Rubric, sr?: StudentRubric): string {
    const fmt = rubric.format;
    const notYetColor = '#ef4444';
    const exceedsColor = '#10b981';

    const rows = rubric.criteria
        .map((c, i) => {
            const entry = sr?.entries.find((e) => e.criterionId === c.id);
            const outcome = entry?.singlePointOutcome;
            const comment = entry?.comment ? stripCommentHtml(entry.comment) : '';

            const isNotYet = outcome === 'not-yet';
            const isMeets = outcome === 'meets';
            const isExceeds = outcome === 'exceeds';
            const stripeBg = (sr && fmt.rowStriping && i % 2 !== 0) || !sr ? '#f8fafc' : '#ffffff';

            const notYetCell = `<td style="padding:10px 12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};vertical-align:top;font-size:12px;min-width:${fmt.levelColWidth}px;${isNotYet ? `background:${notYetColor}18;border:2px solid ${notYetColor};` : `background:${stripeBg};`}">
      ${sr ? `<div style="font-size:10px;font-weight:700;color:${notYetColor};margin-bottom:4px;">✗ ${docLabel('not_yet')}</div>` : `<div style="font-size:10px;font-weight:700;color:#6b7280;margin-bottom:4px;">${docLabel('areas_for_growth')}</div>`}
      ${isNotYet && comment ? `<div style="font-size:11px;color:#374151;font-style:italic">${parseMd(comment)}</div>` : ''}
    </td>`;

            const proficiencyDesc = c.levels[0]?.description ?? c.description ?? '';
            const centerCell = `<td style="padding:10px 12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};vertical-align:top;font-size:12px;min-width:${fmt.criterionColWidth}px;${isMeets ? `background:${fmt.accentColor}18;border:2px solid ${fmt.accentColor};` : ''}">
      <div style="font-weight:700;margin-bottom:4px;">${parseMd(c.title)}</div>
      ${proficiencyDesc ? `<div style="font-size:11px;color:#6b7280">${parseMd(proficiencyDesc)}</div>` : ''}
      ${fmt.showWeights ? `<div style="font-size:10px;color:#6b7280;margin-top:4px">${docLabel('weight', { weight: c.weight })}</div>` : ''}
      ${isMeets && comment ? `<div style="font-size:11px;color:#374151;font-style:italic;margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb">${parseMd(comment)}</div>` : ''}
    </td>`;

            const exceedsCell = `<td style="padding:10px 12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};vertical-align:top;font-size:12px;min-width:${fmt.levelColWidth}px;${isExceeds ? `background:${exceedsColor}18;border:2px solid ${exceedsColor};` : `background:${stripeBg};`}">
      ${sr ? `<div style="font-size:10px;font-weight:700;color:${exceedsColor};margin-bottom:4px;">▲ ${docLabel('exceeds')}</div>` : `<div style="font-size:10px;font-weight:700;color:#6b7280;margin-bottom:4px;">${docLabel('exceeds_standard')}</div>`}
      ${isExceeds && comment ? `<div style="font-size:11px;color:#374151;font-style:italic">${parseMd(comment)}</div>` : ''}
    </td>`;

            return `<tr style="page-break-inside: avoid;">${notYetCell}${centerCell}${exceedsCell}</tr>`;
        })
        .join('');

    return `
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <thead>
        <tr style="background:${fmt.headerColor};color:${fmt.headerTextColor}">
          <th style="padding:10px 12px;text-align:center;font-size:12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};min-width:${fmt.levelColWidth}px">${docLabel('not_yet')}</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};min-width:${fmt.criterionColWidth}px">${docLabel('proficiency_standard')}</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};min-width:${fmt.levelColWidth}px">${docLabel('exceeds')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildRubricGridHtml(rubric: Rubric, sr?: StudentRubric): string {
    if (rubric.scoringMode === 'single-point') return buildSinglePointGridHtml(rubric, sr);

    const fmt = rubric.format;
    const orderedLevels = (criterion: (typeof rubric.criteria)[0]) => sharedOrderedLevels(criterion, fmt);

    const rows = rubric.criteria
        .map((c, i) => {
            const entry = sr?.entries.find((e) => e.criterionId === c.id);
            const levels = orderedLevels(c);
            const cells = levels
                .map((l) => {
                    const selected = entry?.levelId === l.id;

                    const subItemsHtml =
                        l.subItems.length > 0
                            ? `
        <div style="margin-top:8px;padding-top:6px;border-top:1px solid #e5e7eb;font-size:10px;">
          ${l.subItems
              .map((si) => {
                  if (subItemMode(c) === 'checklist') {
                      const box = entry && isTicked(entry, si.id) ? '☑' : '☐';
                      return `<div style="margin-bottom:3px;">${box} ${parseMd(si.label)}</div>`;
                  }
                  const { min, max } = subItemRange(si);
                  const scoreLabel = entry
                      ? `[${docLabel('points', { points: `${subItemScore(entry, si) ?? 0}/${max}` })}]`
                      : `(${docLabel('points', { points: `${min}-${max}` })})`;
                  return `<div style="margin-bottom:3px;">${entry ? '•' : '☐'} ${parseMd(si.label)} <span style="color:#6b7280;font-size:9px">${scoreLabel}</span></div>`;
              })
              .join('')}
        </div>
      `
                            : '';

                    return `<td style="padding:10px 12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};vertical-align:top;font-size:12px;${selected ? `background:${fmt.accentColor}22;border-color:${fmt.accentColor};border-style:solid;border-width:2px;font-weight:600;` : ''}">
        ${parseMd(l.description) || '–'}
        ${fmt.showPoints ? `<br/><small style="color:${selected ? fmt.accentColor : '#6b7280'}">${docLabel('points', { points: formatPointsRange(l.minPoints, l.maxPoints) })}</small>` : ''}
        ${subItemsHtml}
      </td>`;
                })
                .join('');

            const comment = entry?.comment
                ? `<div style="font-size:10px;color:#6b7280;margin-top:4px;font-style:italic">${parseMd(entry.comment)}</div>`
                : '';
            const stripeBg = (sr && fmt.rowStriping && i % 2 !== 0) || !sr ? '#f8fafc' : '#ffffff';

            return `<tr style="background:${stripeBg}; page-break-inside: avoid;">
      <td style="padding:10px 12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};font-weight:600;font-size:12px;background:${stripeBg};min-width:${fmt.criterionColWidth}px">
        ${parseMd(c.title)}
        ${c.description ? `<div style="font-size:10px;color:#6b7280;font-weight:400">${parseMd(c.description)}</div>` : ''}
        ${comment}
        ${fmt.showWeights ? `<div style="font-size:10px;color:#6b7280;margin-top:4px">${docLabel('weight', { weight: c.weight })}</div>` : ''}
      </td>
      ${cells}
    </tr>`;
        })
        .join('');

    const headerCells = (rubric.criteria[0] ? orderedLevels(rubric.criteria[0]) : [])
        .map(
            (l) =>
                `<th style="padding:12px 14px;text-align:${fmt.headerTextAlign || 'center'};border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};min-width:${fmt.levelColWidth}px;font-size:12px">
      ${parseMd(l.label)}${fmt.showPoints ? ` (${docLabel('points', { points: formatPointsRange(l.minPoints, l.maxPoints) })})` : ''}
    </th>`
        )
        .join('');

    return `
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <thead>
          <tr style="background:${fmt.headerColor};color:${fmt.headerTextColor}">
            <th style="padding:12px 14px;text-align:left;font-size:12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};min-width:${fmt.criterionColWidth}px">${docLabel('criterion')}</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
  `;
}

export function buildRubricHTML(
    sr: StudentRubric,
    rubric: Rubric,
    student: Student,
    scale: GradeScale | null,
    breakBeforeRight = false
): string {
    const summary = calcGradeSummary(sr, rubric.criteria, scale);
    const fmt = rubric.format;
    const gridHtml = buildRubricGridHtml(rubric, sr);
    const modifierSign = sr.globalModifier && sr.globalModifier.value > 0 ? '+' : '';
    const modifierValueLabel = sr.globalModifier
        ? sr.globalModifier.type === 'percentage'
            ? `${modifierSign}${sr.globalModifier.value}%`
            : docLabel('points', { points: `${modifierSign}${sr.globalModifier.value}` })
        : '';

    return `
  <div class="print-page" style="${breakBeforeRight ? 'break-before: right; page-break-before: right; ' : ''}page-break-after: always; font-family: ${fmt.fontFamily}; color: #1e293b; background: #fff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
        <div>
          <h1 style="margin:0;font-size:20px">${escapeHtml(rubric.name)}</h1>
          ${rubric.subject ? `<div style="color:#6b7280;margin-top:4px;font-size:13px">${escapeHtml(rubric.subject)}</div>` : ''}
          <div style="margin-top:8px;font-size:14px"><strong>${docLabel('student')}</strong> ${escapeHtml(student.name)}</div>
          ${student.email ? `<div style="font-size:13px;color:#6b7280">${escapeHtml(student.email)}</div>` : ''}
          <div style="font-size:12px;color:#6b7280;margin-top:4px">${sr.gradedAt ? docLabel('graded', { date: new Date(sr.gradedAt).toLocaleDateString(i18n.language) }) : docLabel('not_graded')}</div>
        </div>
        <div style="text-align:right">
          ${
              fmt.showCalculatedGrade !== false && scale !== null
                  ? `
          <div style="font-size:42px;font-weight:800;color:${summary.gradeColor};line-height:1">${summary.letterGrade}</div>
          <div style="font-size:16px;font-weight:600;color:#374151">${summary.modifiedPercentage.toFixed(1)}%</div>
          `
                  : fmt.showCalculatedGrade !== false
                    ? `
          <div style="font-size:16px;font-weight:600;color:#374151">${summary.modifiedPercentage.toFixed(1)}%</div>
          `
                    : ''
          }
          <div style="font-size:12px;color:#6b7280">${docLabel('points', { points: `${summary.rawScore}/${summary.maxRawScore}` })}</div>
          ${
              sr.globalModifier && sr.globalModifier.value !== 0
                  ? `<div style="font-size:11px;color:#f59e0b;margin-top:4px">${docLabel('modifier', { value: modifierValueLabel })}
               ${sr.globalModifier.reason ? `(${escapeHtml(sr.globalModifier.reason)})` : ''}</div>`
                  : ''
          }
        </div>
      </div>

      ${gridHtml}

      ${
          sr.overallComment
              ? `
        <div style="margin-top:18px;page-break-inside: avoid;padding:14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
          <strong style="font-size:12px;color:#374151">${docLabel('overall_comment')}</strong>
          <p style="margin:6px 0 0;font-size:13px;color:#475569">${parseMd(sr.overallComment)}</p>
        </div>`
              : ''
      }

      <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:right">
        ${docLabel('generated_by', { date: new Date().toLocaleDateString(i18n.language) })}
        ${sr.isPeerReview ? ` · ${docLabel('peer_review')}` : ''}
      </div>
  </div>`;
}

function buildEmptyRubricHTML(rubric: Rubric): string {
    const fmt = rubric.format;
    const gridHtml = buildRubricGridHtml(rubric);

    return `
  <div class="print-page" style="page-break-after: always; font-family: ${fmt.fontFamily}; color: #1e293b; background: #fff;">
      <div style="margin-bottom:18px">
        <h1 style="margin:0;font-size:20px">${escapeHtml(rubric.name)}</h1>
        ${rubric.subject ? `<div style="color:#6b7280;margin-top:4px;font-size:13px">${escapeHtml(rubric.subject)}</div>` : ''}
        ${rubric.description ? `<div style="color:#6b7280;margin-top:4px;font-size:12px">${escapeHtml(rubric.description)}</div>` : ''}
      </div>

      ${gridHtml}

      <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:right">
        ${docLabel('generated_by', { date: new Date().toLocaleDateString(i18n.language) })}
      </div>
  </div>`;
}

/** The families scripts/vendor-fonts.mjs serves locally, i.e. what a print document cannot get from the app's stylesheet. */
const VENDORED_FONTS = [
    'Bricolage Grotesque',
    'Hanken Grotesk',
    'Inter',
    'Nunito',
    'Source Sans 3',
    'Lato',
    'Roboto',
    'Playfair Display',
    'Oswald',
    'Bebas Neue',
    'Special Elite',
    'Courier Prime',
];

/** Font families named by the given stacks (base font plus a style template's body/heading overrides). */
function fontFamilyTokens(...fontFamilies: Array<string | undefined>): string[] {
    const tokens = new Set<string>();
    for (const fontFamily of fontFamilies) {
        if (!fontFamily) continue;
        fontFamily.split(',').forEach((part) => tokens.add(part.trim().replace(/^['"]|['"]$/g, '')));
    }
    return [...tokens];
}

/**
 * The print document is a separate document, so the vendored fonts have to be linked into it. Returns
 * '' when every family in play is a system font (the common case), which spares the frame a request.
 */
export function fontStylesheetLinkFor(...fontFamilies: Array<string | undefined>): string {
    const tokens = fontFamilyTokens(...fontFamilies);
    if (!VENDORED_FONTS.some((name) => tokens.includes(name))) return '';
    return `<link rel="stylesheet" href="${new URL('fonts/fonts.css', document.baseURI).href}">`;
}

/** Same body/heading override CSS `buildDocxStyles()` (docxExport.ts) applies to a DOCX document, translated to print CSS. */
export function styleTemplateCss(styleTemplate?: DocxStyleTemplateOverrides): string {
    if (!styleTemplate) return '';
    const { bodyFont, headingFont, headingSize, headingColor } = styleTemplate;
    const fontName = (name: string) => name.replace(/[^\p{L}\p{N} _-]/gu, '');
    const bodyRule = bodyFont ? `body { font-family: '${fontName(bodyFont)}'; }` : '';
    const headingDecls = [
        headingFont ? `font-family: '${fontName(headingFont)}';` : '',
        // headingSize is in docx half-points; CSS wants pt.
        headingSize ? `font-size: ${Number(headingSize) / 2}pt;` : '',
        headingColor ? `color: #${headingColor.replace(/[^0-9a-fA-F]/g, '')};` : '',
    ]
        .filter(Boolean)
        .join(' ');
    const headingRule = headingDecls ? `h1, h2 { ${headingDecls} }` : '';
    return `${bodyRule} ${headingRule}`;
}

export const PRINT_MARGIN_MM = 10;

// The builders interpolate imported rubric/student text, and printHtml writes into a same-origin frame,
// so every export is sanitised here as well as escaped at the source.
function sanitizePrintHtml(html: string): string {
    return DOMPurify.sanitize(html, { FORCE_BODY: true });
}

/**
 * Browsers print their own date/URL/title header and footer into any non-zero @page margin, so a
 * zero @page margin is the only way to keep them off student-facing paper. The page margin is then
 * rebuilt as side padding plus a repeating thead/tfoot spacer, which — unlike body padding — recurs
 * on every printed page. The last sheet's forced page break is dropped so the footer spacer
 * doesn't spill onto a trailing blank page.
 *
 * `headerExtra` is absolutely positioned content that repeats on every page of this table (the
 * thead starts at the very top of each page, so its offsets are page coordinates minus the side
 * padding) — used for per-sheet scan markers, which a `position: fixed` element could not do since
 * that would repeat one sheet's marker across every student's pages. `breakAfter` starts the next
 * table on a fresh page.
 *
 * `headerHeightMm`/`footerHeightMm` default to PRINT_MARGIN_MM but can be widened — e.g. for scan
 * markers, whose fiducials/QR are drawn inside this same header band but are physically larger than
 * the default margin (see scanMarkerMarginsMm() in testExamContent.ts) and would otherwise bleed
 * past it into the real content below/above.
 */
export function withoutBrowserPrintChrome(
    html: string,
    {
        headerExtra = '',
        breakAfter = false,
        headerHeightMm = PRINT_MARGIN_MM,
        footerHeightMm = PRINT_MARGIN_MM,
    }: { headerExtra?: string; breakAfter?: boolean; headerHeightMm?: number; footerHeightMm?: number } = {}
): string {
    const top = `<tr><td style="height:${headerHeightMm}mm;padding:0;position:relative">${headerExtra}</td></tr>`;
    const bottom = `<tr><td style="height:${footerHeightMm}mm;padding:0"></td></tr>`;
    return `<style>.print-page:last-child{page-break-after:auto !important}</style><table style="width:100%;border-collapse:collapse${breakAfter ? ';page-break-after:always' : ''}"><thead>${top}</thead><tbody><tr><td style="padding:0">${html}</td></tr></tbody><tfoot>${bottom}</tfoot></table>`;
}

/** Upper bound on how long a print job may keep its iframe alive when the browser never reports `afterprint`. */
const PRINT_SAFETY_TIMEOUT_MS = 5 * 60_000;
/** How long to wait for the print document's fonts, so a font that never arrives can't hold the dialog. */
const PRINT_FONT_TIMEOUT_MS = 3_000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits for the print document's own stylesheets to finish loading, so the faces they declare are registered. */
function whenStylesheetsReady(doc: Document): Promise<void> {
    const pending = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].filter((link) => !link.sheet);
    return Promise.all(
        pending.map(
            (link) =>
                new Promise<void>((resolve) => {
                    link.addEventListener('load', () => resolve(), { once: true });
                    link.addEventListener('error', () => resolve(), { once: true });
                })
        )
    ).then(() => undefined);
}

/**
 * Waits until the print document can render in the fonts it asked for.
 *
 * A flat delay either printed in a fallback face when the font was slow or wasted half a second when it
 * wasn't. `document.fonts.load()` is the real signal that the faces are available — it is what the print
 * dialog's snapshot needs — but a font that never arrives must not hold the dialog, hence the cap. `doc.fonts`
 * is missing in older browsers (and in jsdom), where the caller's flat delay is kept instead.
 */
function waitForPrintFonts(doc: Document, families: string[], fallbackMs: number): Promise<void> {
    if (!doc.fonts) return sleep(fallbackMs);
    return Promise.race([
        whenStylesheetsReady(doc)
            .then(() => Promise.all(families.map((family) => doc.fonts.load(`16px "${family}"`))))
            .then(() => doc.fonts.ready)
            .then(() => undefined),
        sleep(PRINT_FONT_TIMEOUT_MS),
    ]);
}

/** How long a caller that waits for the print dialog waits for `afterprint` before moving on, so a browser that advertises but never fires it can't stall a multi-document export for the full cleanup window. */
const PRINT_DIALOG_WAIT_TIMEOUT_MS = 2 * 60_000;

/**
 * What the browser could tell us about a print job.
 *
 * Every browser fires the dialog lifecycle events for a cancelled print exactly as it does for a
 * completed one, and none exposes a cancel event, so this is deliberately "was the print dialog
 * shown", never "did a document come out". `dialogDetectable` is false in browsers that don't report
 * the lifecycle at all, where the caller has to take the print on trust.
 */
export interface PrintOutcome {
    dialogOpened: boolean;
    dialogDetectable: boolean;
}

export function printHtml(
    html: string,
    orientation?: 'portrait' | 'landscape',
    fontFamily?: string,
    styleTemplate?: DocxStyleTemplateOverrides,
    options: { hideBrowserChrome?: boolean; waitForPrintDialog?: boolean; fontSize?: number; lineSpacing?: number } = {}
): Promise<PrintOutcome> {
    return new Promise<PrintOutcome>((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (doc) {
            const printFontFamilies = fontFamilyTokens(fontFamily, styleTemplate?.bodyFont, styleTemplate?.headingFont);
            const fontLink = fontStylesheetLinkFor(...printFontFamilies);
            // The vendored faces are only requested when the document uses them, and the browser needs
            // them in place before it snapshots the page for the dialog.
            const linkedFamilies = fontLink ? printFontFamilies.filter((name) => VENDORED_FONTS.includes(name)) : [];
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    ${fontLink}
                    <style>
                        @page { size: ${orientation === 'landscape' ? 'landscape' : 'portrait'}; margin: ${options.hideBrowserChrome ? '0' : `${PRINT_MARGIN_MM}mm`}; }
                        body { margin: 0;${options.fontSize ? ` font-size: ${options.fontSize}pt;` : ''}${options.lineSpacing ? ` line-height: ${options.lineSpacing};` : ''}${options.hideBrowserChrome ? ` padding: 0 ${PRINT_MARGIN_MM}mm;` : ''} }
                        ${styleTemplateCss(styleTemplate)}
                    </style>
                </head>
                <body>
                    ${sanitizePrintHtml(html)}
                </body>
                </html>
            `);
            doc.close();

            void waitForPrintFonts(doc, linkedFamilies, fontLink ? 800 : 500).then(() => {
                const win = iframe.contentWindow;
                let cleaned = false;
                /* v8 ignore next -- a window without print-dialog events cannot report them */
                const dialogDetectable = !!win && 'onafterprint' in win;
                let dialogOpened = false;
                // Removing the frame right after print() drops the job in browsers where print() doesn't
                // block until the dialog closes, so it stays until the browser reports afterprint.
                const cleanup = () => {
                    if (cleaned) return;
                    cleaned = true;
                    clearTimeout(safety);
                    iframe.remove();
                };
                // Resolving and removing the frame are separate: dropping the frame right after print()
                // cancels the job in browsers where print() doesn't block.
                const finish = () => resolve({ dialogOpened, dialogDetectable });
                const safety = setTimeout(() => {
                    cleanup();
                    finish();
                }, PRINT_SAFETY_TIMEOUT_MS);
                win?.addEventListener(
                    'beforeprint',
                    () => {
                        dialogOpened = true;
                    },
                    { once: true }
                );
                win?.addEventListener(
                    'afterprint',
                    () => {
                        dialogOpened = true;
                        cleanup();
                        finish();
                    },
                    { once: true }
                );
                win?.focus();
                win?.print();
                // Only callers that print several documents in a row wait for the dialog to close (so the
                // next one doesn't open over it); everyone else resolves promptly as before.
                const waitsForDialog = options.waitForPrintDialog && dialogDetectable;
                setTimeout(finish, waitsForDialog ? PRINT_DIALOG_WAIT_TIMEOUT_MS : 100);
            });
        } else {
            resolve({ dialogOpened: false, dialogDetectable: false });
        }
    });
}

/**
 * printHtml for exports whose callers record or announce a finished file: waits for the print dialog
 * to close, and throws when the browser was able to report the dialog but never showed one — a blocked
 * print preview used to be logged (and toasted) as a successful export (#701). A cancelled dialog is
 * still indistinguishable from a printed one, so callers must not read this as proof of paper.
 */
export async function printForExport(
    html: string,
    orientation: 'portrait' | 'landscape' | undefined,
    fontFamily: string | undefined,
    styleTemplate?: DocxStyleTemplateOverrides
): Promise<void> {
    const outcome = await printHtml(html, orientation, fontFamily, styleTemplate, { waitForPrintDialog: true });
    if (outcome.dialogDetectable && !outcome.dialogOpened) {
        throw new Error('print dialog did not open');
    }
}

export async function exportSinglePdf(
    sr: StudentRubric,
    rubric: Rubric,
    student: Student,
    scale: GradeScale | null,
    options: { orientation?: 'portrait' | 'landscape'; styleTemplate?: DocxStyleTemplateOverrides } = {}
): Promise<void> {
    const htmlStr = buildRubricHTML(sr, rubric, student, scale);
    await printForExport(
        htmlStr,
        options.orientation || rubric.format.orientation || 'portrait',
        rubric.format.fontFamily,
        options.styleTemplate
    );
}

export async function exportBatchPdf(
    entries: { sr: StudentRubric; student: Student }[],
    rubric: Rubric,
    scale: GradeScale | null,
    options: {
        orientation?: 'portrait' | 'landscape';
        padForDoubleSided?: boolean;
        styleTemplate?: DocxStyleTemplateOverrides;
    } = {}
): Promise<void> {
    const htmlParts = entries.map(({ sr, student }, index) => {
        // For double-sided mode: break-before: right lets the browser insert a blank
        // page only when needed so each student always starts on the front of a sheet.
        return buildRubricHTML(sr, rubric, student, scale, options.padForDoubleSided === true && index > 0);
    });
    await printForExport(
        htmlParts.join(''),
        options.orientation || rubric.format.orientation || 'portrait',
        rubric.format.fontFamily,
        options.styleTemplate
    );
}

export async function exportRubricGridPdf(rubric: Rubric, styleTemplate?: DocxStyleTemplateOverrides): Promise<void> {
    const htmlStr = buildEmptyRubricHTML(rubric);
    await printForExport(htmlStr, rubric.format.orientation || 'portrait', rubric.format.fontFamily, styleTemplate);
}

/** Same thresholds as bucketForAccuracy() in testSummaryAggregator.ts — keep these in sync. */
const BUCKET_COLOR: Record<TestStrengthBucket, string> = {
    strong: '#10b981',
    developing: '#f59e0b',
    weak: '#ef4444',
};

function buildTestSummaryHTML(
    studentId: string | null,
    studentTests: StudentTest[],
    test: Test,
    student?: Student,
    achieveThreshold?: number
): string {
    const tx = (key: string, opts?: Record<string, unknown>) => i18n.t(`tests.export.summary.${key}`, opts);
    const questions = calcQuestionBreakdowns(studentId, studentTests, test);
    const skills = calcSkillBreakdowns(studentId, studentTests, test);
    const questionsById = new Map(effectiveTestQuestions(studentId, studentTests, test).map((q) => [q.id, q]));

    const studentTest =
        studentId !== null
            ? pickLatestAttempt(studentTests.filter((st) => st.testId === test.id && st.studentId === studentId))
            : null;
    // Scope the answer breakdown to just the exported attempt so adaptive questions from other
    // attempts don't leak in as blank rows.
    const answerQuestions = studentTest ? effectiveTestQuestions(studentId, [studentTest], test) : [];
    const cefr = describeTestCefr(test, studentTest, achieveThreshold);
    const metaLines = studentTest ? describeTestMeta(studentTest) : [];
    const placementPath = studentTest ? describePlacementPath(test, studentTest) : [];

    const STATUS_COLOR: Record<string, string> = {
        correct: '#059669',
        partial: '#d97706',
        wrong: '#dc2626',
        blank: '#9ca3af',
        na: '#6b7280',
    };
    const answerRows = studentTest
        ? buildAnswerRows(test, studentTest, answerQuestions)
              .map((row, i) => {
                  const color = STATUS_COLOR[row.status];
                  const mark = ANSWER_STATUS_MARK[row.status];
                  return `<tr style="page-break-inside: avoid;">
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:11px;width:40%"><span style="color:${color};font-weight:700">${mark}</span> Q${i + 1}. ${escapeHtml(row.prompt)}</td>
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:11px;width:27%">${escapeHtml(row.given)}</td>
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:11px;width:27%;color:#059669">${escapeHtml(row.correct) || '—'}</td>
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:11px;text-align:center;width:6%;color:${color};font-weight:700">${row.pointsEarned}/${row.points}</td>
      </tr>`;
              })
              .join('')
        : '';

    const itemAnalysis = studentId === null ? calcTestItemAnalysis(studentTests, test) : [];
    const itemRows = itemAnalysis
        .map((row, i) => {
            const disc =
                row.discrimination === null
                    ? '—'
                    : `${row.discrimination >= 0 ? '+' : ''}${row.discrimination.toFixed(2)}`;
            const distractor = row.topDistractor
                ? `${escapeHtml(row.topDistractor.text)} (${row.topDistractor.count})`
                : '—';
            return `<tr style="page-break-inside: avoid;">
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:12px">Q${i + 1}</td>
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:12px;text-align:center">${row.pValue === null ? '—' : row.pValue.toFixed(2)}</td>
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:12px;text-align:center">${disc}</td>
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:11px">${distractor}</td>
      </tr>`;
        })
        .join('');

    const questionRows = questions
        .map((qb, i) => {
            const question = questionsById.get(qb.questionId);
            const color = BUCKET_COLOR[qb.bucket];
            const questionText = question ? stripHtmlTags(plainQuestionPromptText(question)) : '';
            return `<tr style="page-break-inside: avoid;">
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:12px;width:60%">Q${i + 1}. ${escapeHtml(questionText)}</td>
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:12px;text-align:center;width:20%;color:${color};font-weight:700">${qb.accuracyPct.toFixed(0)}%</td>
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:11px;text-align:center;width:20%;color:#6b7280">${qb.sampleSize}</td>
      </tr>`;
        })
        .join('');

    const skillRows = skills
        .map((sb) => {
            const color = BUCKET_COLOR[sb.bucket];
            return `<tr style="page-break-inside: avoid;">
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:12px;width:60%">${sb.label}</td>
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:12px;text-align:center;width:20%;color:${color};font-weight:700">${sb.accuracyPct.toFixed(0)}%</td>
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:11px;text-align:center;width:20%;color:#6b7280">${sb.sampleSize}</td>
      </tr>`;
        })
        .join('');

    return `
  <div class="print-page" style="page-break-after: always; font-family: system-ui, sans-serif; color: #1e293b; background: #fff;">
      <div style="margin-bottom:18px">
        <h1 style="margin:0;font-size:20px">${escapeHtml(test.name)}</h1>
        <div style="margin-top:8px;font-size:14px"><strong>${tx('student')}:</strong> ${student ? escapeHtml(student.name) : tx('whole_class')}</div>
        ${cefr ? `<div style="margin-top:4px;font-size:14px"><strong>${tx('cefr')}:</strong> ${escapeHtml(cefr)}</div>` : ''}
        ${metaLines.map((line) => `<div style="margin-top:4px;font-size:13px;color:#475569">${escapeHtml(line)}</div>`).join('')}
        ${
            placementPath.length > 0
                ? `<div style="margin-top:6px;font-size:13px"><strong>${tx('placement_path')}:</strong> ${placementPath
                      .map((s) => `${escapeHtml(s.title)}: ${s.level ?? '—'} (${s.scorePct.toFixed(0)}%)`)
                      .join(' → ')}</div>`
                : ''
        }
      </div>

      ${
          answerRows
              ? `<h2 style="font-size:14px;margin:18px 0 8px">${tx('answers')}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 10px;text-align:left;font-size:12px;border:1px solid #d1d5db">${tx('question')}</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;border:1px solid #d1d5db">${tx('given')}</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;border:1px solid #d1d5db">${tx('correct')}</th>
            <th style="padding:8px 10px;text-align:center;font-size:12px;border:1px solid #d1d5db">${tx('pts_header')}</th>
          </tr>
        </thead>
        <tbody>${answerRows}</tbody>
      </table>`
              : ''
      }

      <h2 style="font-size:14px;margin:18px 0 8px">${tx('per_question_accuracy')}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 10px;text-align:left;font-size:12px;border:1px solid #d1d5db">${tx('question')}</th>
            <th style="padding:8px 10px;text-align:center;font-size:12px;border:1px solid #d1d5db">${tx('accuracy')}</th>
            <th style="padding:8px 10px;text-align:center;font-size:12px;border:1px solid #d1d5db">${tx('submissions')}</th>
          </tr>
        </thead>
        <tbody>${questionRows}</tbody>
      </table>

      ${
          skills.length > 0
              ? `
      <h2 style="font-size:14px;margin:18px 0 8px">${tx('strong_weak')}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 10px;text-align:left;font-size:12px;border:1px solid #d1d5db">${tx('standard_descriptor')}</th>
            <th style="padding:8px 10px;text-align:center;font-size:12px;border:1px solid #d1d5db">${tx('accuracy')}</th>
            <th style="padding:8px 10px;text-align:center;font-size:12px;border:1px solid #d1d5db">${tx('submissions')}</th>
          </tr>
        </thead>
        <tbody>${skillRows}</tbody>
      </table>`
              : ''
      }

      ${
          itemRows
              ? `
      <h2 style="font-size:14px;margin:18px 0 8px">${tx('item_analysis')}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 10px;text-align:left;font-size:12px;border:1px solid #d1d5db">${tx('question')}</th>
            <th style="padding:8px 10px;text-align:center;font-size:12px;border:1px solid #d1d5db">${tx('difficulty_p')}</th>
            <th style="padding:8px 10px;text-align:center;font-size:12px;border:1px solid #d1d5db">${tx('discrimination')}</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;border:1px solid #d1d5db">${tx('top_distractor')}</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>`
              : ''
      }

      <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:right">
        ${escapeHtml(tx('generated_by', { date: new Date().toLocaleDateString(i18n.language) }))}
      </div>
  </div>`;
}

export async function exportTestSummaryPdf(
    studentId: string | null,
    studentTests: StudentTest[],
    test: Test,
    student?: Student,
    styleTemplate?: DocxStyleTemplateOverrides,
    achieveThreshold?: number
): Promise<void> {
    const htmlStr = buildTestSummaryHTML(studentId, studentTests, test, student, achieveThreshold);
    await printHtml(htmlStr, 'portrait', undefined, styleTemplate);
}

export async function exportBatchTestSummaryPdf(
    entries: { studentId: string; student: Student }[],
    studentTests: StudentTest[],
    test: Test,
    styleTemplate?: DocxStyleTemplateOverrides,
    achieveThreshold?: number
): Promise<void> {
    const htmlParts = entries.map(({ studentId, student }) =>
        buildTestSummaryHTML(studentId, studentTests, test, student, achieveThreshold)
    );
    await printHtml(htmlParts.join(''), 'portrait', undefined, styleTemplate);
}
