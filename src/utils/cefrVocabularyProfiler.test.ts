import { describe, it, expect } from 'vitest';
import { profileText } from './cefrVocabularyProfiler';

describe('profileText', () => {
    it('returns A1 estimated level for very basic text', () => {
        const result = profileText('the cat sat on the mat the dog ran fast today');
        // Very short common words — level should be low
        expect(['A1', 'A2']).toContain(result.estimatedLevel);
    });

    it('returns a higher estimated level for academic/B2-level vocabulary', () => {
        const text =
            'The phenomenon of globalisation has fundamentally transformed contemporary economic structures. ' +
            'Significant disparities in wealth distribution persist despite unprecedented technological advancement. ' +
            'Furthermore, the escalation of environmental degradation necessitates immediate legislative intervention.';
        const result = profileText(text);
        expect(['B1', 'B2', 'C1', 'C2']).toContain(result.estimatedLevel);
    });

    it('returns levelCounts with all six CEFR levels', () => {
        const result = profileText('This is a simple test sentence with various words.');
        expect(result.levelCounts).toHaveProperty('A1');
        expect(result.levelCounts).toHaveProperty('A2');
        expect(result.levelCounts).toHaveProperty('B1');
        expect(result.levelCounts).toHaveProperty('B2');
        expect(result.levelCounts).toHaveProperty('C1');
        expect(result.levelCounts).toHaveProperty('C2');
    });

    it('returns no highlights for empty text', () => {
        const result = profileText('');
        expect(result.highlightWords).toEqual([]);
        expect(result.estimatedLevel).toBe('A1');
    });

    it('highlightWords are all at or above estimatedLevel', () => {
        const text = 'The unprecedented magnitude of the catastrophic phenomenon was absolutely extraordinary.';
        const result = profileText(text);
        const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        const estimatedIdx = LEVEL_ORDER.indexOf(result.estimatedLevel);
        result.highlightWords.forEach(({ level }) => {
            expect(LEVEL_ORDER.indexOf(level)).toBeGreaterThanOrEqual(estimatedIdx);
        });
    });

    it('caps highlightWords at 30', () => {
        // Build a text with many high-level words
        const highLevelWords = [
            'unprecedented', 'phenomenon', 'catastrophic', 'extraordinary', 'fundamental',
            'contemporary', 'significant', 'disparities', 'transformation', 'advancement',
            'degradation', 'legislative', 'intervention', 'globalisation', 'theoretical',
            'implication', 'substantial', 'comprehensive', 'accumulated', 'acquisition',
            'controversy', 'demonstrating', 'sophisticated', 'exacerbation', 'presumptuous',
            'manipulation', 'proliferation', 'rationalisation', 'sustainability', 'resilience',
            'amplification', 'supplementary',
        ];
        const result = profileText(highLevelWords.join(' '));
        expect(result.highlightWords.length).toBeLessThanOrEqual(30);
    });

    it('handles text with only stop-words gracefully', () => {
        const result = profileText('the and or but a an in on at by for with');
        expect(result.estimatedLevel).toBe('A1');
    });

    it('is case-insensitive for lookups', () => {
        const lower = profileText('abandon');
        const upper = profileText('ABANDON');
        expect(lower.estimatedLevel).toBe(upper.estimatedLevel);
    });

    it('handles text containing only punctuation without throwing', () => {
        const result = profileText('!!! ??? ... --- ,,, :::');
        expect(result.estimatedLevel).toBe('A1');
        expect(result.highlightWords).toHaveLength(0);
    });

    it('handles a single known word and produces a non-empty levelCounts total', () => {
        // "abandon" is a B1 word in CEFRJ
        const result = profileText('abandon');
        const total = Object.values(result.levelCounts).reduce((s, c) => s + c, 0);
        expect(total).toBeGreaterThan(0);
    });

    it('strips possessives before lookup (word\'s)', () => {
        // "student's" should match "student" (A2)
        const withPossessive = profileText("The student's work was excellent.");
        const withoutPossessive = profileText('The student work was excellent.');
        // Both should resolve to a similar total — not zero
        const totalWith = Object.values(withPossessive.levelCounts).reduce((s, c) => s + c, 0);
        const totalWithout = Object.values(withoutPossessive.levelCounts).reduce((s, c) => s + c, 0);
        expect(totalWith).toBeGreaterThan(0);
        expect(totalWithout).toBeGreaterThan(0);
    });

    it('does not include A1 words in highlightWords when estimatedLevel is A1', () => {
        // If estimated level is A1, A1 words should not appear as highlights (per source logic)
        const result = profileText('the cat sat');
        result.highlightWords.forEach(({ level }) => {
            expect(level).not.toBe('A1');
        });
    });

    it('handles text with em-dashes and en-dashes without throwing', () => {
        const result = profileText('He walked — quickly — toward the destination. She ran—fast.');
        expect(result).toHaveProperty('estimatedLevel');
        expect(Array.isArray(result.highlightWords)).toBe(true);
    });

    it('highlightWords are sorted with highest-level words first', () => {
        const text =
            'The unprecedented magnitude of the catastrophic phenomenon was absolutely extraordinary. ' +
            'Furthermore, the escalation of environmental degradation necessitates immediate intervention.';
        const result = profileText(text);
        const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        for (let i = 1; i < result.highlightWords.length; i++) {
            const prev = LEVEL_ORDER.indexOf(result.highlightWords[i - 1].level);
            const curr = LEVEL_ORDER.indexOf(result.highlightWords[i].level);
            expect(prev).toBeGreaterThanOrEqual(curr);
        }
    });

    it('estimated level uses 5% threshold — a single rare word in a mostly basic text stays low', () => {
        // "abandon" is B1; the rest is very common A1 text. With ~50 common words and 1 rare word,
        // rare words will be < 5% so the estimated level should not jump to B1.
        const manyBasicWords = Array(60).fill('cat dog run eat big').join(' ');
        const result = profileText(manyBasicWords + ' abandon');
        // The single B1 word should be less than 5% of all matched words
        const total = Object.values(result.levelCounts).reduce((s, c) => s + c, 0);
        if (total > 0) {
            expect(['A1', 'A2']).toContain(result.estimatedLevel);
        }
    });

    it('returns correct levelCounts structure with numeric values', () => {
        const result = profileText('The student writes excellent academic essays.');
        for (const count of Object.values(result.levelCounts)) {
            expect(typeof count).toBe('number');
            expect(count).toBeGreaterThanOrEqual(0);
        }
    });
});
