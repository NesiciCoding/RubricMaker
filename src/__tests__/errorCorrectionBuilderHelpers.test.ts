import { describe, expect, it } from 'vitest';
import {
    parseErrorPassage,
    sentenceBuilderTiles,
    stripErrorKey,
} from '../../supabase/functions/_shared/testScoring.ts';

describe('error-correction helpers', () => {
    it('parses errors with all accepted corrections and plain decoys', () => {
        const fragments = parseErrorPassage('He [[go|goes|is going]] to [[school]].').filter(
            (s) => s.type === 'fragment'
        );
        expect(fragments).toEqual([
            { type: 'fragment', index: 0, text: 'go', corrections: ['goes', 'is going'] },
            { type: 'fragment', index: 1, text: 'school', corrections: [] },
        ]);
    });

    it('strips every correction so the student payload carries no key', () => {
        const stripped = stripErrorKey('He [[go|goes]] to [[school]] [[a|b|c]].');
        expect(stripped).toBe('He [[go]] to [[school]] [[a]].');
        expect(stripped).not.toContain('goes');
    });
});

describe('sentenceBuilderTiles', () => {
    const q = { type: 'sentence-builder', points: 1, prompt: 'p', sentenceTargets: ['I go to school every day'] };

    it('is deterministic, keeps every word, and never returns the target order', () => {
        const tiles = sentenceBuilderTiles(q);
        expect(tiles).toEqual(sentenceBuilderTiles(q));
        expect([...tiles].sort()).toEqual(['I', 'day', 'every', 'go', 'school', 'to']);
        expect(tiles.join(' ')).not.toBe('I go to school every day');
    });

    it('prefers server-provided tiles and tolerates a missing sentence', () => {
        expect(sentenceBuilderTiles({ ...q, sentenceTargets: undefined, sentenceTiles: ['b', 'a'] })).toEqual([
            'b',
            'a',
        ]);
        expect(sentenceBuilderTiles({ type: 'sentence-builder', points: 1, prompt: '' })).toEqual([]);
    });
});
