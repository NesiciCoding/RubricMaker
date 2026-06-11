import { describe, it, expect } from 'vitest';
import en from '../en.json';
import nl from '../nl.json';
import fr from '../fr.json';
import de from '../de.json';
import es from '../es.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const locales: Record<string, any> = { en, nl, fr, de, es };

describe('cambridge namespace locale parity', () => {
    const referenceKeys = Object.keys(en.cambridge).sort();

    it('the en.json cambridge namespace is non-empty', () => {
        expect(referenceKeys.length).toBeGreaterThan(0);
    });

    for (const lang of ['nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has the same cambridge keys as en.json`, () => {
            expect(locales[lang].cambridge, `${lang}.cambridge is missing`).toBeDefined();
            const keys = Object.keys(locales[lang].cambridge).sort();
            expect(keys).toEqual(referenceKeys);
        });
    }
});
