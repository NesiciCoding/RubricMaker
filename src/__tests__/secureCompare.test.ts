import { describe, expect, it } from 'vitest';
import { secretsMatch } from '../../supabase/functions/_shared/secureCompare';

describe('secretsMatch', () => {
    it('matches equal strings', () => {
        expect(secretsMatch('Bearer abc', 'Bearer abc')).toBe(true);
        expect(secretsMatch('', '')).toBe(true);
    });

    it('rejects different strings, including length and prefix differences', () => {
        expect(secretsMatch('Bearer abc', 'Bearer abd')).toBe(false);
        expect(secretsMatch('Bearer abc', 'Bearer abcd')).toBe(false);
        expect(secretsMatch('Bearer abc', 'Bearer ab')).toBe(false);
        expect(secretsMatch('', 'x')).toBe(false);
    });
});
