import { describe, expect, it } from 'vitest';
import { mergePriorComments, rankPriorComments, trigramSimilarity, type PriorCommentSource } from './commentRecall';

const source = (id: string, text: string, kind: PriorCommentSource['source'] = 'feedback'): PriorCommentSource => ({
    id,
    text,
    source: kind,
    label: kind === 'bank' ? 'writing' : 'Amara',
});

describe('trigramSimilarity', () => {
    it('is 1 for identical text and near 0 for disjoint text', () => {
        expect(trigramSimilarity('thesis statement', 'thesis statement')).toBe(1);
        expect(trigramSimilarity('thesis statement', 'quantum physics')).toBeLessThan(0.1);
    });

    it('ignores case and accents like the search normaliser', () => {
        expect(trigramSimilarity('Café', 'cafe')).toBe(1);
    });
});

describe('rankPriorComments', () => {
    const corpus: PriorCommentSource[] = [
        source('f1', 'The thesis statement is unclear; state the claim in the first paragraph.'),
        source('f2', 'Good use of evidence, but the conclusion repeats the introduction.'),
        source('b1', 'Thesis statement needs a clearer claim.', 'bank'),
        source('f3', 'Spelling errors distract from an otherwise strong argument.'),
    ];

    it('returns nothing for an empty or single-character query', () => {
        expect(rankPriorComments('', corpus)).toEqual([]);
        expect(rankPriorComments(' t ', corpus)).toEqual([]);
    });

    it('ranks the phrase hit above loosely related comments', () => {
        const results = rankPriorComments('thesis statement', corpus);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].text).toMatch(/thesis statement/i);
    });

    it('tolerates word-order variation', () => {
        const results = rankPriorComments('statement thesis', corpus);
        expect(results.map((r) => r.id)).toContain('b1');
    });

    it('tolerates a typo through trigram similarity', () => {
        const results = rankPriorComments('thesiss', corpus);
        expect(results.map((r) => r.id)).toContain('b1');
    });

    it('drops comments unrelated to the query', () => {
        const results = rankPriorComments('conclusion', corpus);
        expect(results.map((r) => r.id)).toEqual(['f2']);
    });

    it('deduplicates identical text across the bank and past feedback', () => {
        const duplicated = [source('b1', 'Same words', 'bank'), source('f9', 'Same words')];
        expect(rankPriorComments('same words', duplicated)).toHaveLength(1);
    });

    it('skips blank comments and respects the limit', () => {
        const results = rankPriorComments('thesis', [source('blank', '   '), ...corpus], 1);
        expect(results).toHaveLength(1);
    });

    it('keeps the source and label so the UI can badge the result', () => {
        const [bank] = rankPriorComments('clearer claim', corpus);
        expect(bank.source).toBe('bank');
        expect(bank.label).toBe('writing');
    });
});

describe('mergePriorComments', () => {
    const local = [source('f1', 'Needs a clearer claim.'), source('b2', 'Strong thesis.')];

    it('puts server-ranked bank hits first and appends local-only feedback', () => {
        const merged = mergePriorComments(
            [{ id: 'b1', text: 'Clearer claim needed.', tags: ['writing'], score: 4 }],
            local
        );
        expect(merged.map((r) => r.id)).toEqual(['b1', 'f1', 'b2']);
        expect(merged[0].source).toBe('bank');
        expect(merged[0].label).toBe('writing');
    });

    it('does not repeat a snippet the server already returned in another casing', () => {
        const merged = mergePriorComments([{ id: 'b9', text: 'strong thesis.', tags: [], score: 2 }], local);
        expect(merged.filter((r) => r.text.toLowerCase() === 'strong thesis.')).toHaveLength(1);
        expect(merged.filter((r) => r.id === 'b2')).toHaveLength(0);
        expect(merged[0].id).toBe('b9');
    });

    it('honours the limit', () => {
        const merged = mergePriorComments(
            [
                { id: 'b1', text: 'One', tags: [], score: 3 },
                { id: 'b2', text: 'Two', tags: [], score: 2 },
            ],
            local,
            2
        );
        expect(merged).toHaveLength(2);
    });
});
