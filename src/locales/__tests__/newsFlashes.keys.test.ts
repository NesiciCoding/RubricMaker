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

describe('newsFlashes namespace locale parity', () => {
    const referenceKeys = flattenKeys(en.newsFlashes).sort();

    it('the en.json newsFlashes namespace is non-empty', () => {
        expect(referenceKeys.length).toBeGreaterThan(0);
    });

    for (const lang of ['nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has the same newsFlashes keys as en.json`, () => {
            expect(locales[lang].newsFlashes, `${lang}.newsFlashes is missing`).toBeDefined();
            const keys = flattenKeys(locales[lang].newsFlashes).sort();
            expect(keys).toEqual(referenceKeys);
        });
    }
});

describe('16.4 news flash keys added outside the newsFlashes namespace', () => {
    const scatteredKeys: Array<[string, string]> = [
        ['navigation', 'news_flashes'],
        ['search', 'type_newsFlash'],
        ['docs', 'route_news_flashes_label'],
        ['docs', 'route_news_flashes_desc'],
        ['docs', 'ce_news_flashes_title'],
        ['docs', 'ce_news_flashes_intro'],
        ['docs', 'ce_news_flashes_item_create'],
        ['docs', 'ce_news_flashes_item_link'],
        ['docs', 'ce_news_flashes_item_timeline'],
        ['docs', 'ce_news_flashes_info'],
    ];

    for (const [namespace, key] of scatteredKeys) {
        for (const lang of ['en', 'nl', 'fr', 'de', 'es']) {
            it(`${lang}.json has ${namespace}.${key}`, () => {
                expect(locales[lang][namespace]?.[key], `${lang}.${namespace}.${key} is missing`).toBeTruthy();
            });
        }
    }
});
