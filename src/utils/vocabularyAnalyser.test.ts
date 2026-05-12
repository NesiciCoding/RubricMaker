import { describe, it, expect } from 'vitest';
import { analyseVocabulary } from './vocabularyAnalyser';
import type { VocabularyItem } from '../types';

const makeItem = (id: string, phrase: string): VocabularyItem => ({
    id,
    phrase,
    category: 'vocabulary',
});

describe('analyseVocabulary', () => {
    it('returns empty array when no items provided', () => {
        const result = analyseVocabulary('some text', []);
        expect(result).toEqual([]);
    });

    it('detects a found phrase', () => {
        const items = [makeItem('v1', 'hello')];
        const result = analyseVocabulary('hello world', items);
        expect(result).toHaveLength(1);
        expect(result[0].found).toBe(true);
        expect(result[0].occurrences).toBe(1);
    });

    it('marks phrase as not found when absent', () => {
        const items = [makeItem('v1', 'goodbye')];
        const result = analyseVocabulary('hello world', items);
        expect(result[0].found).toBe(false);
        expect(result[0].occurrences).toBe(0);
        expect(result[0].contexts).toEqual([]);
    });

    it('counts multiple occurrences', () => {
        const items = [makeItem('v1', 'cat')];
        const result = analyseVocabulary('the cat sat on the cat mat', items);
        expect(result[0].occurrences).toBe(2);
    });

    it('caps contexts at 5', () => {
        const text = 'word word word word word word word word word word word word';
        const items = [makeItem('v1', 'word')];
        const result = analyseVocabulary(text, items);
        expect(result[0].contexts.length).toBeLessThanOrEqual(5);
        expect(result[0].occurrences).toBeGreaterThan(5);
    });

    it('is case-insensitive', () => {
        const items = [makeItem('v1', 'hello')];
        const result = analyseVocabulary('HELLO world Hello', items);
        expect(result[0].occurrences).toBe(2);
    });

    it('respects word boundaries (no partial match)', () => {
        const items = [makeItem('v1', 'cat')];
        const result = analyseVocabulary('concatenate cats', items);
        expect(result[0].found).toBe(false);
    });

    it('handles regex-special characters in phrase safely', () => {
        const items = [makeItem('v1', 'c.t')]; // dot should be literal
        const result = analyseVocabulary('c.t and cat', items);
        expect(result[0].occurrences).toBe(1);
    });

    it('returns correct vocabularyItemId', () => {
        const items = [makeItem('v-abc', 'test')];
        const result = analyseVocabulary('this is a test', items);
        expect(result[0].vocabularyItemId).toBe('v-abc');
    });

    it('includes context snippet when found', () => {
        const items = [makeItem('v1', 'target')];
        const result = analyseVocabulary('some prefix text here target and some suffix text', items);
        expect(result[0].contexts[0]).toContain('target');
    });

    it('adds ellipsis when context is truncated', () => {
        const longText = 'a'.repeat(100) + ' target ' + 'b'.repeat(100);
        const items = [makeItem('v1', 'target')];
        const result = analyseVocabulary(longText, items);
        expect(result[0].contexts[0]).toMatch(/^…/);
        expect(result[0].contexts[0]).toMatch(/…$/);
    });

    it('handles multiple items independently', () => {
        const items = [makeItem('v1', 'apple'), makeItem('v2', 'banana')];
        const result = analyseVocabulary('I like apple pie but not banana splits', items);
        expect(result[0].found).toBe(true);
        expect(result[1].found).toBe(true);
    });
});
