import { describe, it, expect } from 'vitest';
import { THEME_BUNDLES, ACCENT_PRESETS } from './themes';
import en from '../locales/en.json';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const settingsKeys = (en as Record<string, unknown>).settings as Record<string, string>;

describe('THEME_BUNDLES', () => {
    it('has exactly 6 bundles', () => {
        expect(THEME_BUNDLES).toHaveLength(6);
    });

    it('has unique ids', () => {
        const ids = THEME_BUNDLES.map((b) => b.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes the expected bundle ids', () => {
        const ids = THEME_BUNDLES.map((b) => b.id).sort();
        expect(ids).toEqual(['academy', 'midnight', 'nature', 'rose', 'slate', 'warm']);
    });

    it.each(THEME_BUNDLES)('bundle "$id" has valid, non-empty fields', (bundle) => {
        expect(bundle.accentColor).toMatch(HEX_RE);
        expect(bundle.exportHeaderColor).toMatch(HEX_RE);
        expect(typeof bundle.uiFontFamily).toBe('string');
        expect(bundle.uiFontFamily.length).toBeGreaterThan(0);
        expect(typeof bundle.exportFontFamily).toBe('string');
        expect(bundle.exportFontFamily.length).toBeGreaterThan(0);
    });

    it.each(THEME_BUNDLES)('bundle "$id" has a "settings.theme_bundle_$id" key in en.json', (bundle) => {
        const label = settingsKeys[`theme_bundle_${bundle.id}`];
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
    });

    it('en.json has a settings.theme_bundles_label key', () => {
        expect(typeof settingsKeys.theme_bundles_label).toBe('string');
    });
});

describe('ACCENT_PRESETS', () => {
    it('has 8 presets with unique ids and valid colors', () => {
        expect(ACCENT_PRESETS).toHaveLength(8);
        const ids = ACCENT_PRESETS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const preset of ACCENT_PRESETS) {
            expect(preset.color).toMatch(HEX_RE);
        }
    });
});
