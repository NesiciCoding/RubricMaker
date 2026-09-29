import { describe, it, expect } from 'vitest';
import fixtures from '../../sync/writing-fixtures.json';
import {
    TRANSITION_WORDS,
    computeEssayStats,
    computeReadability,
    countSentences,
    countSyllables,
    countTransitions,
    tokenizeWords,
} from './essayTextStats';

describe('CLI parity fixtures', () => {
    it.each(Object.entries(fixtures.syllables))('countSyllables(%s)', (word, n) => {
        expect(countSyllables(word)).toBe(n);
    });
    it.each(Object.entries(fixtures.sentences))('countSentences(%j)', (text, n) => {
        expect(countSentences(text)).toBe(n);
    });
    it.each(fixtures.readability)('readability of %j', (f) => {
        expect(computeReadability(f.text, f.wordCount)).toEqual({
            fleschReadingEase: f.fleschReadingEase,
            fleschKincaidGrade: f.fleschKincaidGrade,
            description: f.description,
        });
    });
    it.each(fixtures.transitions)('transitions in %j', (f) => {
        const t = countTransitions(f.text, tokenizeWords(f.text).length);
        expect(t.total).toBe(f.total);
        expect(t.byCategory).toEqual(f.byCategory);
    });
    it('returns null readability for no words', () => {
        expect(computeReadability('!!!', 0)).toBeNull();
    });
});

describe('shared fixtures', () => {
    it('uses the same transition-word list as the CLI', () => {
        expect(TRANSITION_WORDS).toEqual(fixtures.transitionWords);
    });
    it.each(fixtures.essayStats)('computeEssayStats(%j)', (f) => {
        const s = computeEssayStats(f.text);
        expect(s).toMatchObject({
            wordCount: f.wordCount,
            sentenceCount: f.sentenceCount,
            sentenceLengths: f.sentenceLengths,
            avgWordsPerSentence: f.avgWordsPerSentence,
            sentenceLengthVariance: f.sentenceLengthVariance,
            sentenceLengthStdDev: f.sentenceLengthStdDev,
            minSentenceLength: f.minSentenceLength,
            maxSentenceLength: f.maxSentenceLength,
        });
        if (f.transitions) expect(s.transitions).toMatchObject(f.transitions);
    });
});

describe('computeEssayStats', () => {
    it('reports sentence-length variance', () => {
        const s = computeEssayStats('One two. One two three four. One.');
        expect(s.sentenceLengths).toEqual([2, 4, 1]);
        expect(s.sentenceCount).toBe(3);
        expect(s.avgWordsPerSentence).toBe(2.3);
        expect(s.sentenceLengthVariance).toBe(1.6);
        expect(s.minSentenceLength).toBe(1);
        expect(s.maxSentenceLength).toBe(4);
    });
    it('accepts TipTap HTML', () => {
        const s = computeEssayStats('<p>It rained.</p><p>Moreover, we left.</p>');
        expect(s.wordCount).toBe(5);
        expect(s.transitions.byPhrase).toEqual({ moreover: 1 });
    });
    it('prefers multi-word phrases over their parts', () => {
        expect(computeEssayStats('In addition we won.').transitions.byPhrase).toEqual({ 'in addition': 1 });
    });
    it('handles empty input', () => {
        const s = computeEssayStats('');
        expect(s.wordCount).toBe(0);
        expect(s.sentenceCount).toBe(0);
        expect(s.readability).toBeNull();
    });
});
