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

// Manually measures rows in a master iframe and builds perfectly fitting "pages" mapping to the A4 canvas
async function paginateHTML(html: string, widthPx: number, heightPx: number): Promise<HTMLIFrameElement[]> {
  const iframes: HTMLIFrameElement[] = [];

  const master = document.createElement('iframe');
  master.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${widthPx}px;height:20000px;border:none;`;
  document.body.appendChild(master);

  const mdoc = master.contentDocument!;
  mdoc.open();
  mdoc.write(html);
  mdoc.close();

  // Wait for layout/fonts
  await new Promise(r => setTimeout(r, 150));

  const header = mdoc.getElementById('pdf-header');
  const table = mdoc.getElementById('pdf-table');
  const thead = table ? table.querySelector('thead') : null;
  const tbody = table ? table.querySelector('tbody') : null;
  const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
  const footer = mdoc.getElementById('pdf-footer');

  let currentPageDoc: Document | null = null;
  let currentTbody: HTMLElement | null = null;
  let currentContentHeight = 0;
  const maxContentHeight = heightPx - 48; // 24px top/bottom padding

  function startNewPage() {
    const f = document.createElement('iframe');
    f.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${widthPx}px;height:${heightPx}px;border:none;background:#fff;`;
    document.body.appendChild(f);
    iframes.push(f);

    const doc = f.contentDocument!;
    doc.open();
    // Copy the same head and body styles over
    doc.write(`<!DOCTYPE html><html><head>${mdoc.head.innerHTML}</head><body style="padding:24px;margin:0;box-sizing:border-box;"></body></html>`);
    doc.close();

    currentPageDoc = doc;
    currentContentHeight = 0;
    return doc;
  }

  let doc = startNewPage();

  if (header) {
    doc.body.appendChild(header.cloneNode(true));
    currentContentHeight += header.offsetHeight;
  }

  if (table && tbody) {
    let theadHeight = 0;

    const createTable = (targetDoc: Document) => {
      const newTable = targetDoc.createElement('table');
      Array.from(table.attributes).forEach(attr => newTable.setAttribute(attr.name, attr.value));
      if (thead) {
        newTable.appendChild(thead.cloneNode(true));
        if (theadHeight === 0) theadHeight = thead.offsetHeight;
      }
      const newTbody = targetDoc.createElement('tbody');
      newTable.appendChild(newTbody);
      targetDoc.body.appendChild(newTable);
      currentContentHeight += theadHeight;
      return newTbody;
    };

    currentTbody = createTable(doc);

    for (const row of rows) {
      const rowHeight = row.offsetHeight;
      if (currentContentHeight + rowHeight > maxContentHeight && currentTbody.children.length > 0) {
        doc = startNewPage();
        currentTbody = createTable(doc);
      }
      currentTbody.appendChild(row.cloneNode(true));
      currentContentHeight += rowHeight;
    }
  }

  if (footer) {
    const footerHeight = footer.offsetHeight;
    if (currentContentHeight + footerHeight > maxContentHeight && currentContentHeight > 0) {
      doc = startNewPage();
    }
    doc.body.appendChild(footer.cloneNode(true));
  }

  document.body.removeChild(master);

  // Wait for incremental renders
  await new Promise(r => setTimeout(r, 50));
  return iframes;
}

function buildRubricHTML(
  sr: StudentRubric,
  rubric: Rubric,
  student: Student,
  scale: GradeScale,
): string {
  const summary = calcGradeSummary(sr, rubric.criteria, scale);
  const fmt = rubric.format;

  // Simple markdown-to-html converter for export
  const parseMd = (text: string) => {
    if (!text) return text;
    // Replace **bold** with <strong>bold</strong>
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Replace *italic* with <em>italic</em>
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Render newlines as <br/>
    html = html.replace(/\n/g, '<br/>');
    return html;
  };

  const levelHeaders = rubric.criteria[0]?.levels ?? [];
  const orderedLevels = (criterion: typeof rubric.criteria[0]) =>
    fmt.levelOrder === 'worst-first' ? [...criterion.levels].reverse() : criterion.levels;

  const rows = rubric.criteria.map((c, i) => {
    const entry = sr.entries.find(e => e.criterionId === c.id);
    const levels = orderedLevels(c);
    const cells = levels.map(l => {
      const isSelected = entry?.levelId === l.id || entry?.overridePoints !== undefined;
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
    return `<tr style="background:${stripeBg}">
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

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: ${fmt.fontFamily}; margin: 0; padding: 24px; color: #1e293b; box-sizing: border-box; background: #fff; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div id="pdf-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
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

  <table id="pdf-table">
    <thead>
      <tr style="background:${fmt.headerColor};color:${fmt.headerTextColor}">
        <th style="padding:12px 14px;text-align:left;font-size:12px;border:${fmt.showBorders ? '1px solid #d1d5db' : 'none'};min-width:${fmt.criterionColWidth}px">Criterion</th>
        ${headerCells}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div id="pdf-footer">
    ${sr.overallComment ? `
      <div style="margin-top:18px;padding:14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
        <strong style="font-size:12px;color:#374151">Overall Comment:</strong>
        <p style="margin:6px 0 0;font-size:13px;color:#475569">${parseMd(sr.overallComment)}</p>
      </div>` : ''}

    <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:right">
      Generated by Rubric Maker · ${new Date().toLocaleDateString()}
      ${sr.isPeerReview ? ' · Peer Review' : ''}
    </div>
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
  const widthPx = orientation === 'landscape' ? 1250 : 900;
  const aspectRatio = orientation === 'landscape' ? (210 / 297) : (297 / 210);
  const heightPx = widthPx * aspectRatio;

  const htmlStr = buildRubricHTML(sr, rubric, student, scale);
  const iframes = await paginateHTML(htmlStr, widthPx, heightPx);

  try {
    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const imgW = pdf.internal.pageSize.getWidth();
    const imgH = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < iframes.length; i++) {
      if (i > 0) pdf.addPage();
      const canvas = await html2canvas(iframes[i].contentDocument!.body, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
    }
    pdf.save(`${student.name.replace(/[^a-z0-9]/gi, '_')}_${rubric.name.replace(/[^a-z0-9]/gi, '_')}.pdf`);
  } finally {
    iframes.forEach(f => document.body.removeChild(f));
  }
}

export async function exportBatchPdf(
  entries: { sr: StudentRubric; student: Student }[],
  rubric: Rubric,
  scale: GradeScale,
  options: { orientation?: 'portrait' | 'landscape', combineAll?: boolean, padForDoubleSided?: boolean } = {}
): Promise<void> {
  const { jsPDF, html2canvas, JSZip } = await getLibs();
  const orientation = options.orientation || 'portrait';
  const widthPx = orientation === 'landscape' ? 1250 : 900;
  const aspectRatio = orientation === 'landscape' ? (210 / 297) : (297 / 210);
  const heightPx = widthPx * aspectRatio;

  let combinedPdf: any = null;
  if (options.combineAll) {
    combinedPdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  }
  const zip = new JSZip();
  let firstCombinedPage = true;

  for (const { sr, student } of entries) {
    const htmlStr = buildRubricHTML(sr, rubric, student, scale);
    const iframes = await paginateHTML(htmlStr, widthPx, heightPx);

    try {
      const pdf = options.combineAll ? combinedPdf : new jsPDF({ orientation, unit: 'mm', format: 'a4' });
      const imgW = pdf.internal.pageSize.getWidth();
      const imgH = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < iframes.length; i++) {
        if (options.combineAll) {
          if (!firstCombinedPage) {
            pdf.addPage();
          }
          firstCombinedPage = false;
        } else {
          if (i > 0) pdf.addPage();
        }

        const canvas = await html2canvas(iframes[i].contentDocument!.body, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
      }

      // Pad for double-sided if needed (and we are combining all, and there's another student coming)
      if (options.combineAll && options.padForDoubleSided) {
        // pdf.getNumberOfPages() is the total pages in the combined document so far.
        // If it's odd, it means the next student would print on the back of the last page.
        // So we add a blank page.
        const totalPages = pdf.getNumberOfPages();
        if (totalPages % 2 !== 0) {
          pdf.addPage();
        }
      }

      if (!options.combineAll) {
        const pdfBlob = pdf.output('blob');
        zip.file(`${student.name.replace(/[^a-z0-9]/gi, '_')}_${rubric.name.replace(/[^a-z0-9]/gi, '_')}.pdf`, pdfBlob);
      }
    } finally {
      iframes.forEach(f => document.body.removeChild(f));
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
    body { font-family: ${fmt.fontFamily}; margin: 0; padding: 24px; color: #1e293b; box-sizing: border-box; background: #fff; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div id="pdf-header" style="margin-bottom:18px">
    <h1 style="margin:0;font-size:20px">${rubric.name}</h1>
    ${rubric.subject ? `<div style="color:#6b7280;margin-top:4px;font-size:13px">${rubric.subject}</div>` : ''}
    ${rubric.description ? `<div style="color:#6b7280;margin-top:4px;font-size:12px">${rubric.description}</div>` : ''}
  </div>

  <table id="pdf-table">
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
  const widthPx = orientation === 'landscape' ? 1250 : 900;
  const aspectRatio = orientation === 'landscape' ? (210 / 297) : (297 / 210);
  const heightPx = widthPx * aspectRatio;

  const htmlStr = buildEmptyRubricHTML(rubric);
  const iframes = await paginateHTML(htmlStr, widthPx, heightPx);

  try {
    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const imgW = pdf.internal.pageSize.getWidth();
    const imgH = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < iframes.length; i++) {
      if (i > 0) pdf.addPage();
      const canvas = await html2canvas(iframes[i].contentDocument!.body, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
    }
    pdf.save(`${rubric.name.replace(/[^a-z0-9]/gi, '_')}.pdf`);
  } finally {
    iframes.forEach(f => document.body.removeChild(f));
  }
}
