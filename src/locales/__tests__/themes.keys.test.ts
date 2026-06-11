import { describe, it, expect } from 'vitest';
import en from '../en.json';
import nl from '../nl.json';
import fr from '../fr.json';
import de from '../de.json';
import es from '../es.json';
import { THEME_BUNDLES } from '../../data/themes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const locales: Record<string, any> = { en, nl, fr, de, es };

describe('theme bundle locale parity', () => {
    const referenceKeys = ['theme_bundles_label', ...THEME_BUNDLES.map((b) => `theme_bundle_${b.id}`)].sort();

    it('en.json settings has a label key for every THEME_BUNDLES id plus theme_bundles_label', () => {
        for (const key of referenceKeys) {
            expect(typeof en.settings[key as keyof typeof en.settings], `en.settings.${key}`).toBe('string');
        }
    });

    for (const lang of ['nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has the same theme bundle keys as en.json with non-empty values`, () => {
            for (const key of referenceKeys) {
                const value = locales[lang].settings[key];
                expect(typeof value, `${lang}.settings.${key} should be a string`).toBe('string');
                expect(value.length, `${lang}.settings.${key} should be non-empty`).toBeGreaterThan(0);
            }
        });
    }
});
