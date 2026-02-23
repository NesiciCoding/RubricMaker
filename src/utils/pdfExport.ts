import type { Rubric, Student, StudentRubric, GradeScale } from '../types';
import { calcGradeSummary } from './gradeCalc';

// We dynamically import jsPDF and html2canvas to avoid SSR issues
async function getLibs() {
  const [jsPDFModule, html2canvasModule, JSZipModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
    import('jszip'),
  ]);
  return {
    jsPDF: jsPDFModule.jsPDF,
    html2canvas: html2canvasModule.default,
    JSZip: JSZipModule.default,
  };
}

function buildRubricHTML(
  sr: StudentRubric,
  rubric: Rubric,
  student: Student,
  scale: GradeScale,
): string {
  const summary = calcGradeSummary(sr, rubric.criteria, scale);
  const fmt = rubric.format;

  const levelHeaders = rubric.criteria[0]?.levels ?? [];
  const orderedLevels = (criterion: typeof rubric.criteria[0]) =>
    fmt.levelOrder === 'worst-first' ? [...criterion.levels].reverse() : criterion.levels;

  const rows = rubric.criteria.map(c => {
    const entry = sr.entries.find(e => e.criterionId === c.id);
    const levels = orderedLevels(c);
    const cells = levels.map(l => {
      const isSelected = entry?.levelId === l.id || entry?.overridePoints !== undefined;
      const selected = entry?.levelId === l.id;
      return `<td style="padding:10px 12px;border:1px solid #d1d5db;vertical-align:top;font-size:12px;${selected ? `background:${fmt.accentColor}22;border-color:${fmt.accentColor};font-weight:600;` : ''}">
        ${l.description || '–'}
        ${fmt.showPoints ? `<br/><small style="color:${selected ? fmt.accentColor : '#6b7280'}">${l.minPoints === l.maxPoints ? l.maxPoints : `${l.minPoints}-${l.maxPoints}`}pts</small>` : ''}
      </td>`;
    }).join('');
    const comment = entry?.comment ? `<div style="font-size:10px;color:#6b7280;margin-top:4px;font-style:italic">${entry.comment}</div>` : '';
    return `<tr>
      <td style="padding:10px 12px;border:1px solid #d1d5db;font-weight:600;font-size:12px;background:#f8fafc;min-width:${fmt.criterionColWidth}px">
        ${c.title}
        ${c.description ? `<div style="font-size:10px;color:#6b7280;font-weight:400">${c.description}</div>` : ''}
        ${comment}
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

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: ${fmt.fontFamily}; margin: 0; padding: 24px; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
    <div>
      <h1 style="margin:0;font-size:20px">${rubric.name}</h1>
      ${rubric.subject ? `<div style="color:#6b7280;margin-top:4px;font-size:13px">${rubric.subject}</div>` : ''}
      <div style="margin-top:8px;font-size:14px"><strong>Student:</strong> ${student.name}</div>
      ${student.email ? `<div style="font-size:13px;color:#6b7280">${student.email}</div>` : ''}
      <div style="font-size:12px;color:#6b7280;margin-top:4px">Graded: ${sr.gradedAt ? new Date(sr.gradedAt).toLocaleDateString() : 'N/A'}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:42px;font-weight:800;color:${summary.gradeColor};line-height:1">${summary.letterGrade}</div>
      <div style="font-size:16px;font-weight:600;color:#374151">${summary.modifiedPercentage.toFixed(1)}%</div>
      <div style="font-size:12px;color:#6b7280">${summary.rawScore}/${summary.maxRawScore} pts</div>
      ${sr.globalModifier && sr.globalModifier.value !== 0
      ? `<div style="font-size:11px;color:#f59e0b;margin-top:4px">Modifier: ${sr.globalModifier.value > 0 ? '+' : ''}${sr.globalModifier.value}${sr.globalModifier.type === 'percentage' ? '%' : 'pts'}
           ${sr.globalModifier.reason ? `(${sr.globalModifier.reason})` : ''}</div>`
      : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr style="background:${fmt.headerColor};color:${fmt.headerTextColor}">
        <th style="padding:12px 14px;text-align:left;font-size:12px;min-width:${fmt.criterionColWidth}px">Criterion</th>
        ${headerCells}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  ${sr.overallComment ? `
    <div style="margin-top:18px;padding:14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
      <strong style="font-size:12px;color:#374151">Overall Comment:</strong>
      <p style="margin:6px 0 0;font-size:13px;color:#475569">${sr.overallComment}</p>
    </div>` : ''}

  <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:right">
    Generated by Rubric Maker · ${new Date().toLocaleDateString()}
    ${sr.isPeerReview ? ' · Peer Review' : ''}
  </div>
</body>
</html>`;
}

export async function exportSinglePdf(
  sr: StudentRubric,
  rubric: Rubric,
  student: Student,
  scale: GradeScale,
  options: { orientation?: 'portrait' | 'landscape' } = {}
): Promise<void> {
  const { jsPDF, html2canvas } = await getLibs();
  const orientation = options.orientation || 'portrait';
  const widthStr = orientation === 'landscape' ? '1250px' : '900px';

  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${widthStr};background:#fff;`;
  container.innerHTML = buildRubricHTML(sr, rubric, student, scale);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let yOffset = 0;
    while (yOffset < imgH) {
      if (yOffset > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -yOffset, imgW, imgH);
      yOffset += pageH;
    }
    pdf.save(`${student.name.replace(/[^a-z0-9]/gi, '_')}_${rubric.name.replace(/[^a-z0-9]/gi, '_')}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

export async function exportBatchPdf(
  entries: { sr: StudentRubric; student: Student }[],
  rubric: Rubric,
  scale: GradeScale,
  options: { orientation?: 'portrait' | 'landscape', combineAll?: boolean } = {}
): Promise<void> {
  const { jsPDF, html2canvas, JSZip } = await getLibs();
  const orientation = options.orientation || 'portrait';
  const widthStr = orientation === 'landscape' ? '1250px' : '900px';

  let combinedPdf: any = null;
  if (options.combineAll) {
    combinedPdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  }
  const zip = new JSZip();
  let firstCombinedPage = true;

  for (const { sr, student } of entries) {
    const container = document.createElement('div');
    container.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${widthStr};background:#fff;`;
    container.innerHTML = buildRubricHTML(sr, rubric, student, scale);
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = options.combineAll ? combinedPdf : new jsPDF({ orientation, unit: 'mm', format: 'a4' });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let yOffset = 0;
      let studentFirstPage = true;
      while (yOffset < imgH) {
        if (options.combineAll) {
          if (!firstCombinedPage) pdf.addPage();
          firstCombinedPage = false;
        } else {
          if (!studentFirstPage) pdf.addPage();
          studentFirstPage = false;
        }
        pdf.addImage(imgData, 'JPEG', 0, -yOffset, imgW, imgH);
        yOffset += pageH;
      }

      if (!options.combineAll) {
        const pdfBlob = pdf.output('blob');
        zip.file(`${student.name.replace(/[^a-z0-9]/gi, '_')}_${rubric.name.replace(/[^a-z0-9]/gi, '_')}.pdf`, pdfBlob);
      }
    } finally {
      document.body.removeChild(container);
    }
  }

  if (options.combineAll) {
    combinedPdf.save(`${rubric.name.replace(/[^a-z0-9]/gi, '_')}_all_grades.pdf`);
  } else {
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rubric.name.replace(/[^a-z0-9]/gi, '_')}_grades.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

function buildEmptyRubricHTML(rubric: Rubric): string {
  const fmt = rubric.format;
  const levelHeaders = rubric.criteria[0]?.levels ?? [];
  const orderedLevels = (criterion: typeof rubric.criteria[0]) =>
    fmt.levelOrder === 'worst-first' ? [...criterion.levels].reverse() : criterion.levels;

  const rows = rubric.criteria.map(c => {
    const levels = orderedLevels(c);
    const cells = levels.map(l => {
      return `<td style="padding:10px 12px;border:1px solid #d1d5db;vertical-align:top;font-size:12px;">
        ${l.description || '–'}
        ${fmt.showPoints ? `<br/><small style="color:#6b7280">${l.minPoints === l.maxPoints ? l.maxPoints : `${l.minPoints}-${l.maxPoints}`}pts</small>` : ''}
      </td>`;
    }).join('');
    return `<tr>
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

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: ${fmt.fontFamily}; margin: 0; padding: 24px; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div style="margin-bottom:18px">
    <h1 style="margin:0;font-size:20px">${rubric.name}</h1>
    ${rubric.subject ? `<div style="color:#6b7280;margin-top:4px;font-size:13px">${rubric.subject}</div>` : ''}
    ${rubric.description ? `<div style="color:#6b7280;margin-top:4px;font-size:12px">${rubric.description}</div>` : ''}
  </div>

  <table>
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
</body>
</html>`;
}

export async function exportRubricGridPdf(rubric: Rubric, orientation: 'portrait' | 'landscape' = 'portrait'): Promise<void> {
  const { jsPDF, html2canvas } = await getLibs();
  const widthStr = orientation === 'landscape' ? '1250px' : '900px';

  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${widthStr};background:#fff;`;
  container.innerHTML = buildEmptyRubricHTML(rubric);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let yOffset = 0;
    while (yOffset < imgH) {
      if (yOffset > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -yOffset, imgW, imgH);
      yOffset += pageH;
    }
    pdf.save(`${rubric.name.replace(/[^a-z0-9]/gi, '_')}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
