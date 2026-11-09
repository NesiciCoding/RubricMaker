import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT_LANGUAGE, resolveContentLanguage, resolveQuestionContentLanguage } from './contentLanguage';

describe('resolveContentLanguage (#956)', () => {
    it('returns the first non-blank candidate', () => {
        expect(resolveContentLanguage('fr')).toBe('fr');
        expect(resolveContentLanguage(undefined, 'nl')).toBe('nl');
        expect(resolveContentLanguage(null, '', '  ', 'de')).toBe('de');
    });

    it('defaults to English and never touches the interface language', () => {
        expect(resolveContentLanguage()).toBe(DEFAULT_CONTENT_LANGUAGE);
        expect(resolveContentLanguage(undefined, null, '')).toBe('en');
    });

    it('keeps explicit BCP-47 codes as-is for useTTS to map', () => {
        expect(resolveContentLanguage('fr-FR')).toBe('fr-FR');
    });
});

describe('resolveQuestionContentLanguage (#956)', () => {
    const test = { contentLanguage: 'en' };
    const section = { contentLanguage: 'fr' };

    it('prefers the question override, then section, then test, then English', () => {
        expect(resolveQuestionContentLanguage({ contentLanguage: 'es' }, section, test)).toBe('es');
        expect(resolveQuestionContentLanguage({}, section, test)).toBe('fr');
        expect(resolveQuestionContentLanguage({}, {}, test)).toBe('en');
        expect(resolveQuestionContentLanguage({}, {}, {})).toBe('en');
    });

    it('tolerates missing question/section/test', () => {
        expect(resolveQuestionContentLanguage(undefined, undefined, undefined)).toBe('en');
        expect(resolveQuestionContentLanguage(undefined, section, undefined)).toBe('fr');
    });
});
