import { describe, it, expect } from 'vitest';
import { evaluateGrammar, buildGrammarComment } from './grammarQualification';
import type { LinkedFrameworkDescriptor } from '../types';

function grammarLink(descriptorId: string, descriptionEn: string): LinkedFrameworkDescriptor {
    return {
        descriptorId,
        framework: 'grammar',
        categoryId: 'past-simple',
        categoryLabelEn: 'Past Simple',
        categoryLabelNl: 'Verleden tijd',
        categoryColor: '#000',
        descriptionEn,
        descriptionNl: descriptionEn,
        level: 'A1',
    };
}

describe('evaluateGrammar', () => {
    it('passes when all auto-detectable structures are demonstrated', () => {
        const linked = [grammarLink('gr-past-simple-irregular', 'Irregular verbs')];
        const result = evaluateGrammar(linked, 'Yesterday I went to school and saw my friend.');
        expect(result.passed).toBe(true);
        expect(result.foundCount).toBe(1);
        expect(result.items[0].found).toBe(true);
    });

    it('flags a missing structure', () => {
        const linked = [grammarLink('gr-past-simple-regular', 'Regular verbs')];
        const result = evaluateGrammar(linked, 'I went and saw and did everything.');
        expect(result.passed).toBe(false);
        expect(result.items[0].found).toBe(false);
    });

    it('marks items without a detect rule as manual-check', () => {
        const linked = [grammarLink('gr-gerund', 'Gerund')];
        const result = evaluateGrammar(linked, 'I enjoy reading books.');
        expect(result.autoDetectableCount).toBe(0);
        expect(result.items[0].autoDetectable).toBe(false);
    });

    it('builds a comment listing found, missing, and manual items', () => {
        const linked = [
            grammarLink('gr-past-simple-irregular', 'Irregular verbs'),
            grammarLink('gr-past-simple-regular', 'Regular verbs'),
            grammarLink('gr-gerund', 'Gerund'),
        ];
        const result = evaluateGrammar(linked, 'I went home.');
        const t = ((key: string) => key) as unknown as Parameters<typeof buildGrammarComment>[1];
        const html = buildGrammarComment(result, t, 'en');
        expect(html).toContain('✔');
        expect(html).toContain('✘');
        expect(html).toContain('⊘');
    });

    it('builds a Dutch comment with Dutch labels when descLang is nl', () => {
        const linked = [grammarLink('gr-past-simple-irregular', 'Irregular verbs')];
        const result = evaluateGrammar(linked, 'I went home.');
        const t = ((key: string) => key) as unknown as Parameters<typeof buildGrammarComment>[1];
        const html = buildGrammarComment(result, t, 'nl');
        expect(html).toContain('Verleden tijd');
        expect(html).toContain('Irregular verbs'); // descriptionNl mirrors descriptionEn in the fixture
    });

    it('counts zero occurrences for an auto-detectable item whose shorthand has no pattern', () => {
        const linked = [grammarLink('gr-gerund', 'Gerund')];
        const result = evaluateGrammar(linked, 'I enjoy reading books.');
        expect(result.items[0].autoDetectable).toBe(false);
        expect(result.items[0].occurrences).toBe(0);
    });
});

describe('evaluateGrammar with UD counts', () => {
    it('uses the parse for mapped items and marks them as such', () => {
        const linked = [grammarLink('gr-present-perfect-simple', 'Present perfect')];
        const result = evaluateGrammar(linked, 'no regex match here', { udCounts: { pres_perf: 2 } });
        expect(result.items[0]).toMatchObject({ autoDetectable: true, found: true, occurrences: 2, detectedBy: 'ud' });
        expect(result.engine).toBe('ud');
    });

    it('sums every construction an item maps to', () => {
        const linked = [grammarLink('gr-passive', 'Be + past participle')];
        const result = evaluateGrammar(linked, '', { udCounts: { passive_past: 1, passive_modal: 2 } });
        expect(result.items[0].occurrences).toBe(3);
    });

    it('makes items detectable that the regex path can only check manually', () => {
        const linked = [grammarLink('gr-question-tags', 'Question tags')];
        expect(evaluateGrammar(linked, "You like tea, don't you?").items[0].autoDetectable).toBe(false);
        const withUd = evaluateGrammar(linked, "You like tea, don't you?", { udCounts: { tag_question: 1 } });
        expect(withUd.items[0]).toMatchObject({ autoDetectable: true, found: true });
    });

    it('reports a mapped construction as not found when the parse did not see it', () => {
        const linked = [grammarLink('gr-past-perfect-simple', 'Past perfect')];
        const result = evaluateGrammar(linked, 'had gone', { udCounts: { pres_perf: 5 } });
        expect(result.items[0]).toMatchObject({ found: false, occurrences: 0, detectedBy: 'ud' });
        expect(result.passed).toBe(false);
    });

    it('falls back to the regex detector for items without a mapping', () => {
        const linked = [
            grammarLink('gr-past-simple-irregular', 'Irregular verbs'),
            grammarLink('gr-plurals-regular', 'Plurals'),
        ];
        const result = evaluateGrammar(linked, 'Yesterday I went home.', { udCounts: {} });
        expect(result.items[0]).toMatchObject({ found: true, detectedBy: 'compromise' });
        expect(result.items[1]).toMatchObject({ autoDetectable: false, detectedBy: undefined });
        expect(result.engine).toBe('compromise');
    });

    it('keeps the old behaviour when no parse is available', () => {
        const linked = [grammarLink('gr-present-perfect-simple', 'Present perfect')];
        const result = evaluateGrammar(linked, 'She has finished the report.');
        expect(result.items[0]).toMatchObject({ found: true, detectedBy: 'compromise' });
        expect(result.engine).toBe('compromise');
    });
});
