import { describe, it, expect } from 'vitest';
import '../i18n';
import type { Test } from '../types';
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
    it('prints passages at the base size regardless of pasted inline font sizes (inline and attachment)', () => {
        const test = makeTest();
        test.sections = [{ id: 's1', title: 'Reading', content: '<p style="font-size:12pt">Text <b>one</b></p>' }];
        test.questions[0].sectionId = 's1';
        const inline = buildExamBookletHtml(test, { ...DEFAULT_EXAM_EXPORT_OPTIONS, attachmentMode: 'inline' });
        const attachment = buildExamAttachmentHtml(test);
        for (const html of [inline, attachment]) {
            expect(html).toContain('Text <b>one</b>');
            expect(html).not.toContain('font-size:12pt');
        }
    });
});
