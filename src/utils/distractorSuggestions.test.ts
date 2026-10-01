import { describe, expect, it } from 'vitest';
import { suggestDistractors } from './distractorSuggestions';

const words = (answer: string) => suggestDistractors(answer).map((s) => s.word);

describe('suggestDistractors', () => {
    it('offers other verb forms', () => {
        expect(words('go')).toEqual(expect.arrayContaining(['went', 'gone', 'going']));
    });
    it('offers EFL confusables', () => {
        expect(words('since')).toEqual(expect.arrayContaining(['for']));
        expect(words('make')).toContain('do');
    });
    it('offers same-level words of the same part of speech', () => {
        const sameLevel = suggestDistractors('happy').filter((s) => s.source === 'sameLevel');
        expect(sameLevel.length).toBeGreaterThan(0);
    });
    it('never suggests the answer itself and is deterministic', () => {
        expect(words('go')).not.toContain('go');
        expect(words('go')).toEqual(words('go'));
        expect(suggestDistractors('  ')).toEqual([]);
    });
});
