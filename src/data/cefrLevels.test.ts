import { describe, it, expect } from 'vitest';
import { CEFR_WORD_LEVELS } from './cefrLevels';

const VALID = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

describe('CEFR_WORD_LEVELS index', () => {
    it('is a large Map keyed by lowercased words', () => {
        expect(CEFR_WORD_LEVELS).toBeInstanceOf(Map);
        expect(CEFR_WORD_LEVELS.size).toBeGreaterThan(50000);
    });

    it('maps every entry to a valid CEFR level with a lowercased key', () => {
        for (const [word, level] of CEFR_WORD_LEVELS) {
            expect(VALID.has(level)).toBe(true);
            expect(word).toBe(word.toLowerCase());
        }
    });

    it('spot-checks known words', () => {
        expect(CEFR_WORD_LEVELS.get('cat')).toBe('A1');
        expect(CEFR_WORD_LEVELS.get('abandon')).toBe('B1');
        expect(CEFR_WORD_LEVELS.get('paradigm')).toBe('C1');
    });

    it('does not expose Object.prototype keys as entries', () => {
        expect(CEFR_WORD_LEVELS.get('toString')).toBeUndefined();
        expect(CEFR_WORD_LEVELS.get('hasOwnProperty')).toBeUndefined();
    });
});
