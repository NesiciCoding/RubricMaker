import {
    AlignmentType,
    BorderStyle,
    CheckBox,
    Document,
    type IStylesOptions,
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
import i18n from 'i18next';
import type { RubricFormat } from '../types';
import { SHEET_PANEL, SHEET_PANEL_ALT, requirementMark, type SheetBand, type TieredSheet } from './tieredSheet';

const docLabel = (key: string, opts?: Record<string, unknown>): string => i18n.t(`exportDoc.${key}`, opts) ?? key;

// docx only accepts 6-digit hex; a rubric colour that isn't one falls back to a neutral tone.
const fill = (color: string | undefined, fallback = 'E5E7EB') => {
    const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color?.trim() ?? '')?.[1];
    if (!hex) return fallback;
    return (hex.length === 3 ? [...hex].map((ch) => ch + ch).join('') : hex).toUpperCase();
};
const shade = (color: string | undefined, fallback?: string) => ({
    type: ShadingType.CLEAR,
    color: 'auto',
    fill: fill(color, fallback),
});
const white = { style: BorderStyle.SINGLE, size: 12, color: 'FFFFFF' };
const borders = { top: white, bottom: white, left: white, right: white };
// The docx default checkbox font (MS Gothic) renders as ☒ where it is missing, e.g. in LibreOffice.
const CHECKBOX_FONT = 'Segoe UI Symbol';

function panel(children: Paragraph[], color = SHEET_PANEL): Table {
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        children,
                        shading: shade(color),
                        borders,
                        margins: { top: 80, bottom: 80, left: 140, right: 140 },
                    }),
                ],
            }),
        ],
    });
}

const spacer = () => new Paragraph({ children: [], spacing: { after: 60 } });

function statementParagraph(label: string, ticked: boolean | undefined): Paragraph {
    return new Paragraph({
        spacing: { before: 40, after: 80 },
        indent: { left: 300, hanging: 300 },
        tabStops: [{ type: 'left', position: 300 }],
        children: [
            new CheckBox({
                checked: !!ticked,
                checkedState: { value: '2612', font: CHECKBOX_FONT },
                uncheckedState: { value: '2610', font: CHECKBOX_FONT },
            }),
            new TextRun('\t'),
            new TextRun(label),
        ],
    });
}

function bandStrip(band: SheetBand): TextRun[] {
    return [
        new TextRun({ text: `${band.code}:`, bold: true }),
        ...(band.chosen ? [new TextRun({ text: ` ✓ ${docLabel('tiered_chosen')}`, bold: true })] : []),
    ];
}

function criterionTable(sheet: TieredSheet, index: number, fmt: Pick<RubricFormat, 'headerColor' | 'headerTextColor'>) {
    const c = sheet.criteria[index];
    const critWidth = sheet.tiers.length > 1 ? 22 : 30;
    const tierWidth = (100 - critWidth) / sheet.tiers.length;
    const headerCell = (text: string, width: number) =>
        new TableCell({
            width: { size: width, type: WidthType.PERCENTAGE },
            children: [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text, bold: true, color: fill(fmt.headerTextColor, 'FFFFFF') })],
                }),
            ],
            shading: shade(fmt.headerColor, '1E293B'),
            borders,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
        });
    const rows = [
        new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: [
                headerCell(docLabel('criterion'), critWidth),
                ...sheet.tiers.map((t) => headerCell(t.label, tierWidth)),
            ],
        }),
    ];
    // Every tier column lists the same bands; the first column decides the rows.
    const bandRows = c.columns[0] ?? [];
    const critCell = (first: boolean) =>
        new TableCell({
            width: { size: critWidth, type: WidthType.PERCENTAGE },
            verticalMerge: first ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE,
            verticalAlign: VerticalAlign.TOP,
            children: first
                ? [
                      new Paragraph({ children: [new TextRun({ text: c.title, bold: true, size: 24 })] }),
                      ...(c.description
                          ? [new Paragraph({ children: [new TextRun({ text: c.description, color: '6B7280' })] })]
                          : []),
                      ...(c.comment
                          ? [
                                new Paragraph({
                                    spacing: { before: 120 },
                                    children: [new TextRun({ text: c.comment, italics: true })],
                                }),
                            ]
                          : []),
                  ]
                : [],
            shading: shade(SHEET_PANEL_ALT),
            borders,
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
        });
    bandRows.forEach((_, bi) => {
        rows.push(
            new TableRow({
                cantSplit: true,
                children: [
                    critCell(bi === 0),
                    ...c.columns.map(
                        (bands) =>
                            new TableCell({
                                width: { size: tierWidth, type: WidthType.PERCENTAGE },
                                children: [new Paragraph({ children: bandStrip(bands[bi]) })],
                                shading: shade(bands[bi].color),
                                borders,
                                margins: { top: 20, bottom: 20, left: 100, right: 100 },
                            })
                    ),
                ],
            }),
            new TableRow({
                cantSplit: true,
                children: [
                    critCell(false),
                    ...c.columns.map(
                        (bands) =>
                            new TableCell({
                                width: { size: tierWidth, type: WidthType.PERCENTAGE },
                                children: bands[bi].statements.length
                                    ? bands[bi].statements.map((s) => statementParagraph(s.label, s.ticked))
                                    : [new Paragraph({ children: [] })],
                                borders,
                                margins: { top: 40, bottom: 120, left: 100, right: 100 },
                            })
                    ),
                ],
            })
        );
    });
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows });
}

/** The tiered sheet as DOCX blocks: title, requirements, info bar, one table per criterion. */
export function tieredSheetDocxChildren(
    sheet: TieredSheet,
    fmt: Pick<RubricFormat, 'headerColor' | 'headerTextColor'>
): (Paragraph | Table)[] {
    const g = sheet.graded;
    const infoCell = (label: string, value: TextRun[]) =>
        new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: `${label} `, bold: true }), ...value] })],
            shading: shade(SHEET_PANEL),
            borders,
            margins: { top: 80, bottom: 80, left: 140, right: 140 },
        });
    const verdict = g?.verdict
        ? [
              new TextRun({ text: ` ${g.verdict.code} `, bold: true, shading: shade(g.verdict.color) }),
              ...(g.verdict.label ? [new TextRun(` ${g.verdict.label}`)] : []),
          ]
        : [new TextRun(g ? '—' : sheet.bands.map((b) => b.code).join(' | '))];

    const children: (Paragraph | Table)[] = [
        panel([
            new Paragraph({
                children: [
                    new TextRun({ text: sheet.title, size: 32 }),
                    ...(sheet.subject ? [new TextRun({ text: `   ${sheet.subject}`, color: '4B5563' })] : []),
                ],
            }),
        ]),
        spacer(),
    ];
    if (sheet.requirements.length) {
        children.push(
            panel([
                new Paragraph({ children: [new TextRun({ text: docLabel('tiered_requirements'), bold: true })] }),
                ...sheet.requirements.map(
                    (r, i) =>
                        new Paragraph({
                            spacing: { before: 40 },
                            children: [
                                g
                                    ? new TextRun({ text: requirementMark(r.met), font: CHECKBOX_FONT })
                                    : new TextRun(`${i + 1}.`),
                                new TextRun(` ${r.text}`),
                                ...(g && r.met === false
                                    ? [
                                          new TextRun({
                                              text: ` (${docLabel('tiered_requirement_not_met')})`,
                                              bold: true,
                                          }),
                                      ]
                                    : []),
                            ],
                        })
                ),
            ]),
            spacer()
        );
    }
    children.push(
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: [
                        infoCell(docLabel('student'), [new TextRun(g ? g.studentName : '______________________')]),
                        infoCell(docLabel('tiered_tier'), [
                            new TextRun(g?.tierLabel ?? sheet.allTierLabels.join(' | ')),
                        ]),
                        infoCell(docLabel('tiered_verdict'), verdict),
                    ],
                }),
            ],
        })
    );
    sheet.criteria.forEach((_, i) => {
        // A blank sheet gives each criterion its own page, like the paper original.
        children.push(
            new Paragraph({ pageBreakBefore: !g && i > 0, children: [], spacing: { after: 60 } }),
            criterionTable(sheet, i, fmt)
        );
    });
    if (g?.overallComment) {
        children.push(
            spacer(),
            panel([
                new Paragraph({
                    children: [
                        new TextRun({ text: `${docLabel('overall_comment')} `, bold: true }),
                        new TextRun(g.overallComment),
                    ],
                }),
            ])
        );
    }
    return children;
}

/** A whole DOCX for one blank sheet; landscape when it prints more than one tier column. */
export function tieredSheetDocument(
    sheet: TieredSheet,
    fmt: Pick<RubricFormat, 'headerColor' | 'headerTextColor' | 'orientation'>,
    styles?: IStylesOptions
): Document {
    return new Document({
        styles,
        sections: [
            {
                properties: {
                    page: {
                        size: {
                            orientation:
                                sheet.tiers.length > 1 || fmt.orientation === 'landscape'
                                    ? PageOrientation.LANDSCAPE
                                    : PageOrientation.PORTRAIT,
                        },
                        margin: { top: 720, bottom: 720, left: 720, right: 720 },
                    },
                },
                children: tieredSheetDocxChildren(sheet, fmt),
            },
        ],
    });
}
