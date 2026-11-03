import { describe, it, expect } from 'vitest';
import { STATS_SECTIONS, isSectionVisible, toggleSection } from './statsSections';

describe('statsSections', () => {
    it('shows every section by default', () => {
        expect(STATS_SECTIONS.every((s) => isSectionVisible(undefined, s.id))).toBe(true);
    });

    it('has unique ids', () => {
        expect(new Set(STATS_SECTIONS.map((s) => s.id)).size).toBe(STATS_SECTIONS.length);
    });

    it('toggles a section off and back on', () => {
        const hidden = toggleSection(undefined, 'heatmap');
        expect(isSectionVisible(hidden, 'heatmap')).toBe(false);
        expect(toggleSection(hidden, 'heatmap')).toEqual([]);
    });
});

describe('statsSections labels', () => {
    it('points every section at an existing English label', async () => {
        const en = (await import('../locales/en.json')).default as Record<string, unknown>;
        const resolve = (key: string) =>
            key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
        for (const s of STATS_SECTIONS) expect(typeof resolve(s.titleKey), s.titleKey).toBe('string');
    });
});
