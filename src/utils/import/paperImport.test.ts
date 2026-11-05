import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseTestFile } from '../testImport';

/**
 * A Word paper built as a real package, read by the real reader: this is the whole document path —
 * file → blocks → sections and items → key → types → ImportedTest — with nothing mocked in between.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
</w:styles>`;

const paragraph = (text: string, styleId?: string): string =>
    `<w:p>${styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const table = (rows: string[][]): string =>
    `<w:tbl>${rows
        .map((cells) => `<w:tr>${cells.map((cell) => `<w:tc>${paragraph(cell)}</w:tc>`).join('')}</w:tr>`)
        .join('')}</w:tbl>`;

async function docxFile(): Promise<File> {
    const zip = new JSZip();
    zip.file(
        '[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
    );
    zip.file('word/styles.xml', STYLES);
    zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>
            ${paragraph('Vocabulary and grammar test', 'Heading1')}
            ${paragraph('Assignment 1 | TO BE (3p in totaal te behalen)', 'Heading1')}
            ${paragraph('Lees de zinnen hieronder en vul de juiste vorm in.')}
            ${paragraph('1. (+) She _____ tall. (1p)')}
            ${paragraph('2. That book is not mine; it is _______. her/ hers (1p)')}
            ${paragraph('3. Snor (1p)')}
            ${table([
                ['QUESTION', 'ANSWER', 'POINTS TO BE AWARDED'],
                ['1', 'is', '1'],
                ['2', 'hers', '1'],
                ['3', 'moustache (mustache mag ook)', '1'],
            ])}
        </w:body></w:document>`
    );
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    return new File([bytes], 'Vocabulary and grammar test Y1.docx');
}

describe('parseTestFile — a Word paper with its key', () => {
    it('imports the paper as a test a teacher can hand out', async () => {
        const result = await parseTestFile(await docxFile());

        expect(result.tests).toHaveLength(1);
        const test = result.tests[0];
        expect(test.name).toBe('Vocabulary and grammar test');
        expect(test.sections).toHaveLength(1);
        expect(test.sections?.[0].title).toBe('Assignment 1 | TO BE (3p in totaal te behalen)');
        expect(test.sections?.[0].content).toBe('<p>Lees de zinnen hieronder en vul de juiste vorm in.</p>');
        expect(test.questions).toHaveLength(3);
        expect(test.questions.map((question) => question.type)).toEqual(['cloze', 'multiple-choice', 'short-answer']);
        expect(test.questions.map((question) => question.points)).toEqual([1, 1, 1]);
        expect(test.questions.every((question) => question.sectionId === test.sections?.[0].id)).toBe(true);
    });

    it('writes the key into the questions: gap answers, the correct option, the accepted translations', async () => {
        const [test] = (await parseTestFile(await docxFile())).tests;

        expect(test.questions[0].prompt).toBe('(+) She {{is}} tall.');
        expect(test.questions[1].options?.map((option) => [option.text, option.isCorrect])).toEqual([
            ['her', false],
            ['hers', true],
        ]);
        expect(test.questions[2].expectedAnswers).toEqual(['moustache']);
    });

    it('reports what it recognised, for the review step before the import is confirmed', async () => {
        const result = await parseTestFile(await docxFile());

        expect(result.review).toBeDefined();
        expect(result.review?.sections).toEqual([
            { title: 'Assignment 1 | TO BE (3p in totaal te behalen)', items: 3, points: 3 },
        ]);
        expect(result.review?.points).toBe(3);
        expect(result.review?.types).toEqual({ cloze: 1, 'multiple-choice': 1, 'short-answer': 1 });
        expect(result.review?.notes).toEqual([
            { item: 'Assignment 1 | TO BE (3p in totaal te behalen) · 3', note: 'mustache mag ook' },
        ]);
    });

    it('reads a paper whose answer key sits above its items', async () => {
        const zip = new JSZip();
        zip.file('word/styles.xml', STYLES);
        zip.file(
            'word/document.xml',
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>
                ${paragraph('ANSWER KEY', 'Heading1')}
                ${table([
                    ['QUESTION', 'ANSWER'],
                    ['1', 'is'],
                ])}
                ${paragraph('Assignment 1 (1p in totaal te behalen)', 'Heading1')}
                ${paragraph('1. She _____ tall. (1p)')}
            </w:body></w:document>`
        );
        const bytes = await zip.generateAsync({ type: 'arraybuffer' });

        const result = await parseTestFile(new File([bytes], 'paper.docx'));

        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].questions[0].prompt).toBe('She {{is}} tall.');
    });
});
