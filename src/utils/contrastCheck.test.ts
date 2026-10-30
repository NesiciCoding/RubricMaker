import { describe, it, expect } from 'vitest';
import { contrastRatio, meetsAAA, parseHex } from './contrastCheck';
import { THEME_BUNDLES, ACCENT_PRESETS } from '../data/themes';
import { CEFR_LEVEL_COLORS } from '../data/cefrDescriptors';

const AAA_NORMAL = 7;
const AAA_LARGE = 4.5;

/**
 * The accent *maths* below starts from each bundle's accent hex: the button label and the export
 * header. Using the accent as readable text is a separate derivation (`accentTextFor`), guarded
 * against the real stylesheet in contrastPalette.test.ts.
 */

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

    it('parseHex accepts 3-digit shorthand and rejects a misplaced #', () => {
        expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
        expect(() => parseHex('abc#def')).toThrow('Invalid hex color');
    });

    it('accepts an Rgb object directly', () => {
        expect(contrastRatio({ r: 0, g: 0, b: 0 }, '#ffffff')).toBeCloseTo(21, 1);
        expect(contrastRatio('#000000', { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 1);
    });
});

describe('theme bundles meet AAA accent contrast', () => {
    for (const theme of THEME_BUNDLES) {
        it(`${theme.id} button: white label on accent (>=4.5:1 large)`, () => {
            expect(contrastRatio('#ffffff', theme.accentColor)).toBeGreaterThanOrEqual(AAA_LARGE);
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
    }
});

describe('CEFR level colors as white-text badges (>=4.5:1 large)', () => {
    for (const [level, color] of Object.entries(CEFR_LEVEL_COLORS)) {
        it(`${level} badge`, () => {
            expect(contrastRatio('#ffffff', color)).toBeGreaterThanOrEqual(AAA_LARGE);
        });
    }
});
