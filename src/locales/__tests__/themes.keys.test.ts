import { describe, it, expect } from 'vitest';
import en from '../en.json';
import nl from '../nl.json';
import fr from '../fr.json';
import de from '../de.json';
import es from '../es.json';
import { THEME_BUNDLES } from '../../data/themes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const locales: Record<string, any> = { en, nl, fr, de, es };

describe('themes namespace locale parity', () => {
    const referenceKeys = Object.keys(en.themes).sort();

    it('the en.json themes namespace is non-empty', () => {
        expect(referenceKeys.length).toBeGreaterThan(0);
    });

    it('the en.json themes namespace has a key for every THEME_BUNDLES id plus section_title', () => {
        const expectedKeys = ['section_title', ...THEME_BUNDLES.map((b) => b.id)].sort();
        expect(referenceKeys).toEqual(expectedKeys);
    });

    for (const lang of ['nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has the same themes keys as en.json`, () => {
            expect(locales[lang].themes, `${lang}.themes is missing`).toBeDefined();
            const keys = Object.keys(locales[lang].themes).sort();
            expect(keys).toEqual(referenceKeys);
        });

        it(`${lang}.json themes values are non-empty strings`, () => {
            for (const key of referenceKeys) {
                const value = locales[lang].themes[key];
                expect(typeof value, `${lang}.themes.${key} should be a string`).toBe('string');
                expect(value.length, `${lang}.themes.${key} should be non-empty`).toBeGreaterThan(0);
            }
        });
    }
});
