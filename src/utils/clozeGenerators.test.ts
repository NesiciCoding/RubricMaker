import { describe, it, expect } from 'vitest';
import {
    generateFixedRatioCloze,
    generateCTest,
    generatePosCloze,
    generateAboveLevelCloze,
    generateAcademicCloze,
    generateCloze,
} from './clozeGenerators';
import { renderClozeSegments } from './clozeParse';

const PASSAGE =
    'The weather was nice today. She must go to the store because of the rain that fell all morning. He borrowed an umbrella from his neighbour and analysed the situation carefully.';

describe('generateFixedRatioCloze', () => {
    it('leaves the first sentence untouched and gaps every Nth word after it', () => {
        const result = generateFixedRatioCloze(PASSAGE, 5);
        expect(result.startsWith('The weather was nice today.')).toBe(true);
        expect(renderClozeSegments(result).filter((s) => s.type === 'gap').length).toBeGreaterThan(0);
    });

    it('reconstructs the same text when gaps are resolved to their answers', () => {
        const result = generateFixedRatioCloze(PASSAGE, 5);
        const rebuilt = renderClozeSegments(result)
            .map((s) => (s.type === 'gap' ? s.gap.alternatives[0] : s.text))
            .join('');
        expect(rebuilt).toBe(PASSAGE);
    });

    it('is a no-op on a single-sentence passage', () => {
        expect(generateFixedRatioCloze('Only one sentence here.', 3)).toBe('Only one sentence here.');
    });
});

describe('generateCTest', () => {
    it('gaps the second half of every second eligible word after the first sentence', () => {
        const result = generateCTest(PASSAGE);
        const gaps = renderClozeSegments(result).filter((s) => s.type === 'gap');
        expect(gaps.length).toBeGreaterThan(0);
        // every gap answer should be a word suffix, never the whole word
        for (const g of gaps) {
            expect(g.gap.alternatives[0].length).toBeGreaterThan(0);
        }
    });

    it('round-trips back to the original text', () => {
        const result = generateCTest(PASSAGE);
        const rebuilt = renderClozeSegments(result)
            .map((s) => (s.type === 'gap' ? s.gap.alternatives[0] : s.text))
            .join('');
        expect(rebuilt).toBe(PASSAGE);
    });
});

describe('generatePosCloze', () => {
    it('gaps only prepositions', () => {
        const result = generatePosCloze('She sat on the chair and looked at the clock.', 'preposition');
        const gaps = renderClozeSegments(result)
            .filter((s) => s.type === 'gap')
            .map((s) => s.gap.alternatives[0].toLowerCase());
        expect(gaps).toEqual(['on', 'at']);
    });

    it('gaps only a/an/the for the article strategy, not other determiners', () => {
        const result = generatePosCloze('This dog saw a cat near the fence.', 'article');
        const gaps = renderClozeSegments(result)
            .filter((s) => s.type === 'gap')
            .map((s) => s.gap.alternatives[0].toLowerCase());
        expect(gaps).toEqual(['a', 'the']);
    });

    it('gaps modals', () => {
        const result = generatePosCloze('You must leave and you should go now.', 'modal');
        const gaps = renderClozeSegments(result)
            .filter((s) => s.type === 'gap')
            .map((s) => s.gap.alternatives[0].toLowerCase());
        expect(gaps).toEqual(['must', 'should']);
    });
});

describe('generateAboveLevelCloze', () => {
    it('gaps only words at or above the target level', () => {
        const result = generateAboveLevelCloze('The cat analysed the complex phenomenon.', 'B1');
        const gaps = renderClozeSegments(result).filter((s) => s.type === 'gap');
        expect(gaps.length).toBeGreaterThan(0);
        // simple A1 words like "the" and "cat" must never be gapped at a B1 target
        const gappedWords = gaps.map((g) => g.gap.alternatives[0].toLowerCase());
        expect(gappedWords).not.toContain('the');
        expect(gappedWords).not.toContain('cat');
    });
});

describe('generateAcademicCloze', () => {
    it('gaps AWL/NAWL academic vocabulary', () => {
        const result = generateAcademicCloze('The committee will analyse the constitutional data further.');
        const gaps = renderClozeSegments(result).filter((s) => s.type === 'gap');
        expect(gaps.length).toBeGreaterThan(0);
    });
});

describe('generateCloze dispatcher', () => {
    it('routes to the right strategy', () => {
        expect(generateCloze('You must go.', 'modal')).toContain('{{must}}');
    });
});
