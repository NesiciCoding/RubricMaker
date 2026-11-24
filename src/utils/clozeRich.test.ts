import { describe, expect, it } from 'vitest';
import '../i18n';
import type { Test, TestQuestion } from '../types';
import {
    addGapAlternative,
    isRichClozePrompt,
    parseClozeGaps,
    plainQuestionPromptText,
    renderClozeSegments,
    setDropdownAlternativeRole,
} from './clozeParse';
import { escapeForPrompt, htmlToPlainLines, richClozeHtmlWithBlanks } from './clozeHtml';
import { scoreCloze } from './testCalc';
import { buildEasierClozeVariant } from './clozeVariant';
import { DEFAULT_EXAM_EXPORT_OPTIONS } from './testExamContent';
import { buildExamBookletHtml } from './testExamExportHtml';

const RICH = '<p>The <strong>{{cat|kitten}}</strong> sat &amp; {{a&amp;b}}.</p><ul><li>Then {{ran}}</li></ul>';
const question = (prompt: string, extra: Partial<TestQuestion> = {}): TestQuestion => ({
    id: 'q',
    type: 'cloze',
    points: 3,
    prompt,
    ...extra,
});

describe('formatted cloze prompts', () => {
    it('are told apart from plain ones by their tags', () => {
        expect(isRichClozePrompt(RICH)).toBe(true);
        expect(isRichClozePrompt('The {{cat}} sat. Use x < y and a > b.')).toBe(false);
        expect(isRichClozePrompt('')).toBe(false);
    });

    it('parse their gaps with the entities decoded, in order', () => {
        expect(parseClozeGaps(RICH).map((g) => g.alternatives)).toEqual([['cat', 'kitten'], ['a&b'], ['ran']]);
    });

    it('score like a plain prompt, including an answer with an ampersand', () => {
        const q = question(RICH);
        expect(scoreCloze(q, JSON.stringify({ 0: 'kitten', 1: 'a&b', 2: 'ran' }))).toBe(3);
        expect(scoreCloze(q, JSON.stringify({ 0: 'kitten', 1: 'a&amp;b', 2: 'x' }))).toBe(1);
    });

    it('score a gap with a non-breaking space like the plain prompt does', () => {
        const formatted = question('<p>Visit {{New&nbsp;York}}.</p>');
        const plain = question('Visit {{New\u00a0York}}.');
        const response = JSON.stringify({ 0: 'New\u00a0York' });
        expect(parseClozeGaps(formatted.prompt)[0].alternatives).toEqual(['New\u00a0York']);
        expect(scoreCloze(formatted, response)).toBe(scoreCloze(plain, response));
        expect(scoreCloze(formatted, response)).toBe(formatted.points);
        expect(parseClozeGaps('<p>{{a&amp;nbsp;b}}</p>')[0].alternatives).toEqual(['a&nbsp;b']);
    });

    it('read as visible text and gaps through renderClozeSegments', () => {
        const segments = renderClozeSegments(RICH);
        expect(segments.map((s) => (s.type === 'text' ? s.text : `[${s.gap.alternatives[0]}]`)).join('')).toBe(
            'The [cat] sat & [a&b].\nThen [ran]'
        );
        expect(plainQuestionPromptText(question(RICH))).toBe('The cat sat & a&b.\nThen ran');
    });

    it('leave plain prompts exactly as they were', () => {
        const plain = 'Line one {{a}}\nLine two {{b}}';
        expect(renderClozeSegments(plain).map((s) => (s.type === 'text' ? s.text : '#'))).toEqual([
            'Line one ',
            '#',
            '\nLine two ',
            '#',
        ]);
    });

    it('escape text that is written back into them, and only them', () => {
        expect(escapeForPrompt(RICH, `a<b>&"'`)).toBe('a&lt;b&gt;&amp;&quot;&#39;');
        expect(escapeForPrompt('plain {{x}}', 'a<b>')).toBe('a<b>');
        const updated = addGapAlternative(RICH, 2, 'jogged & <ran>');
        expect(updated).toContain('{{ran|jogged &amp; &lt;ran&gt;}}');
        expect(parseClozeGaps(updated)[2].alternatives).toEqual(['ran', 'jogged & <ran>']);
        expect(parseClozeGaps(setDropdownAlternativeRole('<p>{{a&amp;b|c}}</p>', 0, 1, false))[0].alternatives).toEqual(
            ['a&b', 'c']
        );
    });

    it('survive an easier-copy variant without breaking the markup', () => {
        const q = question('<p><strong>{{cat}}</strong> and {{a&amp;b}} and {{dog}} and {{ran}}</p>');
        const variant = buildEasierClozeVariant(q, 'dropdown');
        expect(variant).not.toBeNull();
        expect(isRichClozePrompt(variant!.prompt)).toBe(true);
        expect(variant!.prompt).toContain('<strong>');
        expect(() => parseClozeGaps(variant!.prompt)).not.toThrow();
    });
});

describe('clozeHtml helpers', () => {
    it('turns paragraphs, list items and breaks into lines', () => {
        expect(htmlToPlainLines('<p>One<br>two</p><p>Three</p><ul><li>Four</li></ul>')).toBe('One\ntwo\nThree\nFour');
    });

    it('prints blanks into sanitised HTML and drops anything unsafe', () => {
        const html = richClozeHtmlWithBlanks(
            '<p>Go <em>{{home}}</em><script>alert(1)</script><img src=x onerror="alert(2)"></p>',
            (i) => `<b>(${i + 1})</b>`
        );
        expect(html).toContain('<em><b>(1)</b></em>');
        expect(html).not.toContain('script');
        expect(html).not.toContain('onerror');
    });
});

describe('formatted cloze in the printed booklet', () => {
    it('keeps the formatting and numbers each gap', () => {
        const test: Test = {
            id: 't',
            name: 'T',
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2026-01-01',
            questions: [question('<p>The <strong>{{cat}}</strong> sat on the {{mat}}.</p>')],
        };
        const html = buildExamBookletHtml(test, DEFAULT_EXAM_EXPORT_OPTIONS);
        expect(html).toContain('<strong><span');
        expect(html).toContain('(1)</span></strong>');
        expect(html).toContain('(2)</span>');
        expect(html).not.toContain('{{');
    });

    it('prints the intro above a formatted cloze, both formatted', () => {
        const test: Test = {
            id: 't',
            name: 'T',
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2026-01-01',
            questions: [
                {
                    ...question('<p>The <strong>{{cat}}</strong> sat.</p>'),
                    clozeIntro: '<p>Read the <em>rules</em> first.</p>',
                },
            ],
        };
        const html = buildExamBookletHtml(test, DEFAULT_EXAM_EXPORT_OPTIONS);
        expect(html).toContain('<em>rules</em>');
        expect(html).toContain('(1)</span></strong>');
        expect(html.indexOf('rules')).toBeLessThan(html.indexOf('(1)'));
    });
});
