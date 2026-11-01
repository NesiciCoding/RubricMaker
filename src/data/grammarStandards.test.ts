import { describe, it, expect } from 'vitest';
import {
    GRAMMAR_CATEGORIES,
    getGrammarItems,
    getGrammarItemById,
    grammarItemToFrameworkDescriptor,
} from './grammarStandards';

describe('grammarStandards', () => {
    it('filters items by CEFR level', () => {
        const a1 = getGrammarItems({ level: 'A1' });
        expect(a1.length).toBeGreaterThan(0);
        expect(a1.every((i) => i.level === 'A1')).toBe(true);
    });

    it('returns all items when no filter given', () => {
        const all = getGrammarItems();
        const total = GRAMMAR_CATEGORIES.reduce((n, c) => n + c.items.length, 0);
        expect(all).toHaveLength(total);
    });

    it('Past Simple has separate regular and irregular standards', () => {
        const pastSimple = GRAMMAR_CATEGORIES.find((c) => c.id === 'past-simple');
        expect(pastSimple).toBeDefined();
        const ids = pastSimple!.items.map((i) => i.id);
        expect(ids).toContain('gr-past-simple-regular');
        expect(ids).toContain('gr-past-simple-irregular');
    });

    it('covers the conjugations of to be and to have at A1–A2', () => {
        for (const id of ['verb-be', 'verb-have']) {
            const category = GRAMMAR_CATEGORIES.find((c) => c.id === id);
            expect(category, id).toBeDefined();
            expect(category!.items.length).toBeGreaterThan(0);
            for (const item of category!.items) {
                expect(['A1', 'A2']).toContain(item.level);
                expect(item.labelNl).toBeTruthy();
                expect(item.examplesEn?.length).toBeGreaterThan(0);
            }
        }
        expect(getGrammarItemById('gr-have-got')?.level).toBe('A1');
        // There is / there are already exists (with a UD detector); the new category must not duplicate it.
        const beLabels = GRAMMAR_CATEGORIES.find((c) => c.id === 'verb-be')!.items.map((i) => i.labelEn);
        expect(beLabels.some((label) => /there is/i.test(label))).toBe(false);
        expect(getGrammarItemById('gr-existential-there')).toBeDefined();
    });

    it('looks up an item by id', () => {
        const item = getGrammarItemById('gr-past-simple-irregular');
        expect(item?.detectShorthand).toBe('PAST.SIMPLE.IRREG');
    });

    it('every item id is unique', () => {
        const ids = getGrammarItems().map((i) => i.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('resolves ids retired by a catalog split to a surviving item', () => {
        const legacyIds = [
            'gr-past-simple-negative-question',
            'gr-future-continuous-perfect',
            'gr-conditional-zero-first',
        ];
        for (const id of legacyIds) {
            expect(getGrammarItemById(id)).toBeDefined();
            expect(grammarItemToFrameworkDescriptor(id)).toBeDefined();
        }
    });
});
