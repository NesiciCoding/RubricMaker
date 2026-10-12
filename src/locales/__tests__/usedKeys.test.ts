import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '../en.json';
import nl from '../nl.json';
import fr from '../fr.json';
import de from '../de.json';
import es from '../es.json';

const LOCALES: Record<string, Record<string, unknown>> = { en, nl, fr, de, es };

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Keys built at runtime (template literals, lookups) are not string literals, so they never reach
// this scan. List a literal key here only if it is intentionally resolved outside en.json.
const ALLOWED_MISSING = new Set<string>();

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

function flattenKeys(obj: Record<string, unknown>, prefix = '', out = new Set<string>()): Set<string> {
    for (const [key, value] of Object.entries(obj)) {
        const keyPath = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            flattenKeys(value as Record<string, unknown>, keyPath, out);
        } else {
            out.add(keyPath);
        }
    }
    return out;
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return ['__tests__', 'test-utils', 'locales'].includes(entry.name) ? [] : sourceFiles(full);
        }
        return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [full] : [];
    });
}

const KEY = String.raw`([a-zA-Z][\w-]*(?:\.[\w-]+)+)`;
const USAGE_PATTERNS = [
    new RegExp(String.raw`\bt\(\s*['"]${KEY}['"]`, 'g'),
    new RegExp(String.raw`i18nKey=\{?\s*['"]${KEY}['"]`, 'g'),
];

function findUsedKeys(source: string): string[] {
    return USAGE_PATTERNS.flatMap((pattern) => [...source.matchAll(pattern)].map((m) => m[1]));
}

describe('translation keys used in src/', () => {
    const usages = sourceFiles(srcRoot).flatMap((file) =>
        findUsedKeys(readFileSync(file, 'utf8')).map((key) => ({ key, file: path.relative(srcRoot, file) }))
    );

    it('finds t() and i18nKey usages to check', () => {
        expect(usages.length).toBeGreaterThan(1000);
    });

    for (const [lang, bundle] of Object.entries(LOCALES)) {
        it(`every literal key exists in ${lang}.json`, () => {
            const defined = flattenKeys(bundle);
            const isDefined = (key: string) =>
                defined.has(key) || PLURAL_SUFFIXES.some((suffix) => defined.has(`${key}${suffix}`));
            const missing = usages
                .filter(({ key }) => !isDefined(key) && !ALLOWED_MISSING.has(key))
                .map(({ key, file }) => `${key} (${file})`);
            expect([...new Set(missing)].sort()).toEqual([]);
        });
    }

    it('detects both call styles', () => {
        expect(findUsedKeys(`t('a.b'); t("c.d", 'x'); <Trans i18nKey="e.f" />; i18n.t('g.h')`)).toEqual([
            'a.b',
            'c.d',
            'g.h',
            'e.f',
        ]);
    });
});
