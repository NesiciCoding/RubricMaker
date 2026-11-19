import { describe, expect, it } from 'vitest';
import { describeError, hashText, normalizeMessage, normalizeRoute, ownFrames, scrubMeta } from './errorSanitizer';

const origin = window.location.origin;

describe('normalizeMessage', () => {
    it('removes quoted text, numbers, urls, emails and ids so one failure groups across occurrences', () => {
        const a = normalizeMessage("Cannot read properties of undefined (reading 'Anna Jansen') at row 12");
        const b = normalizeMessage("Cannot read properties of undefined (reading 'Bram de Vries') at row 40");

        expect(a).toBe(b);
        expect(a).not.toMatch(/anna|bram|jansen|12|40/);
    });

    it('drops emails, urls and uuids', () => {
        const text = normalizeMessage(
            'failed for anna@school.nl at https://x.example/#/essay/CODE123 id 3f2b8c1e-aaaa-bbbb-cccc-1234567890ab'
        );

        expect(text).not.toMatch(/anna|school|example|CODE123|3f2b/);
    });
});

describe('describeError', () => {
    it('never keeps the message, only a hash of its normalised form', () => {
        const error = new TypeError("Cannot read properties of undefined (reading 'Secret Student Name')");
        const described = describeError(error);

        expect(JSON.stringify(described)).not.toContain('Secret Student Name');
        expect(described.errorName).toBe('TypeError');
        expect(described.messageHash).toMatch(/^[0-9a-f]{14}$/);
    });

    it('gives the same signature to the same failure and a different one to another', () => {
        const make = (message: string) => {
            const error = new Error(message);
            error.stack = `Error: ${message}\n    at f (${origin}/assets/index-abc.js:10:20)`;
            return describeError(error);
        };

        expect(make("bad value 'x'").signature).toBe(make("bad value 'y'").signature);
        expect(make('something else entirely').signature).not.toBe(make("bad value 'x'").signature);
    });

    it('copes with non-Error values without throwing', () => {
        expect(describeError('plain string').errorName).toBe('NonError');
        expect(describeError({ name: 'Custom', message: 'hello' }).errorName).toBe('Custom');
        expect(describeError(undefined).errorName).toBe('NonError');
        expect(describeError({ name: 'not a valid name!' }).errorName).toBe('NonError');
        expect(() => describeError(Object.create(null))).not.toThrow();
    });
});

describe('ownFrames', () => {
    it('keeps file:line:col of our own bundle for V8 and Firefox/Safari stack formats', () => {
        const stack = [
            'Error: boom',
            `    at handleClick (${origin}/assets/index-BtRH-A10.js:100:20)`,
            `    at Object.run (${origin}/assets/vendor-x.js:5:6)`,
            `render@${origin}/assets/RubricBuilder-Q1.js:7:8`,
        ].join('\n');

        expect(ownFrames(stack)).toEqual([
            'assets/index-BtRH-A10.js:100:20',
            'assets/vendor-x.js:5:6',
            'assets/RubricBuilder-Q1.js:7:8',
        ]);
    });

    it('drops frames from other origins, function names and query strings', () => {
        const stack = [
            'Error: boom',
            'at inject (chrome-extension://abcdef/assets/content.js:1:2)',
            'at cdn (https://cdn.example.com/assets/lib.js:3:4)',
            `at mine (${origin}/assets/index-A.js?v=secret:9:9)`,
        ].join('\n');

        const frames = ownFrames(stack);
        expect(frames.join(' ')).not.toMatch(/extension|cdn|example|secret|mine/);
    });

    it('accepts dev-server source paths and honours the limit', () => {
        const lines = Array.from({ length: 9 }, (_, i) => `at f${i} (${origin}/src/pages/Page${i}.tsx:${i}:1)`);

        expect(ownFrames(lines.join('\n'), 3)).toHaveLength(3);
        expect(ownFrames(lines[0])[0]).toBe('src/pages/Page0.tsx:0:1');
    });

    it('is empty for a missing or unusable stack', () => {
        expect(ownFrames(undefined)).toEqual([]);
        expect(ownFrames('nothing useful here')).toEqual([]);
    });
});

describe('normalizeRoute', () => {
    it('keeps plain route words and replaces ids and share codes', () => {
        expect(normalizeRoute('/rubrics/V1StGXR8_Z5jdHi6B-myT/grade/abc123')).toBe('/rubrics/:id/grade/:id');
        expect(normalizeRoute('/essay/eyJ0aXRsZSI6IkFubmEifQ')).toBe('/essay/:id');
        expect(normalizeRoute('/students/cefr-overview')).toBe('/students/cefr-overview');
        expect(normalizeRoute('/tests/t1/monitor?code=secret')).toBe('/tests/:id/monitor');
        expect(normalizeRoute('')).toBe('/');
    });
});

describe('scrubMeta', () => {
    it('keeps numbers, booleans and identifier-shaped strings', () => {
        expect(scrubMeta({ count: 3, ok: false, teacherKey: 'abc_123-XYZ', nothing: null })).toEqual({
            count: 3,
            ok: false,
            teacherKey: 'abc_123-XYZ',
            nothing: null,
        });
    });

    it('drops sentences, nested objects and non-finite numbers', () => {
        expect(
            scrubMeta({
                message: 'Anna Jansen typed this answer',
                nested: { a: 1 },
                bad: Number.NaN,
                keep: 7,
            })
        ).toEqual({ keep: 7 });
    });

    it('keeps arrays only as safe strings', () => {
        expect(scrubMeta({ frames: ['assets/a.js:1:2', 'free text here'] })).toEqual({ frames: ['assets/a.js:1:2'] });
    });

    it('returns null when nothing survives', () => {
        expect(scrubMeta({ message: 'free text with spaces' })).toBeNull();
        expect(scrubMeta(undefined)).toBeNull();
    });
});

describe('hashText', () => {
    it('is deterministic and spreads different inputs', () => {
        expect(hashText('a')).toBe(hashText('a'));
        expect(hashText('a')).not.toBe(hashText('b'));
        expect(hashText('')).toMatch(/^[0-9a-f]{14}$/);
    });
});
