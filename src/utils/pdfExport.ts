import type { Rubric, Student, StudentRubric, GradeScale, StudentTest, Test, TestStrengthBucket } from '../types';
import { calcGradeSummary } from './gradeCalc';
import { calcQuestionBreakdowns, calcSkillBreakdowns } from './testSummaryAggregator';
import { formatPointsRange, stripCommentHtml } from './exportDataPrep';
import { orderedLevels as sharedOrderedLevels } from './gradeCalc';

function parseMd(text: string) {
    if (!text) return text;
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
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

            const notYetCell = `<td style="padding:10px 12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};vertical-align:top;font-size:12px;width:30%;${isNotYet ? `background:${notYetColor}18;border:2px solid ${notYetColor};` : `background:${stripeBg};`}">
      ${sr ? `<div style="font-size:10px;font-weight:700;color:${notYetColor};margin-bottom:4px;">✗ Not Yet</div>` : '<div style="font-size:10px;font-weight:700;color:#6b7280;margin-bottom:4px;">Areas for Growth</div>'}
      ${isNotYet && comment ? `<div style="font-size:11px;color:#374151;font-style:italic">${parseMd(comment)}</div>` : ''}
    </td>`;

            const proficiencyDesc = c.levels[0]?.description ?? c.description ?? '';
            const centerCell = `<td style="padding:10px 12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};vertical-align:top;font-size:12px;width:40%;${isMeets ? `background:${fmt.accentColor}18;border:2px solid ${fmt.accentColor};` : ''}">
      <div style="font-weight:700;margin-bottom:4px;">${parseMd(c.title)}</div>
      ${proficiencyDesc ? `<div style="font-size:11px;color:#6b7280">${parseMd(proficiencyDesc)}</div>` : ''}
      ${fmt.showWeights ? `<div style="font-size:10px;color:#6b7280;margin-top:4px">Weight: ${c.weight}%</div>` : ''}
      ${isMeets && comment ? `<div style="font-size:11px;color:#374151;font-style:italic;margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb">${parseMd(comment)}</div>` : ''}
    </td>`;

            const exceedsCell = `<td style="padding:10px 12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};vertical-align:top;font-size:12px;width:30%;${isExceeds ? `background:${exceedsColor}18;border:2px solid ${exceedsColor};` : `background:${stripeBg};`}">
      ${sr ? `<div style="font-size:10px;font-weight:700;color:${exceedsColor};margin-bottom:4px;">▲ Exceeds</div>` : '<div style="font-size:10px;font-weight:700;color:#6b7280;margin-bottom:4px;">Exceeds Standard</div>'}
      ${isExceeds && comment ? `<div style="font-size:11px;color:#374151;font-style:italic">${parseMd(comment)}</div>` : ''}
    </td>`;

            return `<tr style="page-break-inside: avoid;">${notYetCell}${centerCell}${exceedsCell}</tr>`;
        })
        .join('');

    return `
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <thead>
        <tr style="background:${fmt.headerColor};color:${fmt.headerTextColor}">
          <th style="padding:10px 12px;text-align:center;font-size:12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};width:30%">Not Yet</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};width:40%">Proficiency Standard</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};width:30%">Exceeds</th>
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
                  const legacyChecked = (entry?.checkedSubItems ?? []).includes(si.id);
                  const max = si.maxPoints ?? si.points ?? 1;
                  let scoreLabel: string;
                  if (entry) {
                      const currentScore = entry.subItemScores?.[si.id] ?? (legacyChecked ? max : (si.minPoints ?? 0));
                      scoreLabel = `[${currentScore}/${max} pts]`;
                  } else {
                      scoreLabel = `(${si.minPoints ?? 0}-${max} pts)`;
                  }
                  return `<div style="margin-bottom:3px;">${entry ? '•' : '[ ]'} ${parseMd(si.label)} <span style="color:#6b7280;font-size:9px">${scoreLabel}</span></div>`;
              })
              .join('')}
        </div>
      `
                            : '';

                    return `<td style="padding:10px 12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};vertical-align:top;font-size:12px;${selected ? `background:${fmt.accentColor}22;border-color:${fmt.accentColor};border-style:solid;border-width:2px;font-weight:600;` : ''}">
        ${parseMd(l.description) || '–'}
        ${fmt.showPoints ? `<br/><small style="color:${selected ? fmt.accentColor : '#6b7280'}">${formatPointsRange(l.minPoints, l.maxPoints)}pts</small>` : ''}
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
        ${fmt.showWeights ? `<div style="font-size:10px;color:#6b7280;margin-top:4px">Weight: ${c.weight}%</div>` : ''}
      </td>
      ${cells}
    </tr>`;
        })
        .join('');

    const headerCells = (rubric.criteria[0] ? orderedLevels(rubric.criteria[0]) : [])
        .map(
            (l) =>
                `<th style="padding:12px 14px;text-align:${fmt.headerTextAlign || 'center'};border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};min-width:${fmt.levelColWidth}px;font-size:12px">
      ${parseMd(l.label)}${fmt.showPoints ? ` (${formatPointsRange(l.minPoints, l.maxPoints)}pts)` : ''}
    </th>`
        )
        .join('');

    return `
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <thead>
          <tr style="background:${fmt.headerColor};color:${fmt.headerTextColor}">
            <th style="padding:12px 14px;text-align:left;font-size:12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};min-width:${fmt.criterionColWidth}px">Criterion</th>
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

    return `
  <div class="print-page" style="${breakBeforeRight ? 'break-before: right; page-break-before: right; ' : ''}page-break-after: always; font-family: ${fmt.fontFamily}; color: #1e293b; background: #fff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
        <div>
          <h1 style="margin:0;font-size:20px">${rubric.name}</h1>
          ${rubric.subject ? `<div style="color:#6b7280;margin-top:4px;font-size:13px">${rubric.subject}</div>` : ''}
          <div style="margin-top:8px;font-size:14px"><strong>Student:</strong> ${student.name}</div>
          ${student.email ? `<div style="font-size:13px;color:#6b7280">${student.email}</div>` : ''}
          <div style="font-size:12px;color:#6b7280;margin-top:4px">Graded: ${sr.gradedAt ? new Date(sr.gradedAt).toLocaleDateString() : 'N/A'}</div>
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
          <div style="font-size:12px;color:#6b7280">${summary.rawScore}/${summary.maxRawScore} pts</div>
          ${
              sr.globalModifier && sr.globalModifier.value !== 0
                  ? `<div style="font-size:11px;color:#f59e0b;margin-top:4px">Modifier: ${sr.globalModifier.value > 0 ? '+' : ''}${sr.globalModifier.value}${sr.globalModifier.type === 'percentage' ? '%' : 'pts'}
               ${sr.globalModifier.reason ? `(${sr.globalModifier.reason})` : ''}</div>`
                  : ''
          }
        </div>
      </div>

      ${gridHtml}

      ${
          sr.overallComment
              ? `
        <div style="margin-top:18px;page-break-inside: avoid;padding:14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
          <strong style="font-size:12px;color:#374151">Overall Comment:</strong>
          <p style="margin:6px 0 0;font-size:13px;color:#475569">${parseMd(sr.overallComment)}</p>
        </div>`
              : ''
      }

      <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:right">
        Generated by Rubric Maker · ${new Date().toLocaleDateString()}
        ${sr.isPeerReview ? ' · Peer Review' : ''}
      </div>
  </div>`;
}

function buildEmptyRubricHTML(rubric: Rubric): string {
    const fmt = rubric.format;
    const gridHtml = buildRubricGridHtml(rubric);

    return `
  <div class="print-page" style="page-break-after: always; font-family: ${fmt.fontFamily}; color: #1e293b; background: #fff;">
      <div style="margin-bottom:18px">
        <h1 style="margin:0;font-size:20px">${rubric.name}</h1>
        ${rubric.subject ? `<div style="color:#6b7280;margin-top:4px;font-size:13px">${rubric.subject}</div>` : ''}
        ${rubric.description ? `<div style="color:#6b7280;margin-top:4px;font-size:12px">${rubric.description}</div>` : ''}
      </div>

      ${gridHtml}

      <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:right">
        Generated by Rubric Maker · ${new Date().toLocaleDateString()}
      </div>
  </div>`;
}

/** Google Fonts CSS2 family params for decorative export fonts that need loading before print. */
const EXPORT_GOOGLE_FONTS: Record<string, string> = {
    'Playfair Display': 'Playfair+Display:wght@400;700',
    Oswald: 'Oswald:wght@400;500;700',
    'Bebas Neue': 'Bebas+Neue',
    'Special Elite': 'Special+Elite',
    'Courier Prime': 'Courier+Prime:wght@400;700',
};

export function googleFontsLinkFor(fontFamily?: string): string {
    if (!fontFamily) return '';
    const tokens = new Set(fontFamily.split(',').map((part) => part.trim().replace(/^['"]|['"]$/g, '')));
    const families = Object.keys(EXPORT_GOOGLE_FONTS).filter((name) => tokens.has(name));
    if (families.length === 0) return '';
    const familyParams = families.map((name) => `family=${EXPORT_GOOGLE_FONTS[name]}`).join('&');
    return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${familyParams}&display=swap">`;
}

export function printHtml(html: string, orientation?: 'portrait' | 'landscape', fontFamily?: string) {
    return new Promise<void>((resolve) => {
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
            const fontLink = googleFontsLinkFor(fontFamily);
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    ${fontLink}
                    <style>
                        @page { size: ${orientation === 'landscape' ? 'landscape' : 'portrait'}; margin: 10mm; }
                        body { margin: 0; }
                    </style>
                </head>
                <body>
                    ${html}
                </body>
                </html>
            `);
            doc.close();

            setTimeout(
                () => {
                    iframe.contentWindow?.focus();
                    iframe.contentWindow?.print();
                    setTimeout(() => {
                        document.body.removeChild(iframe);
                        resolve();
                    }, 100);
                },
                fontLink ? 800 : 500
            );
        } else {
            resolve();
        }
    });
}

export async function exportSinglePdf(
    sr: StudentRubric,
    rubric: Rubric,
    student: Student,
    scale: GradeScale | null,
    options: { orientation?: 'portrait' | 'landscape' } = {}
): Promise<void> {
    const htmlStr = buildRubricHTML(sr, rubric, student, scale);
    await printHtml(htmlStr, options.orientation || rubric.format.orientation || 'portrait', rubric.format.fontFamily);
}

export async function exportBatchPdf(
    entries: { sr: StudentRubric; student: Student }[],
    rubric: Rubric,
    scale: GradeScale | null,
    options: { orientation?: 'portrait' | 'landscape'; padForDoubleSided?: boolean } = {}
): Promise<void> {
    const htmlParts = entries.map(({ sr, student }, index) => {
        // For double-sided mode: break-before: right lets the browser insert a blank
        // page only when needed so each student always starts on the front of a sheet.
        return buildRubricHTML(sr, rubric, student, scale, options.padForDoubleSided === true && index > 0);
    });
    await printHtml(
        htmlParts.join(''),
        options.orientation || rubric.format.orientation || 'portrait',
        rubric.format.fontFamily
    );
}

export async function exportRubricGridPdf(rubric: Rubric): Promise<void> {
    const htmlStr = buildEmptyRubricHTML(rubric);
    await printHtml(htmlStr, rubric.format.orientation || 'portrait', rubric.format.fontFamily);
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
    student?: Student
): string {
    const questions = calcQuestionBreakdowns(studentId, studentTests, test);
    const skills = calcSkillBreakdowns(studentId, studentTests, test);
    const questionsById = new Map(test.questions.map((q) => [q.id, q]));

    const questionRows = questions
        .map((qb, i) => {
            const question = questionsById.get(qb.questionId);
            const color = BUCKET_COLOR[qb.bucket];
            return `<tr style="page-break-inside: avoid;">
        <td style="padding:8px 10px;border:1px solid #d1d5db;font-size:12px;width:60%">Q${i + 1}. ${question?.prompt ?? ''}</td>
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
        <h1 style="margin:0;font-size:20px">${test.name}</h1>
        <div style="margin-top:8px;font-size:14px"><strong>Student:</strong> ${student ? student.name : 'Whole class'}</div>
      </div>

      <h2 style="font-size:14px;margin:18px 0 8px">Per-question accuracy</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 10px;text-align:left;font-size:12px;border:1px solid #d1d5db">Question</th>
            <th style="padding:8px 10px;text-align:center;font-size:12px;border:1px solid #d1d5db">Accuracy</th>
            <th style="padding:8px 10px;text-align:center;font-size:12px;border:1px solid #d1d5db">Submissions</th>
          </tr>
        </thead>
        <tbody>${questionRows}</tbody>
      </table>

      ${
          skills.length > 0
              ? `
      <h2 style="font-size:14px;margin:18px 0 8px">Strong / weak points by standard or descriptor</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 10px;text-align:left;font-size:12px;border:1px solid #d1d5db">Standard / descriptor</th>
            <th style="padding:8px 10px;text-align:center;font-size:12px;border:1px solid #d1d5db">Accuracy</th>
            <th style="padding:8px 10px;text-align:center;font-size:12px;border:1px solid #d1d5db">Submissions</th>
          </tr>
        </thead>
        <tbody>${skillRows}</tbody>
      </table>`
              : ''
      }

      <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:right">
        Generated by Rubric Maker · ${new Date().toLocaleDateString()}
      </div>
  </div>`;
}

export async function exportTestSummaryPdf(
    studentId: string | null,
    studentTests: StudentTest[],
    test: Test,
    student?: Student
): Promise<void> {
    const htmlStr = buildTestSummaryHTML(studentId, studentTests, test, student);
    await printHtml(htmlStr, 'portrait');
}

export async function exportBatchTestSummaryPdf(
    entries: { studentId: string; student: Student }[],
    studentTests: StudentTest[],
    test: Test
): Promise<void> {
    const htmlParts = entries.map(({ studentId, student }) =>
        buildTestSummaryHTML(studentId, studentTests, test, student)
    );
    await printHtml(htmlParts.join(''), 'portrait');
}
