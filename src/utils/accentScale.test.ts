import { describe, it, expect } from 'vitest';
import { buildAccentScale, ACCENT_SCALE_STEPS } from './accentScale';

describe('buildAccentScale', () => {
    const accent = '#3b82f6';

    it('returns an entry for every step in ACCENT_SCALE_STEPS', () => {
        const scale = buildAccentScale(accent);
        for (const step of ACCENT_SCALE_STEPS) {
            expect(scale).toHaveProperty(String(step));
            expect(typeof scale[step]).toBe('string');
            expect(scale[step].length).toBeGreaterThan(0);
        }
        expect(Object.keys(scale)).toHaveLength(ACCENT_SCALE_STEPS.length);
    });

    it('step 500 equals the input accent exactly', () => {
        const scale = buildAccentScale(accent);
        expect(scale[500]).toBe(accent);
    });

    it('steps below 500 are color-mix expressions mixing toward white', () => {
        const scale = buildAccentScale(accent);
        for (const step of ACCENT_SCALE_STEPS.filter((s) => s < 500)) {
            expect(scale[step]).toContain('color-mix(in oklab');
            expect(scale[step]).toContain(accent);
            expect(scale[step]).toContain('white');
        }
    });

    it('steps above 500 are color-mix expressions mixing toward black', () => {
        const scale = buildAccentScale(accent);
        for (const step of ACCENT_SCALE_STEPS.filter((s) => s > 500)) {
            expect(scale[step]).toContain('color-mix(in oklab');
            expect(scale[step]).toContain(accent);
            expect(scale[step]).toContain('black');
        }
    });

    it('produces a deterministic output for the same input', () => {
        const a = buildAccentScale(accent);
        const b = buildAccentScale(accent);
        expect(a).toEqual(b);
    });

    it('produces different output for a different accent', () => {
        const a = buildAccentScale('#3b82f6');
        const b = buildAccentScale('#16a34a');
        expect(a[500]).not.toBe(b[500]);
        expect(a[100]).not.toBe(b[100]);
        expect(a[900]).not.toBe(b[900]);
    });

    it('mix percentages move monotonically toward 100% as steps approach 500', () => {
        const scale = buildAccentScale(accent);
        const extractAccentPercent = (expr: string): number => {
            const match = expr.match(/(\d+)%, (?:white|black)/);
            return match ? Number(match[1]) : 100;
        };

        const lowSteps = ACCENT_SCALE_STEPS.filter((s) => s < 500);
        for (let i = 1; i < lowSteps.length; i++) {
            const prevPercent = extractAccentPercent(scale[lowSteps[i - 1]]);
            const currPercent = extractAccentPercent(scale[lowSteps[i]]);
            // Steps closer to 500 mix in less white, so accent percentage increases.
            expect(currPercent).toBeGreaterThanOrEqual(prevPercent);
        }

        const highSteps = ACCENT_SCALE_STEPS.filter((s) => s > 500);
        for (let i = 1; i < highSteps.length; i++) {
            const prevPercent = extractAccentPercent(scale[highSteps[i - 1]]);
            const currPercent = extractAccentPercent(scale[highSteps[i]]);
            // Steps further from 500 mix in more black, so accent percentage decreases.
            expect(currPercent).toBeLessThanOrEqual(prevPercent);
        }
    });
});
