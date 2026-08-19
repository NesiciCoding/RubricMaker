import { describe, it, expect, vi } from 'vitest';
import {
    parseCsvText,
    parseLines,
    splitLine,
    cardsFromRows,
    parseFlashcardFile,
    UnsupportedFlashcardFileError,
} from './flashcardImport';

// Dynamic imports used by parseFlashcardFile for the binary formats.
vi.mock('read-excel-file/browser', () => ({
    readSheet: vi.fn(async () => [
        ['apple', 'appel'],
        ['house', 'huis'],
    ]),
}));

vi.mock('mammoth', () => ({
    extractRawText: vi.fn(async () => ({ value: 'apple - appel\nhouse - huis' })),
}));

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

    it('skips a header row detected via the back column alone', () => {
        const cards = parseCsvText('Item,Translation\napple,appel');
        expect(cards).toEqual([{ front: 'apple', back: 'appel' }]);
    });

    it('skips rows missing a front or back', () => {
        const cards = parseCsvText('apple,appel\nlonely\n,orphan');
        expect(cards).toHaveLength(1);
    });

    it('parses optional phonetic and part-of-speech columns', () => {
        const cards = parseCsvText('apple,appel,I eat an apple,/ˈapl̩/,noun');
        expect(cards).toEqual([
            { front: 'apple', back: 'appel', example: 'I eat an apple', phonetic: '/ˈapl̩/', partOfSpeech: 'noun' },
        ]);
    });

    it('omits phonetic/part-of-speech when those columns are absent (back-compat)', () => {
        const cards = cardsFromRows([['run', 'rennen']]);
        expect(cards[0]).not.toHaveProperty('phonetic');
        expect(cards[0]).not.toHaveProperty('partOfSpeech');
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

    it('yields only front/back for line-based formats (DOCX/TXT) — no example/phonetic/POS', () => {
        // splitLine splits on the FIRST separator only, so everything after it becomes the
        // back; these freeform formats have no column structure to carry the extra fields.
        const [card] = parseLines('apple - appel - I eat an apple - /ˈapl̩/ - noun');
        expect(card.front).toBe('apple');
        expect(card).not.toHaveProperty('example');
        expect(card).not.toHaveProperty('phonetic');
        expect(card).not.toHaveProperty('partOfSpeech');
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

describe('parseFlashcardFile', () => {
    it('parses a csv file', async () => {
        const file = new File(['apple,appel\nhouse,huis'], 'cards.csv', { type: 'text/csv' });
        const cards = await parseFlashcardFile(file);
        expect(cards).toEqual([
            { front: 'apple', back: 'appel' },
            { front: 'house', back: 'huis' },
        ]);
    });

    it('parses a txt file line-by-line', async () => {
        const file = new File(['apple - appel\nhouse - huis'], 'words.txt', { type: 'text/plain' });
        const cards = await parseFlashcardFile(file);
        expect(cards.map((c) => c.front)).toEqual(['apple', 'house']);
    });

    it('parses an xlsx workbook through read-excel-file', async () => {
        const file = new File([''], 'cards.xlsx');
        const cards = await parseFlashcardFile(file);
        expect(cards).toEqual([
            { front: 'apple', back: 'appel' },
            { front: 'house', back: 'huis' },
        ]);
    });

    it('parses a docx file through mammoth raw-text extraction', async () => {
        const file = new File([''], 'cards.docx');
        const cards = await parseFlashcardFile(file);
        expect(cards.map((c) => c.front)).toEqual(['apple', 'house']);
    });

    it('throws UnsupportedFlashcardFileError for legacy or unknown extensions', async () => {
        const file = new File([''], 'cards.xls');
        await expect(parseFlashcardFile(file)).rejects.toThrow(UnsupportedFlashcardFileError);
        await expect(parseFlashcardFile(file)).rejects.toThrow('Unsupported flashcard file type: xls');
    });
});
