import { describe, it, expect } from 'vitest';
import '../i18n';
import type { Student, Test } from '../types';
import { buildAnswerSheetHtml, buildExamAttachmentHtml, buildExamBookletHtml } from './testExamExportHtml';
import { CHOICE_CELL_WIDTH_MM, CHOICE_CELL_GAP_MM, DEFAULT_EXAM_EXPORT_OPTIONS } from './testExamContent';

function makeTest(): Test {
    return {
        id: 't1',
        name: 'Quiz',
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: new Date().toISOString(),
        questions: [
            {
                id: 'q1',
                type: 'multiple-choice',
                points: 1,
                prompt: 'Capital of France?',
                partialCredit: true,
                options: [
                    { id: 'o1', text: 'Paris', isCorrect: true },
                    { id: 'o2', text: 'Berlin', isCorrect: false },
                ],
            },
        ],
    };
}

describe('buildAnswerSheetHtml choice bubbles', () => {
    it('sizes and spaces MC bubbles from the same CHOICE_CELL_WIDTH_MM/CHOICE_CELL_GAP_MM constants examScanRegions.ts scans against', async () => {
        const html = await buildAnswerSheetHtml(makeTest(), DEFAULT_EXAM_EXPORT_OPTIONS);
        // box-sizing:border-box keeps the border inside the declared width, so the printed pitch
        // (width + gap) matches choiceCellRects()'s assumption exactly instead of growing by the
        // border thickness per cell.
        expect(html).toContain(
            `box-sizing:border-box;width:${CHOICE_CELL_WIDTH_MM}mm;height:${CHOICE_CELL_WIDTH_MM}mm`
        );
        expect(html).toContain(`gap:${CHOICE_CELL_GAP_MM}mm`);
        // Not the old hardcoded px sizing this used to diverge from the scanner geometry with.
        expect(html).not.toContain('width:20px');
        expect(html).not.toContain('gap:14px');
    });
});

describe('buildExamBookletHtml rich prompt', () => {
    it('keeps line breaks, bold, italic and highlight from the question prompt', () => {
        const test = makeTest();
        test.questions[0].prompt =
            '<p>Read <strong>carefully</strong> and <em>think</em></p><p><mark style="background-color:#ff0">key</mark><br>next line</p><script>alert(1)</script>';
        const html = buildExamBookletHtml(test, DEFAULT_EXAM_EXPORT_OPTIONS);
        expect(html).toContain('<strong>carefully</strong>');
        expect(html).toContain('<em>think</em>');
        expect(html).toContain('<mark style="background-color:#ff0">key</mark><br>next line');
        expect(html).not.toContain('<script>');
    });

    it('preserves line breaks in legacy plain-text prompts', () => {
        const test = makeTest();
        test.questions[0].prompt = 'line one\nfish & chips';
        const html = buildExamBookletHtml(test, DEFAULT_EXAM_EXPORT_OPTIONS);
        expect(html).toContain('<p>line one</p><p>fish &amp; chips</p>');
    });
});

describe('reading passage font sizes', () => {
    it('keeps the editor inline font sizes (inline and attachment)', () => {
        const test = makeTest();
        test.sections = [{ id: 's1', title: 'Reading', content: '<p style="font-size:12pt">Text <b>one</b></p>' }];
        test.questions[0].sectionId = 's1';
        const inline = buildExamBookletHtml(test, { ...DEFAULT_EXAM_EXPORT_OPTIONS, attachmentMode: 'inline' });
        const attachment = buildExamAttachmentHtml(test);
        for (const html of [inline, attachment]) {
            expect(html).toContain('Text <b>one</b>');
            expect(html).toContain('font-size:12pt');
        }
    });
});

describe('booklet images and cloze layout', () => {
    it('prints option images, and caps prompt/passage images via the rich-content styles', () => {
        const test = makeTest();
        test.sections = [
            { id: 's1', title: 'Reading', content: '<p>Passage</p><p><img src="data:image/png;base64,AAA"></p>' },
        ];
        test.questions[0].sectionId = 's1';
        test.questions[0].prompt = '<p>Look</p><p><img src="data:image/png;base64,BBB"></p>';
        test.questions[0].options![0].imageUrl = 'data:image/png;base64,CCC';
        const html = buildExamBookletHtml(test, { ...DEFAULT_EXAM_EXPORT_OPTIONS, attachmentMode: 'inline' });
        expect(html).toContain('src="data:image/png;base64,CCC"');
        expect(html).toContain('src="data:image/png;base64,BBB"');
        expect(html).toContain('src="data:image/png;base64,AAA"');
        expect(html).toContain('.exam-rich img{max-width:100%');
        expect(html.match(/class="exam-rich"/g)?.length).toBe(2);
    });

    it('keeps paragraph breaks in cloze questions', () => {
        const test = makeTest();
        test.questions[0] = {
            id: 'c',
            type: 'cloze',
            points: 1,
            prompt: 'Line one {{a}}\nLine two',
        } as Test['questions'][0];
        const html = buildExamBookletHtml(test, DEFAULT_EXAM_EXPORT_OPTIONS);
        expect(html).toContain('white-space:pre-line');
        expect(html).toContain('Line one');
        expect(html).toContain('\nLine two');
    });
});

describe('answer sheet scan markers', () => {
    const students = [
        { id: 's1', name: 'Ann', classId: 'c' },
        { id: 's2', name: 'Bob', classId: 'c' },
    ] as Student[];

    it('gives every student their own margin-wrapped sheet with markers in the repeated header, starting a fresh page between sheets', async () => {
        const html = await buildAnswerSheetHtml(
            makeTest(),
            { ...DEFAULT_EXAM_EXPORT_OPTIONS, scanMarkers: true },
            students
        );
        const sheets = html.split('<table').slice(1);
        expect(sheets).toHaveLength(2);
        expect(sheets[0]).toContain('page-break-after:always');
        expect(sheets[1]).not.toContain('page-break-after:always');
        for (const sheet of sheets) {
            const thead = sheet.slice(sheet.indexOf('<thead>'), sheet.indexOf('</thead>'));
            expect(thead.match(/position:absolute/g)).toHaveLength(4);
            expect(thead).toContain('<img src="data:image/png');
        }
        expect(sheets[0]).toContain('Ann');
        expect(sheets[1]).toContain('Bob');
    });

    it('omits the markers when the option is off', async () => {
        const html = await buildAnswerSheetHtml(makeTest(), DEFAULT_EXAM_EXPORT_OPTIONS, students);
        expect(html).not.toContain('position:absolute');
    });
});

describe('audio notes and point labels', () => {
    it('prints a listen note for audio questions and audio sections', () => {
        const test = makeTest();
        test.sections = [{ id: 's1', title: 'Listening', audioUrl: 'https://example.com/a.mp3' }];
        test.questions[0].sectionId = 's1';
        test.questions[0].audioUrl = 'https://example.com/q.mp3';
        const html = buildExamBookletHtml(test, DEFAULT_EXAM_EXPORT_OPTIONS);
        expect(html.match(/Listen to the recording\./g)).toHaveLength(2);
    });

    it('prints no listen note without audio', () => {
        expect(buildExamBookletHtml(makeTest(), DEFAULT_EXAM_EXPORT_OPTIONS)).not.toContain('Listen to the recording');
    });

    it('formats the margin point label through i18n with plural forms', () => {
        const test = makeTest();
        test.questions.push({ ...test.questions[0], id: 'q2', points: 3 });
        const html = buildExamBookletHtml(test, DEFAULT_EXAM_EXPORT_OPTIONS);
        expect(html).toContain('>1 pt<');
        expect(html).toContain('>3 pts<');
    });
});

describe('teacher header, instructions and footer', () => {
    const withText = (): Test => ({
        ...makeTest(),
        sections: [{ id: 's1', title: 'Reading', content: '<p>Passage</p>' }],
        printHeader: '<p>HDR</p>',
        printIntro: '<p>INTRO</p>',
        printFooter: '<p>FTR</p>',
    });
    it('puts header and instructions on the booklet and attachment cover pages', () => {
        const opts = { ...DEFAULT_EXAM_EXPORT_OPTIONS, attachmentMode: 'separate' as const };
        for (const html of [buildExamBookletHtml(withText(), opts), buildExamAttachmentHtml(withText())]) {
            const afterCover = html.indexOf('Reading');
            expect(html.indexOf('HDR')).toBeLessThan(html.indexOf('Quiz'));
            expect(html.indexOf('INTRO')).toBeLessThan(afterCover);
            expect(html).toContain('FTR');
        }
    });

    it('prints header and footer on the answer sheet', async () => {
        const html = await buildAnswerSheetHtml(withText(), DEFAULT_EXAM_EXPORT_OPTIONS);
        expect(html).toContain('HDR');
        expect(html).toContain('FTR');
    });
});
