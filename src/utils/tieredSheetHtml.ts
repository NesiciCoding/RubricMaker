import i18n from 'i18next';
import type { RubricFormat } from '../types';
import { escapeHtml } from './exportDataPrep';
import { SHEET_PANEL, SHEET_PANEL_ALT, requirementMark, type SheetBand, type TieredSheet } from './tieredSheet';

const docLabel = (key: string, opts?: Record<string, unknown>): string => i18n.t(`exportDoc.${key}`, opts) ?? key;

const INK = '#1f2937';

// Statements may carry **bold** / *italic* like every other rubric text.
const md = (text: string) =>
    escapeHtml(text)
        .replace(/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|\s)\*([^*\s](?:[^*]*[^*\s])?)\*(?=$|\s|[.,;:!?])/g, '$1<em>$2</em>')
        .replace(/\n/g, '<br/>');

const panel = `background:${SHEET_PANEL};border-radius:10px;padding:6px 12px;`;

function bandHtml(band: SheetBand): string {
    const statements = band.statements
        .map(
            (s) =>
                `<div style="margin:0 0 6px;padding-left:16px;text-indent:-16px;line-height:1.25">${s.ticked ? '☑' : '☐'}&nbsp;${md(s.label)}</div>`
        )
        .join('');
    const chosen = band.chosen ? `outline:2px solid ${INK};outline-offset:-2px;` : '';
    return `<div style="margin-bottom:10px">
      <div style="background:${band.color};color:${INK};border-radius:4px;padding:1px 6px;font-weight:700;margin-bottom:4px;${chosen}">${escapeHtml(band.code)}:${band.chosen ? ` ✓ ${escapeHtml(docLabel('tiered_chosen'))}` : ''}</div>
      ${statements}
    </div>`;
}

/** The sheet body (title, requirements, info bar, one table per criterion) as print HTML. */
export function tieredSheetHtml(
    sheet: TieredSheet,
    fmt: Pick<RubricFormat, 'headerColor' | 'headerTextColor'>
): string {
    const g = sheet.graded;
    const requirements = sheet.requirements.length
        ? `<div style="${panel}margin-bottom:6px">
        <strong>${escapeHtml(docLabel('tiered_requirements'))}</strong>
        ${sheet.requirements
            .map(
                (r, i) =>
                    `<div style="margin-top:2px">${g ? `${requirementMark(r.met)} ` : `${i + 1}. `}${md(r.text)}${
                        g && r.met === false
                            ? ` <strong>(${escapeHtml(docLabel('tiered_requirement_not_met'))})</strong>`
                            : ''
                    }</div>`
            )
            .join('')}
      </div>`
        : '';

    const verdict = g?.verdict
        ? `<span style="background:${g.verdict.color};color:${INK};border-radius:4px;padding:1px 8px;font-weight:800">${escapeHtml(g.verdict.code)}</span>${
              g.verdict.label ? ` ${escapeHtml(g.verdict.label)}` : ''
          }`
        : g
          ? '—'
          : escapeHtml(sheet.bands.map((b) => b.code).join(' | '));
    const info = `<table style="width:100%;border-collapse:separate;border-spacing:0 6px">
      <tr>
        <td style="${panel}width:40%"><strong>${escapeHtml(docLabel('student'))}</strong> ${g ? escapeHtml(g.studentName) : '______________________'}</td>
        <td style="width:6px"></td>
        <td style="${panel}"><strong>${escapeHtml(docLabel('tiered_tier'))}</strong> ${escapeHtml(g?.tierLabel ?? sheet.allTierLabels.join(' | '))}</td>
        <td style="width:6px"></td>
        <td style="${panel}"><strong>${escapeHtml(docLabel('tiered_verdict'))}</strong> ${verdict}</td>
      </tr>
    </table>`;

    const critWidth = sheet.tiers.length > 1 ? 22 : 30;
    const head = `<tr>
        <th style="background:${fmt.headerColor};color:${fmt.headerTextColor};border-radius:10px;padding:4px 8px;width:${critWidth}%">${escapeHtml(docLabel('criterion'))}</th>
        ${sheet.tiers
            .map(
                (t) =>
                    `<th style="background:${fmt.headerColor};color:${fmt.headerTextColor};border-radius:10px;padding:4px 8px">${escapeHtml(t.label)}</th>`
            )
            .join('')}
      </tr>`;
    const criteria = sheet.criteria
        .map(
            (
                c
            ) => `<table style="width:100%;border-collapse:separate;border-spacing:6px 6px;table-layout:fixed;page-break-inside:avoid;break-inside:avoid;margin-top:6px">
      <thead>${head}</thead>
      <tbody><tr>
        <td style="background:${SHEET_PANEL_ALT};border-radius:10px;padding:10px 12px;vertical-align:top">
          <div style="font-weight:700;font-size:1.1em">${md(c.title)}</div>
          ${c.description ? `<div style="color:#6b7280;margin-top:4px">${md(c.description)}</div>` : ''}
          ${c.comment ? `<div style="margin-top:8px;font-style:italic">${md(c.comment)}</div>` : ''}
        </td>
        ${c.columns.map((bands) => `<td style="vertical-align:top;padding:0 2px">${bands.map(bandHtml).join('')}</td>`).join('')}
      </tr></tbody>
    </table>`
        )
        .join('');

    const overall = g?.overallComment
        ? `<div style="${panel}margin-top:10px;page-break-inside:avoid"><strong>${escapeHtml(docLabel('overall_comment'))}</strong> ${md(g.overallComment)}</div>`
        : '';

    return `<div class="tiered-sheet" style="color:${INK};font-size:12px">
      <div style="${panel}margin-bottom:6px;display:flex;justify-content:space-between;align-items:baseline;gap:12px">
        <span style="font-size:18px">${escapeHtml(sheet.title)}</span>
        ${sheet.subject ? `<span style="color:#4b5563">${escapeHtml(sheet.subject)}</span>` : ''}
      </div>
      ${requirements}
      ${info}
      ${criteria}
      ${overall}
    </div>`;
}
