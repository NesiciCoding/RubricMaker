import { describe, it, expect } from 'vitest';
import { profileText, buildPersistedVocabProfile, vocabProfileView } from './cefrVocabularyProfiler';

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

    describe('CEFR index lookup', () => {
        it('assigns each recognised word its index level', () => {
            expect(profileText('cat').levelCounts.A1).toBe(1);
            expect(profileText('abandon').levelCounts.B1).toBe(1);
            expect(profileText('paradigm').levelCounts.C1).toBe(1);
            expect(profileText('embody').levelCounts.C2).toBe(1);
        });

        it('counts off-list words (proper nouns, typos) towards offListPercent, not a level', () => {
            const result = profileText('zxqywv brrrmph flooble');
            const matched = Object.values(result.levelCounts).reduce((s, c) => s + c, 0);
            expect(matched).toBe(0);
            expect(result.offListPercent).toBe(100);
        });

        it('mixes on- and off-list words into a fractional offListPercent', () => {
            // "abandon" (B1) is recognised; "zxqywv" is off-list → 1 of 2 content words off-list
            const result = profileText('abandon zxqywv');
            expect(result.offListPercent).toBeCloseTo(50, 5);
        });

        it('does not treat Object.prototype keys as matches (Map-backed index)', () => {
            // "toString" is not a dictionary word — a plain-object index would return a function
            expect(profileText('toString').offListPercent).toBe(100);
            // "constructor" is a real B1 word and must still be recognised
            expect(profileText('constructor').levelCounts.B1).toBe(1);
        });
    });

    describe('academic coverage', () => {
        it('reports AWL/NAWL share of the content words', () => {
            const result = profileText('analysis research assessment');
            expect(result.academic.awlPercent).toBeGreaterThan(0);
            expect(result.academic.academicWords).toEqual(
                expect.arrayContaining(['analysis', 'research', 'assessment'])
            );
        });

        it('reports zero academic coverage for a non-academic sentence', () => {
            const result = profileText('the cat sat on the mat');
            expect(result.academic.awlPercent).toBe(0);
            expect(result.academic.nawlPercent).toBe(0);
        });
    });

    it('exposes offListPercent and academic on empty text without dividing by zero', () => {
        const result = profileText('');
        expect(result.offListPercent).toBe(0);
        expect(result.academic).toEqual({ awlPercent: 0, nawlPercent: 0, academicWords: [] });
    });
});

describe('buildPersistedVocabProfile / vocabProfileView', () => {
    it('captures raw additive counts for a text', () => {
        // analysis B1 + AWL, cat A1, zxqywv off-list → 3 content tokens
        const p = buildPersistedVocabProfile('analysis cat zxqywv');
        expect(p.contentTokenCount).toBe(3);
        expect(p.levelCounts.A1).toBe(1);
        expect(p.levelCounts.B1).toBe(1);
        expect(p.offListCount).toBe(1);
        expect(p.awlCount).toBe(1);
        expect(p.academicWords).toContain('analysis');
    });

    it('round-trips: profileText === vocabProfileView(buildPersistedVocabProfile(text))', () => {
        const text = 'The unprecedented magnitude of the catastrophic phenomenon was extraordinary.';
        expect(profileText(text)).toEqual(vocabProfileView(buildPersistedVocabProfile(text)));
    });

    it('derives percentages from stored counts', () => {
        const view = vocabProfileView({
            levelCounts: { A1: 1, A2: 0, B1: 1, B2: 0, C1: 0, C2: 0 },
            contentTokenCount: 4,
            offListCount: 2,
            awlCount: 1,
            nawlCount: 0,
            highlightWords: [{ word: 'analysis', level: 'B1' }],
            academicWords: ['analysis'],
        });
        expect(view.offListPercent).toBeCloseTo(50, 5);
        expect(view.academic.awlPercent).toBeCloseTo(25, 5);
        expect(view.highlightWords).toEqual([{ word: 'analysis', level: 'B1' }]);
    });

    it('handles a zero-token stored profile without dividing by zero', () => {
        const view = vocabProfileView({
            levelCounts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
            contentTokenCount: 0,
            offListCount: 0,
            awlCount: 0,
            nawlCount: 0,
            highlightWords: [],
            academicWords: [],
        });
        expect(view.offListPercent).toBe(0);
        expect(view.academic).toEqual({ awlPercent: 0, nawlPercent: 0, academicWords: [] });
    });
});
