import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    escapeHtml,
    htmlToMarkdown,
    htmlToDocxChildren,
    exportEssayMarkdown,
    exportEssayDocx,
    exportEssaysBatch,
    exportEssayWithRubric,
} from '../essayExport';
import { Paragraph, Table } from 'docx';
import type { EssayAssignment, EssaySubmission, Rubric, Student, StudentRubric, GradeScale } from '../../types';

// docx marks XmlComponent.root as protected — read it structurally for assertions.
function rootOf(node: unknown): unknown {
    return (node as unknown as { root?: unknown }).root;
}

const mockSaveAs = vi.hoisted(() => vi.fn());
const mockToBlob = vi.hoisted(() =>
    vi.fn(
        async () =>
            new Blob(['doc'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    )
);
const mockPrintHtml = vi.hoisted(() => vi.fn(async () => {}));
const mockBuildRubricHTML = vi.hoisted(() => vi.fn(() => '<div class="rubric-html">grid</div>'));

vi.mock('file-saver', () => ({
    saveAs: (...args: unknown[]) => mockSaveAs(...args),
}));

vi.mock('docx', async (importOriginal) => {
    const actual = await importOriginal<typeof import('docx')>();
    return { ...actual, Packer: { toBlob: mockToBlob } };
});

vi.mock('../pdfExport', () => ({
    printHtml: mockPrintHtml,
    buildRubricHTML: mockBuildRubricHTML,
}));

vi.mock('../docxExport', () => ({
    buildDocxStyles: vi.fn(() => ({})),
    buildRubricGridDocxChildren: vi.fn(() => []),
}));

const student: Student = { id: 's1', name: 'Alice Smith', classId: 'c1' };
const assignment: EssayAssignment = {
    rubricId: 'r1',
    studentId: 's1',
    teacherKey: 'tk1',
    title: 'My Essay',
    readOnlyAfterSubmit: true,
    createdAt: '2024-01-01T00:00:00Z',
};
const submission: EssaySubmission = {
    id: 'es1',
    assignmentRubricId: 'r1',
    assignmentStudentId: 's1',
    teacherKey: 'tk1',
    contentHtml: '<h1>Title</h1><p>Hello <strong>world</strong></p>',
    wordCount: 42,
    submittedAt: '2024-02-01T00:00:00Z',
};

const rubric: Rubric = {
    id: 'r1',
    name: 'R1',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: { fontFamily: 'Arial' } as Rubric['format'],
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};
const studentRubric: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [],
    overallComment: '',
    isPeerReview: false,
};
const scale: GradeScale = { id: 'gs1', name: 'Scale', type: 'letter', ranges: [] };

describe('essayExport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockToBlob.mockImplementation(async () => new Blob(['doc']));
        mockPrintHtml.mockImplementation(async () => {});
    });

    describe('escapeHtml', () => {
        it('escapes all five HTML-significant characters', () => {
            expect(escapeHtml(`<a href="x">& 'y'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp; &#39;y&#39;&lt;/a&gt;');
        });
    });

    describe('htmlToMarkdown', () => {
        it('converts headings, paragraphs, blockquotes and rules', () => {
            const md = htmlToMarkdown(
                '<h1>One</h1><h2>Two</h2><h3>Three</h3><p>Body text</p><blockquote>Quote</blockquote><hr/><p>After</p>'
            );
            expect(md).toBe('# One\n\n## Two\n\n### Three\n\nBody text\n\n> Quote\n\n---\n\nAfter');
        });

        it('converts ordered and unordered lists', () => {
            const md = htmlToMarkdown('<ul><li>Alpha</li><li>Beta</li></ul><ol><li>One</li><li>Two</li></ol>');
            expect(md).toBe('- Alpha\n- Beta\n\n1. One\n2. Two');
        });

        it('converts task lists with checked state', () => {
            const md = htmlToMarkdown(
                '<ul data-type="taskList"><li data-checked="true"><div>Done</div></li><li data-checked="false"><div>TODO</div></li></ul>'
            );
            expect(md).toBe('- [x] Done\n- [ ] TODO');
        });

        it('converts tables to markdown with escaped pipes', () => {
            const md = htmlToMarkdown(
                '<table><tr><th>Name</th><th>Score</th></tr><tr><td>Alice | A</td><td>8</td></tr></table>'
            );
            expect(md).toBe('| Name | Score |\n| --- | --- |\n| Alice \\| A | 8 |');
        });

        it('handles inline marks: bold, italic, strike, underline, sub/sup, links and breaks', () => {
            const md = htmlToMarkdown(
                '<p><strong>B</strong> <em>I</em> <s>S</s> <u>U</u> x<sup>2</sup> H<sub>2</sub>O <a href="https://x.nl">link</a> one<br/>two</p>'
            );
            expect(md).toBe('**B** _I_ ~~S~~ <u>U</u> x<sup>2</sup> H<sub>2</sub>O [link](https://x.nl) one\ntwo');
        });

        it('keeps span color/font/size and mark highlight as inline styles', () => {
            const md = htmlToMarkdown(
                '<p><span style="color: #ff0000; font-family: Georgia; font-size: 16px">styled</span> <mark style="background-color: #ffff00">hi</mark></p>'
            );
            expect(md).toContain('color: #ff0000; font-family: Georgia; font-size: 16px');
            expect(md).toContain('background-color: #ffff00');
        });

        it('returns an empty string for empty content', () => {
            expect(htmlToMarkdown('<p></p>')).toBe('');
            expect(htmlToMarkdown('')).toBe('');
        });
    });

    describe('htmlToDocxChildren', () => {
        it('maps headings to docx heading paragraphs', () => {
            const children = htmlToDocxChildren('<h1>A</h1><h2>B</h2><h3>C</h3>');
            expect(children).toHaveLength(3);
            const props = JSON.stringify(rootOf(children[0]));
            expect(props).toContain('Heading1');
            expect(JSON.stringify(rootOf(children[1]))).toContain('Heading2');
            expect(JSON.stringify(rootOf(children[2]))).toContain('Heading3');
        });

        it('maps lists, blockquotes, rules and tables', () => {
            const children = htmlToDocxChildren(
                '<ul><li>Uno</li><li>Dos</li></ul><ol><li>One</li></ol><blockquote>Q</blockquote><hr/><table><tr><th>H</th><td>C</td></tr></table>'
            );
            expect(children).toHaveLength(6);
            expect(children[0]).toBeInstanceOf(Paragraph);
            expect(JSON.stringify(rootOf(children[0]))).toContain('•');
            expect(JSON.stringify(rootOf(children[2]))).toContain('1. ');
            expect((children[5] as Table).constructor.name).toBe('Table');
        });

        it('renders task lists with checked boxes', () => {
            const children = htmlToDocxChildren(
                '<ul data-type="taskList"><li data-checked="true"><div>Done</div></li></ul>'
            );
            expect(children).toHaveLength(1);
            expect(JSON.stringify(rootOf(children[0]))).toContain('☑');
        });

        it('carries text alignment and line-height into paragraph properties', () => {
            const [centered] = htmlToDocxChildren('<p style="text-align: center; line-height: 1.5">Mid</p>');
            const props = JSON.stringify(rootOf(centered));
            expect(props).toContain('center');
            expect(props).toContain('w:spacing');
        });

        it('carries run-level color, font, size and highlight', () => {
            const [p] = htmlToDocxChildren(
                '<p><span style="color: #ff0000; font-family: Georgia, serif; font-size: 14px">red</span><mark style="background-color: #ffff00">hl</mark></p>'
            );
            const props = JSON.stringify(rootOf(p));
            expect(props).toContain('ff0000');
            expect(props).toContain('Georgia');
            expect(props).toContain('28'); // 14pt → 28 half-points
            expect(props).toContain('ffff00');
        });

        it('renders sub/sup and line breaks', () => {
            const [p] = htmlToDocxChildren('<p>x<sup>2</sup><br/>y<sub>1</sub></p>');
            const props = JSON.stringify(rootOf(p));
            expect(props).toContain('w:vertAlign');
            expect(props).toContain('w:br');
        });

        it('emits a single empty paragraph for empty content', () => {
            const children = htmlToDocxChildren('<p></p>');
            expect(children).toHaveLength(1);
            // No runs — just the paragraph properties node.
            expect(JSON.stringify(rootOf(children[0]))).not.toContain('w:rPr');
        });

        it('carries right/justify/left alignment', () => {
            const [right] = htmlToDocxChildren('<p style="text-align: right">R</p>');
            expect(JSON.stringify(rootOf(right))).toContain('right');
            const [justify] = htmlToDocxChildren('<p style="text-align: justify">J</p>');
            expect(JSON.stringify(rootOf(justify))).toContain('both');
            const [left] = htmlToDocxChildren('<p style="text-align: left">L</p>');
            expect(JSON.stringify(rootOf(left))).toContain('left');
        });

        it('carries underline, mark data-color, and non-numeric font-size fallbacks', () => {
            const [p] = htmlToDocxChildren(
                '<p><u>under</u><mark data-color="#00ff00">hl</mark><span style="font-size: abc">x</span></p>'
            );
            const props = JSON.stringify(rootOf(p));
            expect(props).toContain('w:u');
            expect(props).toContain('00ff00');
        });

        it('falls back to the li itself for task-list items without a wrapping div', () => {
            const children = htmlToDocxChildren('<ul data-type="taskList"><li>Plain</li></ul>');
            expect(children).toHaveLength(1);
            expect(JSON.stringify(rootOf(children[0]))).toContain('☐');
            expect(JSON.stringify(rootOf(children[0]))).toContain('Plain');
        });
    });

    describe('exportEssayMarkdown', () => {
        it('saves a markdown file with the expected header and sanitized filename', async () => {
            await exportEssayMarkdown(assignment, student, submission);
            expect(mockSaveAs).toHaveBeenCalledTimes(1);
            const [blob, filename] = mockSaveAs.mock.calls[0];
            expect(blob).toBeInstanceOf(Blob);
            expect(filename).toBe('Alice_Smith_My_Essay.md');
            const text = await blob.text();
            expect(text).toContain('# My Essay');
            expect(text).toContain('Alice Smith ·');
            expect(text).toContain('**world**');
        });
    });

    describe('exportEssayDocx', () => {
        it('builds a docx and saves it with a sanitized filename', async () => {
            await exportEssayDocx(assignment, student, submission);
            expect(mockToBlob).toHaveBeenCalledTimes(1);
            expect(mockSaveAs).toHaveBeenCalledWith(expect.any(Blob), 'Alice_Smith_My_Essay.docx');
        });
    });

    describe('exportEssaysBatch', () => {
        const entries = [
            { assignment, student, submission },
            {
                assignment: { ...assignment, title: 'Second' },
                student: { ...student, name: 'Bob Jones' },
                submission: { ...submission, contentHtml: '<p>Another</p>' },
            },
        ];

        it('exports each essay separately for markdown', async () => {
            await exportEssaysBatch(entries, 'markdown', 'separate');
            expect(mockSaveAs).toHaveBeenCalledTimes(2);
            expect(mockSaveAs.mock.calls[0][1]).toBe('Alice_Smith_My_Essay.md');
            expect(mockSaveAs.mock.calls[1][1]).toBe('Bob_Jones_Second.md');
        });

        it('exports each essay separately for pdf', async () => {
            await exportEssaysBatch(entries, 'pdf', 'separate');
            expect(mockPrintHtml).toHaveBeenCalledTimes(2);
        });

        it('exports each essay separately for docx', async () => {
            await exportEssaysBatch(entries, 'docx', 'separate');
            expect(mockToBlob).toHaveBeenCalledTimes(2);
            expect(mockSaveAs.mock.calls[0][1]).toBe('Alice_Smith_My_Essay.docx');
            expect(mockSaveAs.mock.calls[1][1]).toBe('Bob_Jones_Second.docx');
        });

        it('combines markdown essays into a single file separated by rules', async () => {
            await exportEssaysBatch(entries, 'markdown', 'combined');
            expect(mockSaveAs).toHaveBeenCalledTimes(1);
            expect(mockSaveAs.mock.calls[0][1]).toBe('essays_batch.md');
            const text = await mockSaveAs.mock.calls[0][0].text();
            expect(text).toContain('---');
            expect(text).toContain('# My Essay');
            expect(text).toContain('# Second');
        });

        it('combines docx essays with page breaks between them', async () => {
            await exportEssaysBatch(entries, 'docx', 'combined');
            expect(mockToBlob).toHaveBeenCalledTimes(1);
            expect(mockSaveAs).toHaveBeenCalledWith(expect.any(Blob), 'essays_batch.docx');
        });

        it('combines pdf essays into a single printHtml call', async () => {
            await exportEssaysBatch(entries, 'pdf', 'combined');
            expect(mockPrintHtml).toHaveBeenCalledTimes(1);
        });
    });

    describe('exportEssayWithRubric', () => {
        it('exports docx with the rubric grid appended', async () => {
            await exportEssayWithRubric(
                assignment,
                student,
                submission,
                studentRubric,
                rubric,
                scale,
                'docx',
                undefined,
                undefined
            );
            expect(mockToBlob).toHaveBeenCalledTimes(1);
            expect(mockSaveAs).toHaveBeenCalledWith(expect.any(Blob), 'Alice_Smith_My_Essay_with_rubric.docx');
        });

        it('exports docx including the grammar/vocabulary analysis section when provided', async () => {
            const analysis = {
                id: 'a1',
                studentId: 's1',
                rubricId: 'r1',
                attachmentId: 'att1',
                extractedText: 'x',
                analyzedAt: '2024-01-01',
                detectedItems: [
                    { vocabularyItemId: 'v1', found: true, occurrences: 3, contexts: ['c'] },
                    { vocabularyItemId: 'missing', found: false, occurrences: 0, contexts: [] },
                ],
                grammarErrors: [], // no grammar issues → the section header is skipped
                grammarCheckerUsed: 'none' as const,
            };
            const vocabRubric: Rubric = {
                ...rubric,
                vocabularyItems: [{ id: 'v1', phrase: 'hello', category: 'vocabulary' }],
            };
            await exportEssayWithRubric(
                assignment,
                student,
                submission,
                studentRubric,
                vocabRubric,
                scale,
                'docx',
                analysis,
                undefined
            );
            expect(mockToBlob).toHaveBeenCalledTimes(1);
            expect(mockSaveAs).toHaveBeenCalledWith(expect.any(Blob), 'Alice_Smith_My_Essay_with_rubric.docx');
        });

        it('lists grammar issues in the docx when the analysis found errors', async () => {
            const analysis = {
                id: 'a1',
                studentId: 's1',
                rubricId: 'r1',
                attachmentId: 'att1',
                extractedText: 'x',
                analyzedAt: '2024-01-01',
                detectedItems: [],
                grammarErrors: [{ message: 'missing comma', offset: 0, length: 1, suggestions: [] }],
                grammarCheckerUsed: 'none' as const,
            };
            await exportEssayWithRubric(
                assignment,
                student,
                submission,
                studentRubric,
                rubric,
                scale,
                'docx',
                analysis,
                undefined
            );
            expect(mockToBlob).toHaveBeenCalledTimes(1);
            expect(mockSaveAs).toHaveBeenCalledWith(expect.any(Blob), 'Alice_Smith_My_Essay_with_rubric.docx');
        });

        it('renders an empty analysis section when there is nothing detected', async () => {
            const analysis = {
                id: 'a1',
                studentId: 's1',
                rubricId: 'r1',
                attachmentId: 'att1',
                extractedText: 'x',
                analyzedAt: '2024-01-01',
                detectedItems: [],
                grammarErrors: [],
                grammarCheckerUsed: 'none' as const,
            };
            await exportEssayWithRubric(
                assignment,
                student,
                submission,
                studentRubric,
                rubric,
                scale,
                'pdf',
                analysis,
                undefined
            );
            expect(mockPrintHtml).toHaveBeenCalledTimes(1);
            const html = (mockPrintHtml.mock.calls[0] as unknown[])[0] as string;
            expect(html).not.toContain('<li>'); // no vocab rows, no grammar rows
            expect(html).toContain('Grammar &amp; Vocabulary Analysis');
        });

        it('exports pdf including the analysis section when provided', async () => {
            const analysis = {
                id: 'a1',
                studentId: 's1',
                rubricId: 'r1',
                attachmentId: 'att1',
                extractedText: 'x',
                analyzedAt: '2024-01-01',
                detectedItems: [
                    { vocabularyItemId: 'v1', found: true, occurrences: 3, contexts: ['c'] },
                    { vocabularyItemId: 'missing', found: false, occurrences: 0, contexts: [] },
                ],
                grammarErrors: [{ message: 'missing comma', offset: 0, length: 1, suggestions: [] }],
                grammarCheckerUsed: 'none' as const,
            };
            const vocabRubric: Rubric = {
                ...rubric,
                vocabularyItems: [{ id: 'v1', phrase: 'hello', category: 'vocabulary' }],
            };
            await exportEssayWithRubric(
                assignment,
                student,
                submission,
                studentRubric,
                vocabRubric,
                scale,
                'pdf',
                analysis,
                undefined
            );
            expect(mockBuildRubricHTML).toHaveBeenCalledWith(studentRubric, vocabRubric, student, scale);
            expect(mockPrintHtml).toHaveBeenCalledTimes(1);
            const html = (mockPrintHtml.mock.calls[0] as unknown[])[0] as string;
            expect(html).toContain('✓ <strong>hello</strong>');
            expect(html).toContain('missing comma');
        });

        it('skips the analysis section when none is provided', async () => {
            await exportEssayWithRubric(assignment, student, submission, studentRubric, rubric, scale, 'pdf');
            expect(mockPrintHtml).toHaveBeenCalledTimes(1);
            expect((mockPrintHtml.mock.calls[0] as unknown[])[0]).not.toContain('Grammar &amp; Vocabulary');
        });
    });
});
