import { describe, it, expect } from 'vitest';
import { contrastRatio, meetsAAA, parseHex } from './contrastCheck';
import { THEME_BUNDLES, ACCENT_PRESETS } from '../data/themes';
import { CEFR_LEVEL_COLORS } from '../data/cefrDescriptors';

const AAA_NORMAL = 7;
const AAA_LARGE = 4.5;

/**
 * Surface + text tokens are declared globally in src/index.css (not per-bundle),
 * so the real declared values are mirrored here. color-mix() scale shades cannot
 * be computed in jsdom, so the 700-step (32% black in sRGB) used for text-on-light
 * is replicated numerically — the static accent hex stays the source of truth.
 */
const DARK_BG = { bg: '#0f1219', raised: '#181c26', elevated: '#1f2533', card: '#252d3d' };
const DARK_TEXT = '#f1f5f9';
const LIGHT_BG = { bg: '#f8fafc', raised: '#ffffff', elevated: '#f1f5f9' };
const LIGHT_TEXT = '#0f172a';

function shade700(hex: string): string {
    const { r, g, b } = parseHex(hex);
    const f = 0.68;
    const to = (v: number) =>
        Math.round(v * f)
            .toString(16)
            .padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
}

describe('contrastRatio', () => {
    it('black on white is 21:1', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    });

    it('is symmetric', () => {
        expect(contrastRatio('#1d4ed8', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#1d4ed8'), 5);
    });

    it('a mid-grey on white falls in the expected band', () => {
        const ratio = contrastRatio('#767676', '#ffffff');
        expect(ratio).toBeGreaterThan(4.5);
        expect(ratio).toBeLessThan(5);
    });

    it('identical colors are 1:1', () => {
        expect(contrastRatio('#3b82f6', '#3b82f6')).toBeCloseTo(1, 5);
    });

    it('meetsAAA respects normal vs large thresholds', () => {
        expect(meetsAAA('#767676', '#ffffff')).toBe(false);
        expect(meetsAAA('#767676', '#ffffff', true)).toBe(true);
    });
});

describe('surface text tokens meet AAA (>=7:1)', () => {
    for (const [name, bg] of Object.entries(DARK_BG)) {
        it(`dark text on ${name}`, () => {
            expect(contrastRatio(DARK_TEXT, bg)).toBeGreaterThanOrEqual(AAA_NORMAL);
        });
    }
    for (const [name, bg] of Object.entries(LIGHT_BG)) {
        it(`light text on ${name}`, () => {
            expect(contrastRatio(LIGHT_TEXT, bg)).toBeGreaterThanOrEqual(AAA_NORMAL);
        });
    }
});

describe('theme bundles meet AAA accent contrast', () => {
    for (const theme of THEME_BUNDLES) {
        it(`${theme.id} button: white label on accent (>=4.5:1 large)`, () => {
            expect(contrastRatio('#ffffff', theme.accentColor)).toBeGreaterThanOrEqual(AAA_LARGE);
        });

        it(`${theme.id} link: accent-700 text on light bg (>=7:1)`, () => {
            expect(contrastRatio(shade700(theme.accentColor), LIGHT_BG.bg)).toBeGreaterThanOrEqual(AAA_NORMAL);
        });

        it(`${theme.id} export header text on white (>=7:1)`, () => {
            expect(contrastRatio(theme.exportHeaderColor, '#ffffff')).toBeGreaterThanOrEqual(AAA_NORMAL);
        });
    }
});

describe('accent presets meet AAA button contrast', () => {
    for (const preset of ACCENT_PRESETS) {
        it(`${preset.id} button: white label on accent (>=4.5:1 large)`, () => {
            expect(contrastRatio('#ffffff', preset.color)).toBeGreaterThanOrEqual(AAA_LARGE);
        });

        it(`${preset.id} link: accent-700 text on light bg (>=7:1)`, () => {
            expect(contrastRatio(shade700(preset.color), LIGHT_BG.bg)).toBeGreaterThanOrEqual(AAA_NORMAL);
        });
    }
});

describe('CEFR level colors as white-text badges (>=4.5:1 large)', () => {
    for (const [level, color] of Object.entries(CEFR_LEVEL_COLORS)) {
        it(`${level} badge`, () => {
            expect(contrastRatio('#ffffff', color)).toBeGreaterThanOrEqual(AAA_LARGE);
        });
    }
});
