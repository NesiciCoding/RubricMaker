import type { Rubric, Student, StudentRubric, GradeScale } from '../types';
import { calcGradeSummary } from './gradeCalc';

function parseMd(text: string) {
    if (!text) return text;
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br/>');
    return html;
}

function buildRubricHTML(
  sr: StudentRubric,
  rubric: Rubric,
  student: Student,
  scale: GradeScale,
): string {
  const summary = calcGradeSummary(sr, rubric.criteria, scale);
  const fmt = rubric.format;

  const orderedLevels = (criterion: typeof rubric.criteria[0]) =>
    fmt.levelOrder === 'worst-first' ? [...criterion.levels].reverse() : criterion.levels;

  const rows = rubric.criteria.map((c, i) => {
    const entry = sr.entries.find(e => e.criterionId === c.id);
    const levels = orderedLevels(c);
    const cells = levels.map(l => {
      const selected = entry?.levelId === l.id;

      const subItemsHtml = l.subItems.length > 0 ? `
        <div style="margin-top:8px;padding-top:6px;border-top:1px solid #e5e7eb;font-size:10px;">
          ${l.subItems.map(si => {
        const legacyChecked = (entry?.checkedSubItems ?? []).includes(si.id);
        const max = si.maxPoints ?? si.points ?? 1;
        let scoreLabel = "";
        if (entry) {
          const currentScore = entry.subItemScores?.[si.id] ?? (legacyChecked ? max : (si.minPoints ?? 0));
          scoreLabel = `[${currentScore}/${max} pts]`;
        } else {
          scoreLabel = `(${si.minPoints ?? 0}-${max} pts)`;
        }
        return `<div style="margin-bottom:3px;">• ${parseMd(si.label)} <span style="color:#6b7280;font-size:9px">${scoreLabel}</span></div>`;
      }).join('')}
        </div>
      ` : '';

      return `<td style="padding:10px 12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};vertical-align:top;font-size:12px;${selected ? `background:${fmt.accentColor}22;border-color:${fmt.accentColor};border-style:solid;border-width:2px;font-weight:600;` : ''}">
        ${parseMd(l.description) || '–'}
        ${fmt.showPoints ? `<br/><small style="color:${selected ? fmt.accentColor : '#6b7280'}">${l.minPoints === l.maxPoints ? l.maxPoints : `${l.minPoints}-${l.maxPoints}`}pts</small>` : ''}
        ${subItemsHtml}
      </td>`;
    }).join('');
    
    const comment = entry?.comment ? `<div style="font-size:10px;color:#6b7280;margin-top:4px;font-style:italic">${parseMd(entry.comment)}</div>` : '';
    const stripeBg = fmt.rowStriping && i % 2 !== 0 ? '#f1f5f9' : '#ffffff';
    
    return `<tr style="background:${stripeBg}; page-break-inside: avoid;">
      <td style="padding:10px 12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};font-weight:600;font-size:12px;background:${stripeBg};min-width:${fmt.criterionColWidth}px">
        ${parseMd(c.title)}
        ${c.description ? `<div style="font-size:10px;color:#6b7280;font-weight:400">${parseMd(c.description)}</div>` : ''}
        ${comment}
        ${fmt.showWeights ? `<div style="font-size:10px;color:#6b7280;margin-top:4px">Weight: ${c.weight}%</div>` : ''}
      </td>
      ${cells}
    </tr>`;
  }).join('');

  const headerCells = (rubric.criteria[0] ? orderedLevels(rubric.criteria[0]) : []).map(l =>
    `<th style="padding:12px 14px;text-align:${fmt.headerTextAlign};border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};min-width:${fmt.levelColWidth}px;font-size:12px">
      ${parseMd(l.label)}${fmt.showPoints ? ` (${l.minPoints === l.maxPoints ? l.maxPoints : `${l.minPoints}-${l.maxPoints}`}pts)` : ''}
    </th>`
  ).join('');

  return `
  <div class="print-page" style="page-break-after: always; font-family: ${fmt.fontFamily}; color: #1e293b; background: #fff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
        <div>
          <h1 style="margin:0;font-size:20px">${rubric.name}</h1>
          ${rubric.subject ? `<div style="color:#6b7280;margin-top:4px;font-size:13px">${rubric.subject}</div>` : ''}
          <div style="margin-top:8px;font-size:14px"><strong>Student:</strong> ${student.name}</div>
          ${student.email ? `<div style="font-size:13px;color:#6b7280">${student.email}</div>` : ''}
          <div style="font-size:12px;color:#6b7280;margin-top:4px">Graded: ${sr.gradedAt ? new Date(sr.gradedAt).toLocaleDateString() : 'N/A'}</div>
        </div>
        <div style="text-align:right">
          ${fmt.showCalculatedGrade !== false ? `
          <div style="font-size:42px;font-weight:800;color:${summary.gradeColor};line-height:1">${summary.letterGrade}</div>
          <div style="font-size:16px;font-weight:600;color:#374151">${summary.modifiedPercentage.toFixed(1)}%</div>
          ` : ''}
          <div style="font-size:12px;color:#6b7280">${summary.rawScore}/${summary.maxRawScore} pts</div>
          ${sr.globalModifier && sr.globalModifier.value !== 0
          ? `<div style="font-size:11px;color:#f59e0b;margin-top:4px">Modifier: ${sr.globalModifier.value > 0 ? '+' : ''}${sr.globalModifier.value}${sr.globalModifier.type === 'percentage' ? '%' : 'pts'}
               ${sr.globalModifier.reason ? `(${sr.globalModifier.reason})` : ''}</div>`
          : ''}
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <thead>
          <tr style="background:${fmt.headerColor};color:${fmt.headerTextColor}">
            <th style="padding:12px 14px;text-align:left;font-size:12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};min-width:${fmt.criterionColWidth}px">Criterion</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      ${sr.overallComment ? `
        <div style="margin-top:18px;page-break-inside: avoid;padding:14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
          <strong style="font-size:12px;color:#374151">Overall Comment:</strong>
          <p style="margin:6px 0 0;font-size:13px;color:#475569">${parseMd(sr.overallComment)}</p>
        </div>` : ''}

      <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:right">
        Generated by Rubric Maker · ${new Date().toLocaleDateString()}
        ${sr.isPeerReview ? ' · Peer Review' : ''}
      </div>
  </div>`;
}

function buildEmptyRubricHTML(rubric: Rubric): string {
  const fmt = rubric.format;
  const orderedLevels = (criterion: typeof rubric.criteria[0]) =>
    fmt.levelOrder === 'worst-first' ? [...criterion.levels].reverse() : criterion.levels;

  const rows = rubric.criteria.map(c => {
    const levels = orderedLevels(c);
    const cells = levels.map(l => {
      const subItemsHtml = l.subItems.length > 0 ? `
        <div style="margin-top:8px;padding-top:6px;border-top:1px solid #e5e7eb;font-size:10px;">
          ${l.subItems.map(si => {
        const max = si.maxPoints ?? si.points ?? 1;
        return `<div style="margin-bottom:3px">[ ] ${si.label} <span style="color:#6b7280;font-size:9px">(${si.minPoints ?? 0}-${max} pts)</span></div>`;
      }).join('')}
        </div>
      ` : '';

      return `<td style="padding:10px 12px;border:1px solid #d1d5db;vertical-align:top;font-size:12px;">
        ${l.description || '–'}
        ${fmt.showPoints ? `<br/><small style="color:#6b7280">${l.minPoints === l.maxPoints ? l.maxPoints : `${l.minPoints}-${l.maxPoints}`}pts</small>` : ''}
        ${subItemsHtml}
      </td>`;
    }).join('');
    
    return `<tr style="page-break-inside: avoid;">
      <td style="padding:10px 12px;border:1px solid #d1d5db;font-weight:600;font-size:12px;background:#f8fafc;min-width:${fmt.criterionColWidth}px">
        ${c.title}
        ${c.description ? `<div style="font-size:10px;color:#6b7280;font-weight:400">${c.description}</div>` : ''}
        ${fmt.showWeights ? `<div style="font-size:10px;color:#6b7280;margin-top:4px">Weight: ${c.weight}%</div>` : ''}
      </td>
      ${cells}
    </tr>`;
  }).join('');

  const headerCells = (rubric.criteria[0] ? orderedLevels(rubric.criteria[0]) : []).map(l =>
    `<th style="padding:12px 14px;text-align:center;min-width:${fmt.levelColWidth}px;font-size:12px">
      ${l.label}${fmt.showPoints ? ` (${l.minPoints === l.maxPoints ? l.maxPoints : `${l.minPoints}-${l.maxPoints}`}pts)` : ''}
    </th>`
  ).join('');

  return `
  <div class="print-page" style="page-break-after: always; font-family: ${fmt.fontFamily}; color: #1e293b; background: #fff;">
      <div style="margin-bottom:18px">
        <h1 style="margin:0;font-size:20px">${rubric.name}</h1>
        ${rubric.subject ? `<div style="color:#6b7280;margin-top:4px;font-size:13px">${rubric.subject}</div>` : ''}
        ${rubric.description ? `<div style="color:#6b7280;margin-top:4px;font-size:12px">${rubric.description}</div>` : ''}
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <thead>
          <tr style="background:${fmt.headerColor};color:${fmt.headerTextColor}">
            <th style="padding:12px 14px;text-align:left;font-size:12px;min-width:${fmt.criterionColWidth}px">Criterion</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:right">
        Generated by Rubric Maker · ${new Date().toLocaleDateString()}
      </div>
  </div>`;
}

function printHtml(html: string, orientation?: 'portrait' | 'landscape') {
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
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
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
            
            setTimeout(() => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                setTimeout(() => {
                    document.body.removeChild(iframe);
                    resolve();
                }, 100);
            }, 500);
        } else {
            resolve();
        }
    });
}

export async function exportSinglePdf(
  sr: StudentRubric,
  rubric: Rubric,
  student: Student,
  scale: GradeScale,
  options: { orientation?: 'portrait' | 'landscape' } = {}
): Promise<void> {
  const htmlStr = buildRubricHTML(sr, rubric, student, scale);
  await printHtml(htmlStr, options.orientation || rubric.format.orientation || 'portrait');
}

export async function exportBatchPdf(
  entries: { sr: StudentRubric; student: Student }[],
  rubric: Rubric,
  scale: GradeScale,
  options: { orientation?: 'portrait' | 'landscape', padForDoubleSided?: boolean } = {}
): Promise<void> {
  const htmlParts = entries.map(({ sr, student }) => {
      let html = buildRubricHTML(sr, rubric, student, scale);
      if (options.padForDoubleSided) {
          html += `<div style="page-break-after: always;"></div>`; // Insert blank page
      }
      return html;
  });
  await printHtml(htmlParts.join(''), options.orientation || rubric.format.orientation || 'portrait');
}

export async function exportRubricGridPdf(rubric: Rubric): Promise<void> {
  const htmlStr = buildEmptyRubricHTML(rubric);
  await printHtml(htmlStr, rubric.format.orientation || 'portrait');
}
