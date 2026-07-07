import { describe, it, expect } from 'vitest';
import { CEFR_SUBLEVEL_ORDER, cefrLevelOrdinal, cefrSubLevelOrdinal, compareToRange } from './cefrOrdinal';

describe('CEFR_SUBLEVEL_ORDER', () => {
    it('is strictly increasing across the whole scale', () => {
        CEFR_SUBLEVEL_ORDER.forEach((level, i) => {
            expect(cefrSubLevelOrdinal(level)).toBe(i);
        });
    });
});

describe('cefrLevelOrdinal', () => {
    it('maps each coarse level onto its whole-level position', () => {
        expect(cefrLevelOrdinal('A1')).toBe(cefrSubLevelOrdinal('a1'));
        expect(cefrLevelOrdinal('B1')).toBe(cefrSubLevelOrdinal('b1'));
        expect(cefrLevelOrdinal('C2')).toBe(cefrSubLevelOrdinal('c2'));
    });

    it('orders coarse levels correctly relative to each other', () => {
        expect(cefrLevelOrdinal('A1')).toBeLessThan(cefrLevelOrdinal('A2'));
        expect(cefrLevelOrdinal('B1')).toBeLessThan(cefrLevelOrdinal('B2'));
    });
});

describe('compareToRange', () => {
    const range = { min: 'b1' as const, max: 'b1-plus' as const };

    it('returns no-data when nothing achieved', () => {
        expect(compareToRange(undefined, range)).toBe('no-data');
    });

    it('returns behind when achieved is below the range', () => {
        expect(compareToRange('A2', range)).toBe('behind');
    });

    it('returns on-track when achieved falls within the range', () => {
        expect(compareToRange('B1', range)).toBe('on-track');
    });

    it('returns ahead when achieved is above the range', () => {
        expect(compareToRange('C1', range)).toBe('ahead');
    });
});
