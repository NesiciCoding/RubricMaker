import { describe, it, expect } from 'vitest';
import { parseCsvText, parseLines, splitLine, cardsFromRows } from './flashcardImport';

describe('parseCsvText', () => {
    it('parses front,back,example columns', () => {
        const cards = parseCsvText('apple,appel,I eat an apple\nhouse,huis');
        expect(cards).toEqual([
            { front: 'apple', back: 'appel', example: 'I eat an apple' },
            { front: 'house', back: 'huis' },
        ]);
    });

    it('skips a header row', () => {
        const cards = parseCsvText('Front,Back\napple,appel');
        expect(cards).toEqual([{ front: 'apple', back: 'appel' }]);
    });

    it('skips rows missing a front or back', () => {
        const cards = parseCsvText('apple,appel\nlonely\n,orphan');
        expect(cards).toHaveLength(1);
    });
});

describe('splitLine', () => {
    it('splits on tab, semicolon, dash, and colon', () => {
        expect(splitLine('apple\tappel')).toEqual(['apple', 'appel']);
        expect(splitLine('apple;appel')).toEqual(['apple', 'appel']);
        expect(splitLine('apple - appel')).toEqual(['apple', 'appel']);
        expect(splitLine('apple: appel')).toEqual(['apple', ' appel']);
    });

    it('does not split on a hyphen inside a word', () => {
        expect(splitLine('well-known - bekend')).toEqual(['well-known', 'bekend']);
    });

    it('returns null for a line without a separator', () => {
        expect(splitLine('just a sentence')).toBeNull();
    });
});

describe('parseLines', () => {
    it('parses bullet lists and numbered lists', () => {
        const cards = parseLines('- apple - appel\n1. house - huis\n\n• dog - hond');
        expect(cards.map((c) => c.front)).toEqual(['apple', 'house', 'dog']);
    });

    it('ignores lines without a separator', () => {
        const cards = parseLines('Vocabulary week 12\napple - appel');
        expect(cards).toEqual([{ front: 'apple', back: 'appel' }]);
    });

    it('preserves a numeric front instead of stripping it as a list marker', () => {
        const cards = parseLines('100 - honderd\n1. house - huis');
        expect(cards).toEqual([
            { front: '100', back: 'honderd' },
            { front: 'house', back: 'huis' },
        ]);
    });
});

describe('cardsFromRows', () => {
    it('stringifies numbers and trims whitespace', () => {
        const cards = cardsFromRows([
            [' seven ', 7],
            ['eight', ' acht ', ''],
        ]);
        expect(cards).toEqual([
            { front: 'seven', back: '7' },
            { front: 'eight', back: 'acht' },
        ]);
    });
});
