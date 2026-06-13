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

describe('tests.monitor namespace locale parity', () => {
    const referenceKeys = flattenKeys(en.tests.monitor).sort();

    it('the en.json tests.monitor namespace is non-empty', () => {
        expect(referenceKeys.length).toBeGreaterThan(0);
    });

    for (const lang of ['nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has the same tests.monitor keys as en.json`, () => {
            expect(locales[lang].tests?.monitor, `${lang}.tests.monitor is missing`).toBeDefined();
            const keys = flattenKeys(locales[lang].tests.monitor).sort();
            expect(keys).toEqual(referenceKeys);
        });
    }
});
