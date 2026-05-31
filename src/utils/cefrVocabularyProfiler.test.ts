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
            'unprecedented',
            'phenomenon',
            'catastrophic',
            'extraordinary',
            'fundamental',
            'contemporary',
            'significant',
            'disparities',
            'transformation',
            'advancement',
            'degradation',
            'legislative',
            'intervention',
            'globalisation',
            'theoretical',
            'implication',
            'substantial',
            'comprehensive',
            'accumulated',
            'acquisition',
            'controversy',
            'demonstrating',
            'sophisticated',
            'exacerbation',
            'presumptuous',
            'manipulation',
            'proliferation',
            'rationalisation',
            'sustainability',
            'resilience',
            'amplification',
            'supplementary',
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
});
