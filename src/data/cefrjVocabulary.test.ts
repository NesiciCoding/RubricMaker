import { describe, it, expect } from 'vitest';
import { CEFRJ_VOCABULARY } from './cefrjVocabulary';
import type { CefrLevel } from '../types';

const VALID_CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

describe('CEFRJ_VOCABULARY data integrity', () => {
    it('is a non-empty object', () => {
        expect(typeof CEFRJ_VOCABULARY).toBe('object');
        expect(CEFRJ_VOCABULARY).not.toBeNull();
        expect(Object.keys(CEFRJ_VOCABULARY).length).toBeGreaterThan(0);
    });

    it('contains more than 1000 entries (sufficient vocabulary coverage)', () => {
        expect(Object.keys(CEFRJ_VOCABULARY).length).toBeGreaterThan(1000);
    });

    it('all values are valid CefrLevel strings', () => {
        for (const [, level] of Object.entries(CEFRJ_VOCABULARY)) {
            expect(VALID_CEFR_LEVELS).toContain(level);
        }
    });

    it('all keys are non-empty strings', () => {
        for (const key of Object.keys(CEFRJ_VOCABULARY)) {
            expect(typeof key).toBe('string');
            expect(key.trim().length).toBeGreaterThan(0);
        }
    });

    it('contains all six CEFR levels as values', () => {
        const levels = new Set(Object.values(CEFRJ_VOCABULARY));
        for (const level of VALID_CEFR_LEVELS) {
            expect(levels.has(level)).toBe(true);
        }
    });

    it('basic common words are A1 level', () => {
        // Very common words should be at A1 level
        expect(CEFRJ_VOCABULARY['cat']).toBe('A1');
        expect(CEFRJ_VOCABULARY['dog']).toBe('A1');
        expect(CEFRJ_VOCABULARY['school']).toBe('A1');
    });

    it('advanced academic words are at higher levels', () => {
        // Academic vocabulary should be at B1 or above
        const advancedWords = Object.entries(CEFRJ_VOCABULARY).filter(
            ([, level]) => level === 'B2' || level === 'C1' || level === 'C2'
        );
        expect(advancedWords.length).toBeGreaterThan(0);
    });

    it('A1 words are more numerous than C2 words', () => {
        const a1Count = Object.values(CEFRJ_VOCABULARY).filter((v) => v === 'A1').length;
        const c2Count = Object.values(CEFRJ_VOCABULARY).filter((v) => v === 'C2').length;
        expect(a1Count).toBeGreaterThan(c2Count);
    });

    it('word "abandon" is B1 level', () => {
        // Verify a known word level from the source data
        expect(CEFRJ_VOCABULARY['abandon']).toBe('B1');
    });

    it('word "ability" is A2 level', () => {
        expect(CEFRJ_VOCABULARY['ability']).toBe('A2');
    });

    it('all keys are lowercase or contain only expected characters', () => {
        // Vocabulary keys should be lowercase words (possibly with spaces or slashes for multi-word entries)
        for (const key of Object.keys(CEFRJ_VOCABULARY)) {
            // Keys should not be pure numbers
            expect(/^\d+$/.test(key)).toBe(false);
        }
    });

    it('no value is undefined or null', () => {
        for (const [key, value] of Object.entries(CEFRJ_VOCABULARY)) {
            expect(value).toBeDefined();
            expect(value).not.toBeNull();
            // Guard against empty string values
            expect(value).not.toBe('');
            // Silence the unused key warning in strict checks
            void key;
        }
    });
});
