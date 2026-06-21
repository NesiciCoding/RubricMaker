import {
    Document,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    WidthType,
    TextRun,
    AlignmentType,
    HeadingLevel,
    PageOrientation,
    PageBreak,
} from 'docx';
import { saveAs } from 'file-saver';
import type {
    Rubric,
    RubricCriterion,
    StudentRubric,
    Student,
    GradeScale,
    StudentTest,
    Test,
    TestStrengthBucket,
} from '../types';
import { calcGradeSummary } from './gradeCalc';
import { calcQuestionBreakdowns, calcSkillBreakdowns } from './testSummaryAggregator';

/** Extracts the first font name from a CSS font-family stack (e.g. "'Playfair Display', Georgia, serif" -> "Playfair Display"). */
export function extractDocxFontName(fontFamily?: string): string | undefined {
    if (!fontFamily) return undefined;
    const first = fontFamily
        .split(',')[0]
        ?.trim()
        .replace(/^['"]|['"]$/g, '');
    return first || undefined;
}

/** Default document styles honoring the rubric's chosen export font, applied to body text and headings. */
export function buildDocxStyles(fontFamily?: string) {
    const font = extractDocxFontName(fontFamily);
    if (!font) return undefined;
    return {
        default: {
            document: { run: { font } },
            heading1: { run: { font } },
            heading2: { run: { font } },
        },
    };
}

export async function exportRubricToDocx(rubric: Rubric) {
    const fmt = rubric.format;

    // Helper to get ordered levels
    const getLevels = (c: RubricCriterion) => (fmt.levelOrder === 'worst-first' ? [...c.levels].reverse() : c.levels);

    const headerLevels = rubric.criteria[0] ? getLevels(rubric.criteria[0]) : [];

    // Helper to parse basic markdown to TextRuns
    const parseMd = (text: string, baseStyle?: any): TextRun[] => {
        if (!text) return [new TextRun({ text: '', ...baseStyle })];

        // Handle newlines
        const lines = text.split('\n');
        const runs: TextRun[] = [];

        lines.forEach((line, lineIdx) => {
            // Very naive regex for bold (**bold**) and italics (*italic*)
            const parts = line.split(/(\*\*.*?\*\*|\*.*?\*)/g);
            parts.forEach((part) => {
                if (!part) return;
                let bold = false;
                let italics = false;
                let content = part;

                if (part.startsWith('**') && part.endsWith('**')) {
                    bold = true;
                    content = part.slice(2, -2);
                } else if (part.startsWith('*') && part.endsWith('*')) {
                    italics = true;
                    content = part.slice(1, -1);
                }

                runs.push(
                    new TextRun({
                        text: content,
                        bold: bold || baseStyle?.bold,
                        italics: italics || baseStyle?.italics,
                        ...baseStyle,
                    })
                );
            });

            // Add a line break text run at the end of each line, except the last
            if (lineIdx < lines.length - 1) {
                runs.push(new TextRun({ break: 1 }));
            }
        });

        return runs;
    };

    // Create Table Header
    const headerRow = new TableRow({
        tableHeader: true,
        children: [
            new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                children: [
                    new Paragraph({
                        children: [new TextRun({ text: 'Criterion', bold: true, color: 'FFFFFF' })],
                        alignment: AlignmentType.LEFT,
                    }),
                ],
                shading: { fill: fmt.headerColor.replace('#', '') },
            }),
            ...headerLevels.map((l) => {
                const pointsStr = fmt.showPoints
                    ? ` (${l.minPoints === l.maxPoints ? l.maxPoints : `${l.minPoints}-${l.maxPoints}`} pts)`
                    : '';
                return new TableCell({
                    width: { size: 75 / headerLevels.length, type: WidthType.PERCENTAGE },
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({ text: l.label, bold: true, color: 'FFFFFF' }),
                                ...(pointsStr ? [new TextRun({ text: pointsStr, size: 20, color: 'FFFFFF' })] : []),
                            ],
                            alignment: AlignmentType.CENTER,
                        }),
                    ],
                    shading: { fill: fmt.headerColor.replace('#', '') },
                });
            }),
        ],
    });

    // Create Table Body
    const rows = rubric.criteria.map((c) => {
        const levels = getLevels(c);
        return new TableRow({
            children: [
                // Criterion Cell
                new TableCell({
                    children: [
                        new Paragraph({
                            children: [new TextRun({ text: c.title, bold: true })],
                        }),
                        ...(c.description
                            ? [
                                  new Paragraph({
                                      children: parseMd(c.description, { size: 20, color: '666666' }),
                                  }),
                              ]
                            : []),
                        ...(fmt.showWeights
                            ? [
                                  new Paragraph({
                                      children: [
                                          new TextRun({ text: `Weight: ${c.weight}%`, size: 18, color: '666666' }),
                                      ],
                                      spacing: { before: 100 },
                                  }),
                              ]
                            : []),
                    ],
                    width: { size: 25, type: WidthType.PERCENTAGE },
                    shading: { fill: 'F8F9FA' },
                }),
                // Level Cells
                ...levels.map((l) => {
                    const subItemParagraphs = l.subItems.map((si) => {
                        const max = si.maxPoints ?? si.points ?? 1;
                        return new Paragraph({
                            children: [
                                new TextRun({ text: '[ ] ', size: 18, color: '666666' }),
                                new TextRun({ text: si.label, size: 18, color: '666666' }),
                                new TextRun({ text: ` (${si.minPoints ?? 0}-${max} pts)`, size: 16, color: '888888' }),
                            ],
                            spacing: { before: 60 },
                        });
                    });

                    return new TableCell({
                        children: [
                            new Paragraph({
                                children: l.description ? parseMd(l.description) : [new TextRun({ text: '—' })],
                            }),
                            ...(fmt.showPoints
                                ? [
                                      new Paragraph({
                                          children: [
                                              new TextRun({
                                                  text: `${l.minPoints === l.maxPoints ? l.maxPoints : `${l.minPoints}-${l.maxPoints}`} pts`,
                                                  bold: true,
                                              }),
                                          ],
                                          alignment: AlignmentType.RIGHT,
                                          spacing: { before: 100 },
                                      }),
                                  ]
                                : []),
                            ...(l.subItems.length > 0
                                ? [
                                      new Paragraph({
                                          children: [], // spacing paragraph
                                          spacing: { before: 100 },
                                      }),
                                      ...subItemParagraphs,
                                  ]
                                : []),
                        ],
                        width: { size: 75 / levels.length, type: WidthType.PERCENTAGE },
                    });
                }),
            ],
        });
    });

    const doc = new Document({
        styles: buildDocxStyles(fmt.fontFamily),
        sections: [
            {
                properties: {
                    page: {
                        size: {
                            orientation:
                                fmt.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
                        },
                    },
                },
                children: [
                    new Paragraph({
                        text: rubric.name,
                        heading: HeadingLevel.HEADING_1,
                        spacing: { after: 200 },
                    }),
                    ...(rubric.subject
                        ? [
                              new Paragraph({
                                  text: rubric.subject,
                                  heading: HeadingLevel.HEADING_2,
                                  spacing: { after: 400 },
                              }),
                          ]
                        : []),
                    new Table({
                        rows: [headerRow, ...rows],
                        width: { size: 100, type: WidthType.PERCENTAGE },
                    }),
                ],
            },
        ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${rubric.name.replace(/[^a-z0-9]/gi, '_')}_rubric.docx`);
}

/** Export graded results for multiple students into a single DOCX file, one page per student. */
export async function exportBatchDocx(
    entries: { sr: StudentRubric; student: Student }[],
    rubric: Rubric,
    scale: GradeScale | null
): Promise<void> {
    const fmt = rubric.format;

    const parseMdSimple = (text: string): TextRun[] => {
        if (!text) return [new TextRun('')];
        // Strip basic HTML tags from TipTap output
        const stripped = text
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return [new TextRun(stripped)];
    };

    const children: (Paragraph | Table)[] = [];

    entries.forEach(({ sr, student }, idx) => {
        const effectiveRubric = sr.rubricSnapshot ?? rubric;
        const summary = calcGradeSummary(sr, effectiveRubric.criteria, scale, effectiveRubric);

        // Page break before every student except the first
        if (idx > 0) {
            children.push(new Paragraph({ children: [new PageBreak()] }));
        }

        // Student name heading
        children.push(
            new Paragraph({
                text: student.name,
                heading: HeadingLevel.HEADING_1,
                spacing: { after: 120 },
                ...(idx > 0 ? { pageBreakBefore: false } : {}),
            })
        );

        // Score summary line
        const gradeText = scale
            ? `${summary.letterGrade} · ${summary.modifiedPercentage.toFixed(1)}% · ${summary.rawScore}/${summary.configuredMaxPoints} pts`
            : `${summary.modifiedPercentage.toFixed(1)}% · ${summary.rawScore}/${summary.configuredMaxPoints} pts`;
        children.push(
            new Paragraph({
                children: [new TextRun({ text: gradeText, bold: true, size: 24 })],
                spacing: { after: 240 },
            })
        );

        // Per-criterion results table
        const isSinglePoint = effectiveRubric.scoringMode === 'single-point';
        const headerFill = fmt.headerColor.replace('#', '');

        const tableRows = isSinglePoint
            ? [
                  // Single-point 3-column header: Not Yet | Proficiency Standard | Exceeds
                  new TableRow({
                      tableHeader: true,
                      children: ['Not Yet', 'Proficiency Standard', 'Exceeds'].map(
                          (label) =>
                              new TableCell({
                                  children: [
                                      new Paragraph({
                                          children: [new TextRun({ text: label, bold: true, color: 'FFFFFF' })],
                                          alignment: AlignmentType.CENTER,
                                      }),
                                  ],
                                  width: { size: 33, type: WidthType.PERCENTAGE },
                                  shading: { fill: headerFill },
                              })
                      ),
                  }),
                  // Single-point data rows
                  ...effectiveRubric.criteria.map((c) => {
                      const entry = sr.entries.find((e) => e.criterionId === c.id);
                      const outcome = entry?.singlePointOutcome;
                      const comment = entry?.comment
                          ? entry.comment
                                .replace(/<[^>]*>/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim()
                          : '';
                      const profDesc = c.levels[0]?.description ?? c.description ?? '';

                      const notYetRuns: TextRun[] = [
                          new TextRun({ text: outcome === 'not-yet' ? '✗ Not Yet' : '', bold: true }),
                      ];
                      if (outcome === 'not-yet' && comment)
                          notYetRuns.push(new TextRun({ text: `\n${comment}`, break: 1 }));

                      const centerRuns: TextRun[] = [new TextRun({ text: c.title, bold: true })];
                      if (profDesc) centerRuns.push(new TextRun({ text: `\n${profDesc}`, break: 1, color: '555555' }));
                      if (outcome === 'meets' && comment)
                          centerRuns.push(new TextRun({ text: `\n${comment}`, break: 1, italics: true }));

                      const exceedsRuns: TextRun[] = [
                          new TextRun({ text: outcome === 'exceeds' ? '▲ Exceeds' : '', bold: true }),
                      ];
                      if (outcome === 'exceeds' && comment)
                          exceedsRuns.push(new TextRun({ text: `\n${comment}`, break: 1 }));

                      return new TableRow({
                          children: [
                              new TableCell({
                                  children: [new Paragraph({ children: notYetRuns })],
                                  width: { size: 33, type: WidthType.PERCENTAGE },
                                  shading: outcome === 'not-yet' ? { fill: 'FEE2E2' } : { fill: 'F8F9FA' },
                              }),
                              new TableCell({
                                  children: [new Paragraph({ children: centerRuns })],
                                  width: { size: 34, type: WidthType.PERCENTAGE },
                                  shading: outcome === 'meets' ? { fill: 'DBEAFE' } : {},
                              }),
                              new TableCell({
                                  children: [new Paragraph({ children: exceedsRuns })],
                                  width: { size: 33, type: WidthType.PERCENTAGE },
                                  shading: outcome === 'exceeds' ? { fill: 'D1FAE5' } : { fill: 'F8F9FA' },
                              }),
                          ],
                      });
                  }),
              ]
            : [
                  // Standard 3-column header: Criterion | Level / Outcome | Comment
                  new TableRow({
                      tableHeader: true,
                      children: ['Criterion', 'Level / Outcome', 'Comment'].map(
                          (label, ci) =>
                              new TableCell({
                                  children: [
                                      new Paragraph({
                                          children: [new TextRun({ text: label, bold: true, color: 'FFFFFF' })],
                                      }),
                                  ],
                                  width: { size: ci === 0 ? 25 : ci === 1 ? 25 : 50, type: WidthType.PERCENTAGE },
                                  shading: { fill: headerFill },
                              })
                      ),
                  }),
                  // Standard data rows
                  ...effectiveRubric.criteria.map((c) => {
                      const entry = sr.entries.find((e) => e.criterionId === c.id);
                      let levelLabel = '—';
                      if (entry?.singlePointOutcome) {
                          levelLabel =
                              entry.singlePointOutcome === 'exceeds'
                                  ? '▲ Exceeds'
                                  : entry.singlePointOutcome === 'meets'
                                    ? '✓ Meets'
                                    : '✗ Not yet';
                      } else if (entry?.levelId) {
                          const level = c.levels.find((l) => l.id === entry.levelId);
                          levelLabel = level ? level.label : '—';
                      }
                      const comment = entry?.comment
                          ? entry.comment
                                .replace(/<[^>]*>/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim()
                          : '';
                      return new TableRow({
                          children: [
                              new TableCell({
                                  children: [new Paragraph({ children: [new TextRun({ text: c.title, bold: true })] })],
                                  width: { size: 25, type: WidthType.PERCENTAGE },
                                  shading: { fill: 'F8F9FA' },
                              }),
                              new TableCell({
                                  children: [new Paragraph({ children: [new TextRun(levelLabel)] })],
                                  width: { size: 25, type: WidthType.PERCENTAGE },
                              }),
                              new TableCell({
                                  children: [new Paragraph({ children: parseMdSimple(comment) })],
                                  width: { size: 50, type: WidthType.PERCENTAGE },
                              }),
                          ],
                      });
                  }),
              ];

        children.push(
            new Table({
                rows: tableRows,
                width: { size: 100, type: WidthType.PERCENTAGE },
            })
        );

        // Overall comment
        if (sr.overallComment) {
            const overall = sr.overallComment
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            children.push(
                new Paragraph({
                    children: [new TextRun({ text: 'Overall comment: ', bold: true }), new TextRun(overall)],
                    spacing: { before: 200 },
                })
            );
        }
    });

    const doc = new Document({
        styles: buildDocxStyles(fmt.fontFamily),
        sections: [
            {
                properties: {
                    page: {
                        size: {
                            orientation:
                                fmt.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
                        },
                    },
                },
                children,
            },
        ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${rubric.name.replace(/[^a-z0-9]/gi, '_')}_grades.docx`);
}

/** Same thresholds as bucketForAccuracy() in testSummaryAggregator.ts — keep these in sync. */
const TEST_BUCKET_COLOR: Record<TestStrengthBucket, string> = {
    strong: '10B981',
    developing: 'F59E0B',
    weak: 'EF4444',
};

function buildTestSummaryChildren(
    studentId: string | null,
    studentTests: StudentTest[],
    test: Test,
    student?: Student
) {
    const questions = calcQuestionBreakdowns(studentId, studentTests, test);
    const skills = calcSkillBreakdowns(studentId, studentTests, test);
    const questionsById = new Map(test.questions.map((q) => [q.id, q]));

    const headerRow = (labels: string[]) =>
        new TableRow({
            tableHeader: true,
            children: labels.map(
                (label, i) =>
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: label, bold: true, color: 'FFFFFF' })],
                                alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
                            }),
                        ],
                        width: { size: i === 0 ? 60 : 20, type: WidthType.PERCENTAGE },
                        shading: { fill: '1f2937' },
                    })
            ),
        });

    const breakdownRow = (label: string, accuracyPct: number, bucket: TestStrengthBucket, sampleSize: number) =>
        new TableRow({
            children: [
                new TableCell({
                    children: [new Paragraph({ children: [new TextRun(label)] })],
                    width: { size: 60, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `${accuracyPct.toFixed(0)}%`,
                                    bold: true,
                                    color: TEST_BUCKET_COLOR[bucket],
                                }),
                            ],
                            alignment: AlignmentType.CENTER,
                        }),
                    ],
                    width: { size: 20, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                    children: [
                        new Paragraph({
                            children: [new TextRun({ text: String(sampleSize), color: '666666' })],
                            alignment: AlignmentType.CENTER,
                        }),
                    ],
                    width: { size: 20, type: WidthType.PERCENTAGE },
                }),
            ],
        });

    const questionTable = new Table({
        rows: [
            headerRow(['Question', 'Accuracy', 'Submissions']),
            ...questions.map((qb, i) =>
                breakdownRow(
                    `Q${i + 1}. ${questionsById.get(qb.questionId)?.prompt ?? ''}`,
                    qb.accuracyPct,
                    qb.bucket,
                    qb.sampleSize
                )
            ),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
    });

    const children: (Paragraph | Table)[] = [
        new Paragraph({ text: test.name, heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }),
        new Paragraph({
            children: [
                new TextRun({ text: 'Student: ', bold: true }),
                new TextRun(student ? student.name : 'Whole class'),
            ],
            spacing: { after: 240 },
        }),
        new Paragraph({ text: 'Per-question accuracy', heading: HeadingLevel.HEADING_2, spacing: { after: 120 } }),
        questionTable,
    ];

    if (skills.length > 0) {
        children.push(
            new Paragraph({
                text: 'Strong / weak points by standard or descriptor',
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 240, after: 120 },
            }),
            new Table({
                rows: [
                    headerRow(['Standard / descriptor', 'Accuracy', 'Submissions']),
                    ...skills.map((sb) => breakdownRow(sb.label, sb.accuracyPct, sb.bucket, sb.sampleSize)),
                ],
                width: { size: 100, type: WidthType.PERCENTAGE },
            })
        );
    }

    return children;
}

export async function exportTestSummaryDocx(
    studentId: string | null,
    studentTests: StudentTest[],
    test: Test,
    student?: Student
): Promise<void> {
    const doc = new Document({
        sections: [{ children: buildTestSummaryChildren(studentId, studentTests, test, student) }],
    });
    const blob = await Packer.toBlob(doc);
    const namePart = student ? student.name : 'class';
    saveAs(blob, `${test.name.replace(/[^a-z0-9]/gi, '_')}_${namePart.replace(/[^a-z0-9]/gi, '_')}_summary.docx`);
}

export async function exportBatchTestSummaryDocx(
    entries: { studentId: string; student: Student }[],
    studentTests: StudentTest[],
    test: Test
): Promise<void> {
    const children: (Paragraph | Table)[] = [];
    entries.forEach(({ studentId, student }, idx) => {
        if (idx > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
        children.push(...buildTestSummaryChildren(studentId, studentTests, test, student));
    });

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${test.name.replace(/[^a-z0-9]/gi, '_')}_summary_batch.docx`);
}
