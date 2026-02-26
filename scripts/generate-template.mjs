import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, HeadingLevel, ShadingType, WidthType, AlignmentType } from 'docx';
import fs from 'fs';
import path from 'path';

async function generateSampleTemplate() {
    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({
                    text: 'Sample Rubric Template',
                    heading: HeadingLevel.HEADING_1,
                    spacing: { after: 200 },
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: 'This is a sample template for Rubric Maker. When exporting to Word using this template, the application will read the table below to determine:',
                            italics: true,
                        }),
                    ],
                    spacing: { after: 120 },
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: '1. The color scheme (extracted from the table header background).' }),
                    ],
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: '2. The custom level labels (extracted from the table header columns).' }),
                    ],
                    spacing: { after: 300 },
                }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({
                            tableHeader: true,
                            children: [
                                new TableCell({
                                    width: { size: 20, type: WidthType.PERCENTAGE },
                                    shading: { fill: '00609C', type: ShadingType.CLEAR, color: '00609C' },
                                    children: [new Paragraph({
                                        children: [new TextRun({ text: 'Criterion', color: 'FFFFFF', bold: true })]
                                    })],
                                }),
                                new TableCell({
                                    width: { size: 20, type: WidthType.PERCENTAGE },
                                    shading: { fill: '00609C', type: ShadingType.CLEAR, color: '00609C' },
                                    children: [new Paragraph({
                                        alignment: AlignmentType.CENTER,
                                        children: [new TextRun({ text: 'Exemplary', color: 'FFFFFF', bold: true })]
                                    })],
                                }),
                                new TableCell({
                                    width: { size: 20, type: WidthType.PERCENTAGE },
                                    shading: { fill: '00609C', type: ShadingType.CLEAR, color: '00609C' },
                                    children: [new Paragraph({
                                        alignment: AlignmentType.CENTER,
                                        children: [new TextRun({ text: 'Proficient', color: 'FFFFFF', bold: true })]
                                    })],
                                }),
                                new TableCell({
                                    width: { size: 20, type: WidthType.PERCENTAGE },
                                    shading: { fill: '00609C', type: ShadingType.CLEAR, color: '00609C' },
                                    children: [new Paragraph({
                                        alignment: AlignmentType.CENTER,
                                        children: [new TextRun({ text: 'Developing', color: 'FFFFFF', bold: true })]
                                    })],
                                }),
                                new TableCell({
                                    width: { size: 20, type: WidthType.PERCENTAGE },
                                    shading: { fill: '00609C', type: ShadingType.CLEAR, color: '00609C' },
                                    children: [new Paragraph({
                                        alignment: AlignmentType.CENTER,
                                        children: [new TextRun({ text: 'Beginning', color: 'FFFFFF', bold: true })]
                                    })],
                                })
                            ]
                        }),
                        new TableRow({
                            children: [
                                new TableCell({
                                    children: [new Paragraph({ text: 'Example Criterion' })],
                                }),
                                new TableCell({
                                    children: [new Paragraph({ text: 'Example text for exemplary level.' })],
                                }),
                                new TableCell({
                                    children: [new Paragraph({ text: 'Example text for proficient level.' })],
                                }),
                                new TableCell({
                                    children: [new Paragraph({ text: 'Example text for developing level.' })],
                                }),
                                new TableCell({
                                    children: [new Paragraph({ text: 'Example text for beginning level.' })],
                                })
                            ]
                        })
                    ]
                })
            ],
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    const outPath = path.join(process.cwd(), 'public', 'sample-template.docx');
    fs.writeFileSync(outPath, buffer);
    console.log(`Generated template file at: ${outPath}`);
}

generateSampleTemplate().catch(console.error);
