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

describe('messages namespace locale parity', () => {
    const referenceKeys = flattenKeys(en.messages).sort();

    it('the en.json messages namespace is non-empty', () => {
        expect(referenceKeys.length).toBeGreaterThan(0);
    });

    for (const lang of ['nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has the same messages keys as en.json`, () => {
            expect(locales[lang].messages, `${lang}.messages is missing`).toBeDefined();
            const keys = flattenKeys(locales[lang].messages).sort();
            expect(keys).toEqual(referenceKeys);
        });
    }
});

describe('14.3 messaging keys added outside the messages namespace', () => {
    const scatteredKeys: Array<[string, string]> = [
        ['navigation', 'messages'],
        ['notifications', 'unread_messages_subtitle'],
        ['studentPortal', 'messages_section_title'],
        ['studentPortal', 'ask_question_placeholder'],
        ['studentPortal', 'no_messages_yet'],
        ['settings', 'notify_on_message_label'],
        ['settings', 'notify_on_message_help'],
    ];

    for (const [namespace, key] of scatteredKeys) {
        for (const lang of ['en', 'nl', 'fr', 'de', 'es']) {
            it(`${lang}.json has ${namespace}.${key}`, () => {
                expect(locales[lang][namespace]?.[key], `${lang}.${namespace}.${key} is missing`).toBeTruthy();
            });
        }
    }
});
