import { describe, it, expect } from 'vitest';
import en from '../en.json';
import nl from '../nl.json';
import fr from '../fr.json';
import de from '../de.json';
import es from '../es.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const locales: Record<string, any> = { en, nl, fr, de, es };

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return flattenKeys(value as Record<string, unknown>, path);
        }
        return [path];
    });
}

describe('tests.results namespace locale parity', () => {
    const referenceKeys = flattenKeys(en.tests.results).sort();

    it('the en.json tests.results namespace is non-empty', () => {
        expect(referenceKeys.length).toBeGreaterThan(0);
    });

    for (const lang of ['nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has the same tests.results keys as en.json`, () => {
            expect(locales[lang].tests?.results, `${lang}.tests.results is missing`).toBeDefined();
            const keys = flattenKeys(locales[lang].tests.results).sort();
            expect(keys).toEqual(referenceKeys);
        });
    }
});
