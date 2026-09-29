import { describe, it, expect } from 'vitest';
import { scoreToMasteryColor } from './masteryColorScale';
import { pctToColor } from '../components/Statistics/CriterionHeatmap';
import type { GradeRange } from '../types';

describe('scoreToMasteryColor', () => {
    it('falls back to pctToColor when no bands are configured', () => {
        expect(scoreToMasteryColor(42)).toBe(pctToColor(42));
        expect(scoreToMasteryColor(42, [])).toBe(pctToColor(42));
        expect(scoreToMasteryColor(42, undefined)).toBe(pctToColor(42));
    });

    it('returns the matching configured band color', () => {
        const bands: GradeRange[] = [
            { min: 0, max: 49, label: 'Needs work', color: '#ef4444' },
            { min: 50, max: 74, label: 'Developing', color: '#eab308' },
            { min: 75, max: 100, label: 'Strong', color: '#22c55e' },
        ];
        expect(scoreToMasteryColor(10, bands)).toBe('#ef4444');
        expect(scoreToMasteryColor(60, bands)).toBe('#eab308');
        expect(scoreToMasteryColor(90, bands)).toBe('#22c55e');
        expect(scoreToMasteryColor(49, bands)).toBe('#ef4444');
        expect(scoreToMasteryColor(50, bands)).toBe('#eab308');
    });

    it('falls back to pctToColor for a score outside every configured band', () => {
        const bands: GradeRange[] = [{ min: 0, max: 40, label: 'Low', color: '#ef4444' }];
        expect(scoreToMasteryColor(80, bands)).toBe(pctToColor(80));
    });

    it('clamps out-of-range scores before matching a band', () => {
        const bands: GradeRange[] = [{ min: 0, max: 100, label: 'All', color: '#111111' }];
        expect(scoreToMasteryColor(-10, bands)).toBe('#111111');
        expect(scoreToMasteryColor(150, bands)).toBe('#111111');
    });
});
