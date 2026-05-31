import { describe, it, expect } from 'vitest';
import { CEFRJ_GRAMMAR } from './cefrjGrammar';
import type { CefrjGrammarItem } from './cefrjGrammar';

const VALID_CEFR_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

describe('CEFRJ_GRAMMAR data integrity', () => {
    it('is a non-empty array', () => {
        expect(Array.isArray(CEFRJ_GRAMMAR)).toBe(true);
        expect(CEFRJ_GRAMMAR.length).toBeGreaterThan(0);
    });

    it('every item has a non-empty string label', () => {
        for (const item of CEFRJ_GRAMMAR) {
            expect(typeof item.label).toBe('string');
            expect(item.label.trim().length).toBeGreaterThan(0);
        }
    });

    it('every item has a non-empty string shorthand', () => {
        for (const item of CEFRJ_GRAMMAR) {
            expect(typeof item.shorthand).toBe('string');
            expect(item.shorthand.trim().length).toBeGreaterThan(0);
        }
    });

    it('every item has a valid CefrLevel', () => {
        for (const item of CEFRJ_GRAMMAR) {
            expect(VALID_CEFR_LEVELS).toContain(item.level);
        }
    });

    it('contains items for all six CEFR levels', () => {
        const levels = new Set(CEFRJ_GRAMMAR.map((item) => item.level));
        for (const level of VALID_CEFR_LEVELS) {
            expect(levels.has(level as CefrjGrammarItem['level'])).toBe(true);
        }
    });

    it('contains A1-level items (basic grammar structures)', () => {
        const a1Items = CEFRJ_GRAMMAR.filter((item) => item.level === 'A1');
        expect(a1Items.length).toBeGreaterThan(0);
    });

    it('contains B1 or higher items (advanced grammar structures)', () => {
        const advancedItems = CEFRJ_GRAMMAR.filter(
            (item) => item.level === 'B1' || item.level === 'B2' || item.level === 'C1' || item.level === 'C2'
        );
        expect(advancedItems.length).toBeGreaterThan(0);
    });

    it('has more than 100 items (sufficient grammar coverage)', () => {
        expect(CEFRJ_GRAMMAR.length).toBeGreaterThan(100);
    });

    it('all items conform to the CefrjGrammarItem interface shape', () => {
        for (const item of CEFRJ_GRAMMAR) {
            expect(item).toHaveProperty('label');
            expect(item).toHaveProperty('level');
            expect(item).toHaveProperty('shorthand');
        }
    });

    it('contains expected modal verb patterns', () => {
        // Modal verbs are fundamental grammar structures that should be present
        const modals = CEFRJ_GRAMMAR.filter((item) => item.shorthand.startsWith('MD.'));
        expect(modals.length).toBeGreaterThan(0);
    });

    it('contains tense/aspect patterns', () => {
        const tenseItems = CEFRJ_GRAMMAR.filter((item) => item.shorthand.startsWith('TA.'));
        expect(tenseItems.length).toBeGreaterThan(0);
    });

    it('contains passive voice patterns', () => {
        const passiveItems = CEFRJ_GRAMMAR.filter((item) => item.shorthand.startsWith('PASS.'));
        expect(passiveItems.length).toBeGreaterThan(0);
    });

    it('level distribution: A1 items outnumber C2 items', () => {
        const a1Count = CEFRJ_GRAMMAR.filter((item) => item.level === 'A1').length;
        const c2Count = CEFRJ_GRAMMAR.filter((item) => item.level === 'C2').length;
        expect(a1Count).toBeGreaterThan(c2Count);
    });
});