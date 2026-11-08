import { describe, expect, it } from 'vitest';
import {
    parseErrorPassage,
    scoreSentenceBuilder,
    sentenceBuilderChunks,
    sentenceBuilderText,
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

describe('sentence-builder word groups', () => {
    const q = {
        type: 'sentence-builder',
        points: 4,
        prompt: 'p',
        sentenceTargets: ['She [has been] waiting [for ages].', 'For ages she has been waiting.'],
    };

    it('splits bracketed groups into single tiles and keeps touching punctuation on them', () => {
        expect(sentenceBuilderChunks('She [has been] waiting [for  ages].')).toEqual([
            'She',
            'has been',
            'waiting',
            'for ages.',
        ]);
        expect(sentenceBuilderChunks('¿[Dónde está] el baño?')).toEqual(['¿Dónde está', 'el', 'baño?']);
        expect(sentenceBuilderChunks('I [] go [ ] home')).toEqual(['I', 'go', 'home']);
        expect(sentenceBuilderText('She [has been] waiting.')).toBe('She has been waiting.');
    });

    it('shuffles the group tiles and keeps sentences without brackets on single words', () => {
        expect([...sentenceBuilderTiles(q)].sort()).toEqual(['She', 'for ages.', 'has been', 'waiting']);
        expect(sentenceBuilderChunks('I go home')).toEqual(['I', 'go', 'home']);
    });

    it('scores placed group tiles word by word against every accepted order', () => {
        expect(scoreSentenceBuilder(q, JSON.stringify(['She', 'has been', 'waiting', 'for ages.']))).toBe(4);
        expect(scoreSentenceBuilder(q, JSON.stringify(['for ages.', 'She', 'has been', 'waiting']))).toBe(4);
        expect(scoreSentenceBuilder(q, JSON.stringify(['She', 'waiting', 'has been', 'for ages.']))).toBeCloseTo(
            (4 * 2) / 6
        );
        expect(
            scoreSentenceBuilder(
                { ...q, builderScoring: 'all-or-nothing' },
                JSON.stringify(['She', 'has been', 'waiting'])
            )
        ).toBe(0);
    });
});
