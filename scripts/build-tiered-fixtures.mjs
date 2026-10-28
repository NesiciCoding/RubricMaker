#!/usr/bin/env node
/**
 * Regenerates the redesigned tiered-rubric import fixtures (DOCX + PDF) from the canonical JSON in
 * src/utils/import/__fixtures__/tiered-rubric/. The *.original.* files are the teacher's real sheet
 * and are never rewritten.
 *
 *   node scripts/build-tiered-fixtures.mjs
 *
 * The PDF step needs Chromium (Playwright); set PW_CHROMIUM_PATH to use a specific binary.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    AlignmentType,
    BorderStyle,
    CheckBox,
    Document,
    Packer,
    PageOrientation,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    VerticalAlign,
    VerticalMergeType,
    WidthType,
} from 'docx';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'src/utils/import/__fixtures__/tiered-rubric');
const base = 'grote-opdracht-y1-p1';
const sheet = JSON.parse(fs.readFileSync(path.join(dir, `${base}.json`), 'utf8'));

const PANEL = 'F0EDD3';
const PANEL_ALT = 'F9F4F2';
const FONT = 'Calibri';
// The docx default (MS Gothic) renders as ☒ in LibreOffice when the font is missing.
const CHECKBOX_FONT = 'Segoe UI Symbol';
const hex = (c) => c.replace('#', '').toUpperCase();

// ─── DOCX ─────────────────────────────────────────────────────────────────────

const white = { style: BorderStyle.SINGLE, size: 12, color: 'FFFFFF' };
const borders = { top: white, bottom: white, left: white, right: white };
const run = (text, opts = {}) => new TextRun({ text, font: FONT, size: 20, ...opts });

function panel(children, fill = PANEL) {
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        children,
                        shading: { type: ShadingType.CLEAR, color: 'auto', fill },
                        borders,
                        margins: { top: 80, bottom: 80, left: 140, right: 140 },
                    }),
                ],
            }),
        ],
    });
}

const spacer = () => new Paragraph({ children: [], spacing: { after: 60 } });

function infoBar() {
    const cell = (label, value) =>
        new TableCell({
            children: [new Paragraph({ children: [run(label, { bold: true }), run(` ${value}`)] })],
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: PANEL },
            borders,
            margins: { top: 80, bottom: 80, left: 140, right: 140 },
        });
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [
                    cell(sheet.headerFields.student, '______________________'),
                    cell(sheet.headerFields.tier, sheet.tiers.map((t) => t.short).join(' | ')),
                    cell(sheet.headerFields.verdict, sheet.bands.map((b) => b.code).join(' | ')),
                ],
            }),
        ],
    });
}

function criterionTable(criterion, pageBreak) {
    const critWidth = 22;
    const tierWidth = (100 - critWidth) / sheet.tiers.length;
    const headerCell = (text, width) =>
        new TableCell({
            width: { size: width, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(text, { bold: true })] })],
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: PANEL },
            borders,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
        });
    const rows = [
        new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: [
                headerCell(sheet.criterionHeading, critWidth),
                ...sheet.tiers.map((t) => headerCell(t.label, tierWidth)),
            ],
        }),
    ];
    sheet.bands.forEach((band, bi) => {
        const critCell = new TableCell({
            width: { size: critWidth, type: WidthType.PERCENTAGE },
            verticalMerge: bi === 0 ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE,
            verticalAlign: VerticalAlign.TOP,
            children: bi === 0 ? [new Paragraph({ children: [run(criterion.title, { bold: true, size: 24 })] })] : [],
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: PANEL_ALT },
            borders,
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
        });
        rows.push(
            new TableRow({
                cantSplit: true,
                children: [
                    critCell,
                    ...sheet.tiers.map(
                        (t) =>
                            new TableCell({
                                width: { size: tierWidth, type: WidthType.PERCENTAGE },
                                children: [new Paragraph({ children: [run(`${band.code}:`, { bold: true })] })],
                                shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(band.color) },
                                borders,
                                margins: { top: 20, bottom: 20, left: 100, right: 100 },
                            })
                    ),
                ],
            })
        );
        rows.push(
            new TableRow({
                cantSplit: true,
                children: [
                    new TableCell({
                        width: { size: critWidth, type: WidthType.PERCENTAGE },
                        verticalMerge: VerticalMergeType.CONTINUE,
                        children: [],
                        shading: { type: ShadingType.CLEAR, color: 'auto', fill: PANEL_ALT },
                        borders,
                    }),
                    ...sheet.tiers.map(
                        (t) =>
                            new TableCell({
                                width: { size: tierWidth, type: WidthType.PERCENTAGE },
                                children: criterion.cells[t.id][band.id].map(
                                    (text) =>
                                        new Paragraph({
                                            spacing: { before: 40, after: 80 },
                                            indent: { left: 300, hanging: 300 },
                                            children: [
                                                new CheckBox({
                                                    checked: false,
                                                    checkedState: { value: '2612', font: CHECKBOX_FONT },
                                                    uncheckedState: { value: '2610', font: CHECKBOX_FONT },
                                                }),
                                                new TextRun({ text: '\t', font: FONT, size: 20 }),
                                                run(text),
                                            ],
                                            tabStops: [{ type: 'left', position: 300 }],
                                        })
                                ),
                                borders,
                                margins: { top: 40, bottom: 120, left: 100, right: 100 },
                            })
                    ),
                ],
            })
        );
    });
    return [
        new Paragraph({ pageBreakBefore: pageBreak, children: [], spacing: { after: 0 } }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows }),
    ];
}

async function buildDocx() {
    const doc = new Document({
        creator: 'RubricMaker test fixtures',
        title: sheet.title,
        styles: { default: { document: { run: { font: FONT, size: 20 } } } },
        sections: [
            {
                properties: {
                    page: {
                        size: { orientation: PageOrientation.LANDSCAPE },
                        margin: { top: 720, bottom: 720, left: 720, right: 720 },
                    },
                },
                children: [
                    panel([new Paragraph({ children: [run(sheet.title, { size: 32 })] })]),
                    spacer(),
                    panel([
                        new Paragraph({ children: [run(sheet.requirementsHeading, { bold: true })] }),
                        ...sheet.requirements.map(
                            (r, i) => new Paragraph({ spacing: { before: 40 }, children: [run(`${i + 1}. ${r}`)] })
                        ),
                    ]),
                    spacer(),
                    infoBar(),
                    ...sheet.criteria.flatMap((c, i) => criterionTable(c, i > 0)),
                ],
            },
        ],
    });
    const buf = await Packer.toBuffer(doc);
    fs.writeFileSync(path.join(dir, `${base}.docx`), buf);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function sheetHtml() {
    const cols = `22% repeat(${sheet.tiers.length}, 1fr)`;
    const header = `<div class="row head" style="grid-template-columns:${cols}"><div>${esc(sheet.criterionHeading)}</div>${sheet.tiers
        .map((t) => `<div>${esc(t.label)}</div>`)
        .join('')}</div>`;
    const criteria = sheet.criteria
        .map(
            (c, i) => `
<section class="crit${i > 0 ? ' break' : ''}">
  ${header}
  <div class="row body" style="grid-template-columns:${cols}">
    <div class="name">${esc(c.title)}</div>
    ${sheet.tiers
        .map(
            (t) =>
                `<div class="tier">${sheet.bands
                    .map(
                        (b) =>
                            `<div class="band"><div class="strip" style="background:${b.color}">${esc(b.code)}:</div>${c.cells[
                                t.id
                            ][b.id]
                                .map((s) => `<p><span class="box"></span>${esc(s)}</p>`)
                                .join('')}</div>`
                    )
                    .join('')}</div>`
        )
        .join('')}
  </div>
</section>`
        )
        .join('');
    return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(sheet.title)}</title><style>
@page { size: A4 landscape; margin: 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Carlito, Calibri, sans-serif; font-size: 11.5pt; color: #1f2937;
       font-variant-ligatures: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pill { background: #${PANEL}; border-radius: 10px; padding: 6px 12px; margin-bottom: 6px; }
.title { display: inline-block; font-size: 16pt; }
.req strong { display: block; margin-bottom: 2px; }
.req ol { margin: 0; padding-left: 18px; }
.info { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 6px; padding: 0; background: none; }
.info div { background: #${PANEL}; border-radius: 10px; padding: 6px 12px; }
.row { display: grid; gap: 6px; }
.head { background: #${PANEL}; border-radius: 10px; padding: 4px 0; margin: 6px 0; font-weight: 700; text-align: center; }
.name { background: #${PANEL_ALT}; border-radius: 10px; padding: 10px 12px; font-weight: 700; font-size: 12pt; }
.band { margin-bottom: 12px; }
.strip { border-radius: 4px; padding: 1px 6px; font-weight: 700; margin-bottom: 4px; }
p { margin: 0 0 9px; padding-left: 16px; text-indent: -16px; line-height: 1.25; }
.box { display: inline-block; width: 10px; height: 10px; border: 1px solid #374151; margin-right: 6px; vertical-align: -1px; }
.break { break-before: page; }
.crit { break-inside: avoid; }
</style></head><body>
<div class="pill title">${esc(sheet.title)}</div>
<div class="pill req"><strong>${esc(sheet.requirementsHeading)}</strong><ol>${sheet.requirements
        .map((r) => `<li>${esc(r)}</li>`)
        .join('')}</ol></div>
<div class="info">
  <div><b>${esc(sheet.headerFields.student)}</b> ______________________</div>
  <div><b>${esc(sheet.headerFields.tier)}</b> ${sheet.tiers.map((t) => t.short).join(' | ')}</div>
  <div><b>${esc(sheet.headerFields.verdict)}</b> ${sheet.bands.map((b) => b.code).join(' | ')}</div>
</div>
${criteria}
</body></html>`;
}

async function buildPdf() {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch(
        process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
    );
    try {
        const page = await browser.newPage();
        await page.setContent(sheetHtml(), { waitUntil: 'load' });
        await page.pdf({
            path: path.join(dir, `${base}.pdf`),
            format: 'A4',
            landscape: true,
            printBackground: true,
            preferCSSPageSize: true,
        });
    } finally {
        await browser.close();
    }
}

await buildDocx();
await buildPdf();
console.log(`Wrote ${base}.docx and ${base}.pdf to ${path.relative(root, dir)}`);
