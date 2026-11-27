import { describe, expect, it } from 'vitest';
import en from '../en.json';
import nl from '../nl.json';
import fr from '../fr.json';
import de from '../de.json';
import es from '../es.json';
import { ADVISORY_KEYS } from '../../utils/markTextOperations';

const LOCALES: Record<string, Record<string, unknown>> = { en, nl, fr, de, es };

// ProofMarkEditor and markTextOperations resolve these keys at runtime (`suggestion.${kind}`,
// `reason.${code}`, the advisory table and the propose/proposed toasts), so usedKeys.test.ts
// cannot see them as literals. They are listed here so a missing translation fails a test.
const SUGGESTIONS = [
    'delete',
    'deleteWithSpace',
    'closeup',
    'insert',
    'replace',
    'transpose',
    'split',
    'alignLeft',
    'alignCenter',
    'alignRight',
];

const REASONS = ['acrossBlocks', 'needsTwoWords', 'noWhitespace', 'noReplacement', 'alreadyThere', 'noBlock'];

const SCALAR_KEYS = [
    'proofMarks.apply.propose',
    'proofMarks.apply.proposed',
    'proofMarks.apply.advisory',
    'proofMarks.apply.notTextOperation',
];

const DYNAMIC_KEYS = [
    ...SCALAR_KEYS,
    ...SUGGESTIONS.map((key) => `proofMarks.apply.suggestion.${key}`),
    ...REASONS.map((key) => `proofMarks.apply.reason.${key}`),
];

function valueAt(bundle: Record<string, unknown>, key: string): unknown {
    return key
        .split('.')
        .reduce<unknown>(
            (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
            bundle
        );
}

function leafKeys(node: unknown): string[] {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
        value && typeof value === 'object' && !Array.isArray(value) ? leafKeys(value).map((k) => `${key}.${k}`) : [key]
    );
}

describe('proofMarks.apply keys built at runtime', () => {
    it('lists the keys the panel actually builds', () => {
        expect(DYNAMIC_KEYS).toHaveLength(SCALAR_KEYS.length + SUGGESTIONS.length + REASONS.length);
        expect(new Set(DYNAMIC_KEYS).size).toBe(DYNAMIC_KEYS.length);
        expect(Object.values(ADVISORY_KEYS)).toEqual(REASONS.map((key) => `proofMarks.apply.reason.${key}`));
    });

    for (const [lang, bundle] of Object.entries(LOCALES)) {
        it(`${lang}.json defines every dynamic proofMarks.apply key`, () => {
            const missing = DYNAMIC_KEYS.filter((key) => {
                const value = valueAt(bundle, key);
                return typeof value !== 'string' || value.trim() === '';
            });
            expect(missing).toEqual([]);
        });

        it(`${lang}.json defines exactly the suggestion and reason keys the code can build`, () => {
            const suggestion = valueAt(bundle, 'proofMarks.apply.suggestion');
            const reason = valueAt(bundle, 'proofMarks.apply.reason');

            expect(leafKeys(suggestion).sort()).toEqual([...SUGGESTIONS].sort());
            expect(leafKeys(reason).sort()).toEqual([...REASONS].sort());
        });
    }
});
