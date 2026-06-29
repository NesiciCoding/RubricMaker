import { describe, expect, it } from 'vitest';
import { STATS_PRESETS } from './statsChartPresets';

describe('STATS_PRESETS', () => {
    it('has unique ids', () => {
        const ids = STATS_PRESETS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('has a valid hex default color for every preset', () => {
        for (const preset of STATS_PRESETS) {
            expect(preset.defaultColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
    });
});
