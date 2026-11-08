import { describe, expect, it } from 'vitest';
import {
    canBuildFromTiles,
    chunksToSentence,
    hasUnbalancedBrackets,
    joinTiles,
    splitTile,
} from './sentenceBuilderGroups';

describe('sentenceBuilderGroups', () => {
    it('joins a tile with its neighbour and splits a group back into words', () => {
        expect(joinTiles('She has been waiting.', 1)).toBe('She [has been] waiting.');
        expect(joinTiles('She [has been] waiting.', 1)).toBe('She [has been waiting.]');
        expect(splitTile('She [has been] waiting.', 1)).toBe('She has been waiting.');
    });

    it('leaves the sentence alone for an out-of-range join or a single-word split', () => {
        expect(joinTiles('I go', 1)).toBe('I go');
        expect(joinTiles('I go', -1)).toBe('I go');
        expect(splitTile('I go', 0)).toBe('I go');
    });

    it('brackets only multi-word tiles', () => {
        expect(chunksToSentence(['I', 'went to', 'school.'])).toBe('I [went to] school.');
    });

    it('accepts re-orderings that keep groups whole, ignoring case and punctuation', () => {
        const tiles = ['She', 'has been', 'waiting', 'for ages.'];
        expect(canBuildFromTiles('For ages, she has been waiting!', tiles)).toBe(true);
        expect(canBuildFromTiles('She has waiting been for ages.', tiles)).toBe(false);
        expect(canBuildFromTiles('She has been waiting.', tiles)).toBe(false);
        expect(canBuildFromTiles('She has been waiting for ages for ages.', tiles)).toBe(false);
    });

    it('backtracks across tiles that share a first word', () => {
        expect(canBuildFromTiles('to go to school', ['to', 'to school', 'go'])).toBe(true);
        expect(canBuildFromTiles('to school to go', ['to go', 'to', 'school'])).toBe(true);
    });

    it('flags a bracket without its partner and nested groups', () => {
        expect(hasUnbalancedBrackets('She [has been] waiting [for ages].')).toBe(false);
        expect(hasUnbalancedBrackets('I go home')).toBe(false);
        expect(hasUnbalancedBrackets('She [has been waiting')).toBe(true);
        expect(hasUnbalancedBrackets('She has] been')).toBe(true);
        expect(hasUnbalancedBrackets('[a [b] c]')).toBe(true);
    });

    it('stays fast on long sentences full of look-alike tiles', () => {
        const words = Array.from({ length: 40 }, () => 'the');
        const tiles = [...words.slice(0, 20), 'the the', ...words.slice(22)];
        const started = performance.now();
        expect(canBuildFromTiles([...words.slice(1), 'end'].join(' '), tiles)).toBe(false);
        expect(performance.now() - started).toBeLessThan(500);
    });
});
