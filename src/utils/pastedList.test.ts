import { describe, expect, it } from 'vitest';
import { splitPastedList, splitPastedPair, spreadPastedLines, spreadPastedPairs } from './pastedList';

const make = (text: string) => ({ id: `new-${text}`, text });

describe('splitPastedList', () => {
    it('drops list markers and blank lines but keeps ordinary text', () => {
        expect(splitPastedList('A. went\r\nb) goes\n\n3. has gone\n- is going\n• will go')).toEqual([
            'went',
            'goes',
            'has gone',
            'is going',
            'will go',
        ]);
        expect(splitPastedList('A sentence\ne.g. this one\nU.S. history')).toEqual([
            'A sentence',
            'e.g. this one',
            'U.S. history',
        ]);
    });
});

describe('spreadPastedLines', () => {
    it('fills blank entries before inserting new ones', () => {
        const items = [
            { id: 'a', text: '' },
            { id: 'b', text: '' },
        ];
        expect(spreadPastedLines(items, 0, ['x', 'y', 'z'], make)).toEqual([
            { id: 'a', text: 'x' },
            { id: 'b', text: 'y' },
            { id: 'new-z', text: 'z' },
        ]);
    });

    it('keeps a filled entry at the paste point and inserts before later filled ones', () => {
        const items = [
            { id: 'a', text: 'keep' },
            { id: 'b', text: 'later' },
        ];
        expect(spreadPastedLines(items, 0, ['x', 'y'], make)).toEqual([
            { id: 'a', text: 'keep' },
            { id: 'new-x', text: 'x' },
            { id: 'new-y', text: 'y' },
            { id: 'b', text: 'later' },
        ]);
    });
});

describe('pasted matching pairs', () => {
    it('splits on the first tab, dash, equals sign or colon', () => {
        expect(splitPastedPair('apple\tfruit - red or green')).toEqual({
            left: 'apple',
            right: 'fruit - red or green',
        });
        expect(splitPastedPair('run – to move fast')).toEqual({ left: 'run', right: 'to move fast' });
        expect(splitPastedPair('big = large')).toEqual({ left: 'big', right: 'large' });
        expect(splitPastedPair('time: 3:00')).toEqual({ left: 'time', right: '3:00' });
        expect(splitPastedPair('time: 3 - 4')).toEqual({ left: 'time', right: '3 - 4' });
        expect(splitPastedPair('ice-cream - a cold dessert: sweet')).toEqual({
            left: 'ice-cream',
            right: 'a cold dessert: sweet',
        });
        expect(splitPastedPair('well-known')).toEqual({ left: 'well-known', right: '' });
    });

    it('fills blank pairs first and keeps a filled pair at the paste point', () => {
        const make = (left: string, right: string) => ({ id: `new-${left}`, left, right });
        const pairs = [
            { id: 'p1', left: 'cat', right: 'animal' },
            { id: 'p2', left: '', right: '' },
        ];
        expect(spreadPastedPairs(pairs, 0, ['dog – pet', 'oak – tree'], make)).toEqual([
            { id: 'p1', left: 'cat', right: 'animal' },
            { id: 'p2', left: 'dog', right: 'pet' },
            { id: 'new-oak', left: 'oak', right: 'tree' },
        ]);
    });
});
