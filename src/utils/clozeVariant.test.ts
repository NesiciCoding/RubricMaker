import { describe, expect, it } from 'vitest';
import { buildEasierClozeVariant, canBuildEasierClozeVariant } from './clozeVariant';
import { parseClozeGaps } from './clozeParse';
import type { TestQuestion } from '../types';

function cloze(prompt: string, patch: Partial<TestQuestion> = {}): TestQuestion {
    return { id: 'q1', type: 'cloze', prompt, points: prompt.split('{{').length - 1, ...patch };
}

describe('buildEasierClozeVariant', () => {
    const fourGaps = 'The {{cat}} sat on the {{mat}} next to the {{dog}} and the {{log}}.';

    it('keeps half the gaps and fills the rest with their answers', () => {
        const variant = buildEasierClozeVariant(cloze(fourGaps), 'dropdown');
        expect(variant).not.toBeNull();
        expect(parseClozeGaps(variant!.prompt)).toHaveLength(2);
        expect(variant!.prompt).toContain('sat on the mat');
        expect(variant!.prompt).toContain('the log.');
    });

    it('turns each kept gap into a dropdown with the correct answer and distractors', () => {
        const variant = buildEasierClozeVariant(cloze(fourGaps), 'dropdown')!;
        expect(variant.type).toBe('cloze-dropdown');
        for (const gap of parseClozeGaps(variant.prompt)) {
            expect(gap.alternatives.length).toBeGreaterThan(1);
            expect(gap.roles?.[0]).toBe('correct');
            expect(gap.roles?.slice(1).every((role) => role === 'wrong')).toBe(true);
        }
    });

    it('builds a shared word bank variant with the distractors beside the gaps', () => {
        const variant = buildEasierClozeVariant(cloze(fourGaps), 'bank')!;
        expect(variant.type).toBe('cloze-bank');
        expect(variant.bankUniqueUse).toBe(true);
        expect(variant.bankDistractors?.length).toBeGreaterThan(0);
        expect(parseClozeGaps(variant.prompt).every((gap) => gap.roles === undefined)).toBe(true);
    });

    it('keeps points comparable and records the source question', () => {
        const source = cloze(fourGaps, { points: 4, partialCredit: false, wordFormation: true, eloRating: 1200 });
        const variant = buildEasierClozeVariant(source, 'dropdown')!;
        expect(variant.id).not.toBe(source.id);
        expect(variant.variantOfQuestionId).toBe(source.id);
        expect(variant.points).toBe(4);
        expect(variant.partialCredit).toBe(false);
        expect(variant.wordFormation).toBeUndefined();
        expect(variant.eloRating).toBeUndefined();
        expect(source.prompt).toBe(fourGaps);
    });

    it('returns null for a non-cloze question or a cloze without gaps', () => {
        expect(buildEasierClozeVariant(cloze('No gaps here'), 'dropdown')).toBeNull();
        expect(buildEasierClozeVariant({ ...cloze(fourGaps), type: 'short-answer' }, 'dropdown')).toBeNull();
        expect(canBuildEasierClozeVariant(cloze('No gaps here'))).toBe(false);
        expect(canBuildEasierClozeVariant(cloze(fourGaps))).toBe(true);
    });
});
