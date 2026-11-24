import { describe, expect, it } from 'vitest';
import { displayOptions } from './optionOrder';

const options = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, text: id, isCorrect: id === 'a' }));
const ids = (list: { id: string }[]) => list.map((o) => o.id);

describe('displayOptions', () => {
    it('keeps the authored order unless shuffling is on', () => {
        expect(ids(displayOptions({ id: 'q', options }, 'code'))).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('gives the same shuffled order to the same student and a permutation of every option', () => {
        const q = { id: 'q', options, shuffleOptions: true };
        expect(ids(displayOptions(q, 'code'))).toEqual(ids(displayOptions(q, 'code')));
        expect([...ids(displayOptions(q, 'code'))].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('keeps the last option last when pinned', () => {
        for (const code of ['x', 'y', 'z', 'w']) {
            const shuffled = displayOptions({ id: 'q', options, shuffleOptions: true, pinLastOption: true }, code);
            expect(shuffled[4].id).toBe('e');
            expect(shuffled).toHaveLength(5);
        }
    });

    it('ignores pinLastOption without shuffleOptions', () => {
        expect(ids(displayOptions({ id: 'q', options, pinLastOption: true }, 'code'))).toEqual(ids(options));
    });
});
