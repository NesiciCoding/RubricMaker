import { describe, expect, it } from 'vitest';
import { splitPastedList, spreadPastedLines } from './pastedList';

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
