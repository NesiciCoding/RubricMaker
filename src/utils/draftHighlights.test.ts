import { describe, expect, it } from 'vitest';
import { lastAddedSentence } from './draftHighlights';

describe('lastAddedSentence', () => {
    it('reports the newest complete sentence and how many words are new', () => {
        const previous = 'The rain fell all morning.';
        const current = 'The rain fell all morning. The lane was quiet. Nobody came.';

        // Two sentences were added; the newest one is the one worth showing.
        expect(lastAddedSentence(previous, current)).toEqual({
            addedWords: 6,
            sentence: 'Nobody came.',
        });
    });

    it('reports an unfinished tail as it stands', () => {
        expect(lastAddedSentence('The rain fell.', 'The rain fell. Then the')).toEqual({
            addedWords: 2,
            sentence: 'Then the',
        });
    });

    it('returns nothing when the snapshot added no words', () => {
        expect(lastAddedSentence('Same text here.', 'Same text here.')).toBeNull();
        expect(lastAddedSentence('', '')).toBeNull();
    });

    it('treats the first snapshot as all-new', () => {
        expect(lastAddedSentence('', 'One two three.')).toEqual({ addedWords: 3, sentence: 'One two three.' });
    });

    it('shortens a very long sentence on a word boundary', () => {
        const long = Array.from({ length: 60 }, (_, index) => `word${index}`).join(' ');
        const result = lastAddedSentence('', long);

        expect(result?.sentence.length).toBeLessThanOrEqual(141);
        expect(result?.sentence.endsWith('…')).toBe(true);
        expect(result?.addedWords).toBe(60);
    });
});
