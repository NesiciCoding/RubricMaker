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
});
