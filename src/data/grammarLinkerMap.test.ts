import { describe, it, expect } from 'vitest';
import { GRAMMAR_CATEGORIES } from './grammarStandards';
import { GRAMMAR_CONSTRUCTIONS } from './grammarConstructions';
import { ITEM_CONSTRUCTIONS, SHORTHAND_CONSTRUCTIONS, constructionsForItem } from './grammarLinkerMap';

const constructionIds = new Set(GRAMMAR_CONSTRUCTIONS.map((c) => c.id));
const items = GRAMMAR_CATEGORIES.flatMap((c) => c.items);

describe('grammar linker map', () => {
    it('only references known UD construction ids', () => {
        for (const ids of [...Object.values(SHORTHAND_CONSTRUCTIONS), ...Object.values(ITEM_CONSTRUCTIONS)]) {
            for (const id of ids) expect(constructionIds.has(id), id).toBe(true);
        }
    });

    it('only references existing grammar items and shorthands', () => {
        const itemIds = new Set(items.map((i) => i.id));
        for (const id of Object.keys(ITEM_CONSTRUCTIONS)) expect(itemIds.has(id), id).toBe(true);
        const shorthands = new Set(items.map((i) => i.detectShorthand).filter(Boolean));
        for (const sh of Object.keys(SHORTHAND_CONSTRUCTIONS)) expect(shorthands.has(sh), sh).toBe(true);
    });

    it('prefers a per-item mapping over the shorthand mapping', () => {
        expect(constructionsForItem({ id: 'gr-passive-perfect', detectShorthand: 'PASS' })).toEqual([
            'passive_perfect',
        ]);
        expect(constructionsForItem({ id: 'gr-passive', detectShorthand: 'PASS' })).toEqual(
            SHORTHAND_CONSTRUCTIONS.PASS
        );
        expect(constructionsForItem({ id: 'gr-articles-indefinite', detectShorthand: 'ART.INDEF' })).toBeUndefined();
    });
});
