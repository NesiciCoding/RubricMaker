import { describe, it, expect } from 'vitest';
import '../i18n';
import type { Test } from '../types';
import {
    DEFAULT_TEST_PREVIEW_OPTIONS,
    buildExamBookletHtml,
    buildTestPreviewHtml,
    buildTestPreviewSections,
} from './testExamExportHtml';
import { DEFAULT_EXAM_EXPORT_OPTIONS } from './testExamContent';

function makeTest(extra: Partial<Test> = {}): Test {
    return {
        id: 't1',
        name: 'Unit quiz',
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        questions: [
            {
                id: 'q1',
                type: 'multiple-choice',
                points: 3,
                prompt: 'Capital of France?',
                partialCredit: true,
                options: [
                    { id: 'o1', text: 'Paris', isCorrect: true },
                    { id: 'o2', text: 'Berlin', isCorrect: false },
                ],
            },
        ],
        ...extra,
    };
}

describe('test A4 preview html', () => {
    it('renders the title, name box and numbered questions with points', () => {
        const { top, questions } = buildTestPreviewSections(makeTest(), DEFAULT_TEST_PREVIEW_OPTIONS);
        expect(top).toContain('Unit quiz');
        expect(questions).toContain('Capital of France?');
        expect(questions).toContain('3 pts');
    });

    it('hides points and shows the answer key only when asked', () => {
        const student = buildTestPreviewSections(makeTest(), { answerKey: false, showPoints: false }).questions;
        expect(student).not.toContain('3 pts');
        expect(student).not.toContain('#16a34a');
        const key = buildTestPreviewSections(makeTest(), { answerKey: true, showPoints: true }).questions;
        expect(key).toContain('#16a34a');
    });

    it('places sanitised header, intro and footer around the questions and skips empty ones', () => {
        const html = buildTestPreviewHtml(
            makeTest({
                printHeader: '<p>Springfield High</p><script>x()</script>',
                printIntro: '<p>Read well</p>',
                printFooter: '<p></p>',
            }),
            DEFAULT_TEST_PREVIEW_OPTIONS
        );
        expect(html.indexOf('Springfield High')).toBeLessThan(html.indexOf('Unit quiz'));
        expect(html.indexOf('Unit quiz')).toBeLessThan(html.indexOf('Read well'));
        expect(html.indexOf('Read well')).toBeLessThan(html.indexOf('Capital of France?'));
        expect(html).not.toContain('<script');
        expect(html.match(/exam-rich/g)?.length).toBeGreaterThan(0);
    });

    it('also prints the header, intro and footer on the exam booklet export', () => {
        const html = buildExamBookletHtml(
            makeTest({
                printHeader: '<p>Letterhead</p>',
                printIntro: '<p>Be quiet</p>',
                printFooter: '<p>Good luck</p>',
            }),
            DEFAULT_EXAM_EXPORT_OPTIONS
        );
        expect(html).toContain('Letterhead');
        expect(html).toContain('Be quiet');
        expect(html).toContain('Good luck');
    });
});

describe('hasRichContent', () => {
    it('is false for blank markup and true for text or images, even with split script tags', async () => {
        const { hasRichContent } = await import('./exportDataPrep');
        expect(hasRichContent(undefined)).toBe(false);
        expect(hasRichContent('<p> </p>')).toBe(false);
        expect(hasRichContent('<scr<script>ipt>x</scr</script>ipt>')).toBe(true);
        expect(hasRichContent('<p><img src="a.png"></p>')).toBe(true);
        expect(hasRichContent('<p>Hi</p>')).toBe(true);
    });
});
