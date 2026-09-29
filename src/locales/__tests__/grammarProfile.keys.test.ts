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

describe('grammarProfile namespace locale parity', () => {
    const referenceKeys = flattenKeys(en.grammarProfile).sort();

    it('the en.json grammarProfile namespace is non-empty', () => {
        expect(referenceKeys.length).toBeGreaterThan(0);
    });

    for (const lang of ['nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has the same grammarProfile keys as en.json`, () => {
            expect(locales[lang].grammarProfile, `${lang}.grammarProfile is missing`).toBeDefined();
            const keys = flattenKeys(locales[lang].grammarProfile).sort();
            expect(keys).toEqual(referenceKeys);
        });
    }
});
