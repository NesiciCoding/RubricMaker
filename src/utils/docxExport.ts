import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, TextRun, AlignmentType, HeadingLevel, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';
import type { Rubric, RubricCriterion } from '../types';

export async function exportRubricToDocx(rubric: Rubric) {
    const fmt = rubric.format;

    // Helper to get ordered levels
    const getLevels = (c: RubricCriterion) =>
        fmt.levelOrder === 'worst-first' ? [...c.levels].reverse() : c.levels;

    const headerLevels = rubric.criteria[0] ? getLevels(rubric.criteria[0]) : [];

    // Create Table Header
    const headerRow = new TableRow({
        tableHeader: true,
        children: [
            new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                children: [
                    new Paragraph({
                        children: [new TextRun({ text: "Criterion", bold: true, color: "FFFFFF" })],
                        alignment: AlignmentType.LEFT
                    })
                ],
                shading: { fill: fmt.headerColor.replace('#', '') },
            }),
            ...headerLevels.map(l => {
                const pointsStr = fmt.showPoints
                    ? ` (${l.minPoints === l.maxPoints ? l.maxPoints : `${l.minPoints}-${l.maxPoints}`} pts)`
                    : '';
                return new TableCell({
                    width: { size: 75 / headerLevels.length, type: WidthType.PERCENTAGE },
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({ text: l.label, bold: true, color: "FFFFFF" }),
                                ...(pointsStr ? [new TextRun({ text: pointsStr, size: 20, color: "FFFFFF" })] : [])
                            ],
                            alignment: AlignmentType.CENTER
                        })
                    ],
                    shading: { fill: fmt.headerColor.replace('#', '') },
                });
            })
        ]
    });

    // Create Table Body
    const rows = rubric.criteria.map(c => {
        const levels = getLevels(c);
        return new TableRow({
            children: [
                // Criterion Cell
                new TableCell({
                    children: [
                        new Paragraph({
                            children: [new TextRun({ text: c.title, bold: true })]
                        }),
                        ...(c.description ? [new Paragraph({
                            children: [new TextRun({ text: c.description, size: 20, color: "666666" })]
                        })] : []),
                        ...(fmt.showWeights ? [new Paragraph({
                            children: [new TextRun({ text: `Weight: ${c.weight}%`, size: 18, color: "666666" })],
                            spacing: { before: 100 }
                        })] : [])
                    ],
                    width: { size: 25, type: WidthType.PERCENTAGE },
                    shading: { fill: "F8F9FA" }
                }),
                // Level Cells
                ...levels.map(l => new TableCell({
                    children: [
                        new Paragraph({
                            children: [new TextRun({ text: l.description || "—" })]
                        }),
                        ...(fmt.showPoints ? [new Paragraph({
                            children: [new TextRun({ text: `${l.minPoints === l.maxPoints ? l.maxPoints : `${l.minPoints}-${l.maxPoints}`} pts`, bold: true })],
                            alignment: AlignmentType.RIGHT,
                            spacing: { before: 100 }
                        })] : [])
                    ],
                    width: { size: 75 / levels.length, type: WidthType.PERCENTAGE }
                }))
            ]
        });
    });

    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({
                    text: rubric.name,
                    heading: HeadingLevel.HEADING_1,
                    spacing: { after: 200 }
                }),
                ...(rubric.subject ? [new Paragraph({
                    text: rubric.subject,
                    heading: HeadingLevel.HEADING_2,
                    spacing: { after: 400 }
                })] : []),
                new Table({
                    rows: [headerRow, ...rows],
                    width: { size: 100, type: WidthType.PERCENTAGE }
                })
            ]
        }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${rubric.name.replace(/[^a-z0-9]/gi, '_')}_rubric.docx`);
}
