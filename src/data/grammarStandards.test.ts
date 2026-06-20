import { describe, it, expect } from 'vitest';
import { GRAMMAR_CATEGORIES, getGrammarItems, getGrammarItemById } from './grammarStandards';

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

    it('looks up an item by id', () => {
        const item = getGrammarItemById('gr-past-simple-irregular');
        expect(item?.detectShorthand).toBe('PAST.SIMPLE.IRREG');
    });

    it('every item id is unique', () => {
        const ids = getGrammarItems().map((i) => i.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
