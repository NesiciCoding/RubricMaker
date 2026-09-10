import { describe, it, expect } from 'vitest';
import { isSupportedOcrLanguage, resolveOcrLanguages, DEFAULT_OCR_LANGUAGE } from './ocrLanguage';

describe('isSupportedOcrLanguage', () => {
    it('recognises shipped traineddata codes only', () => {
        expect(isSupportedOcrLanguage('eng')).toBe(true);
        expect(isSupportedOcrLanguage('nld')).toBe(true);
        expect(isSupportedOcrLanguage('xyz')).toBe(false);
        expect(isSupportedOcrLanguage('en')).toBe(false); // a UI locale, not a tesseract code
    });
});

describe('resolveOcrLanguages', () => {
    it('maps UI locales to tesseract codes', () => {
        expect(resolveOcrLanguages('en')).toBe('eng');
        expect(resolveOcrLanguages('nl')).toBe('nld');
        expect(resolveOcrLanguages('fr')).toBe('fra');
        expect(resolveOcrLanguages('de')).toBe('deu');
        expect(resolveOcrLanguages('es')).toBe('spa');
    });

    it('passes through tesseract codes unchanged', () => {
        expect(resolveOcrLanguages('eng')).toBe('eng');
        expect(resolveOcrLanguages('eng+nld')).toBe('eng+nld');
    });

    it('joins arrays and mixed separators into a + string, preserving order', () => {
        expect(resolveOcrLanguages(['en', 'nl'])).toBe('eng+nld');
        expect(resolveOcrLanguages('en,fr')).toBe('eng+fra');
        expect(resolveOcrLanguages('nl de')).toBe('nld+deu');
    });

    it('de-duplicates across locale/code spellings, keeping first occurrence', () => {
        expect(resolveOcrLanguages('en+eng')).toBe('eng');
        expect(resolveOcrLanguages(['nl', 'nld', 'nl'])).toBe('nld');
    });

    it('is case-insensitive and trims whitespace', () => {
        expect(resolveOcrLanguages(' EN ')).toBe('eng');
        expect(resolveOcrLanguages('NL+FR')).toBe('nld+fra');
    });

    it('drops unsupported tokens and falls back to English when nothing valid remains', () => {
        expect(resolveOcrLanguages('en+xx')).toBe('eng');
        expect(resolveOcrLanguages('xx')).toBe(DEFAULT_OCR_LANGUAGE);
        expect(resolveOcrLanguages('')).toBe('eng');
        expect(resolveOcrLanguages(undefined)).toBe('eng');
        expect(resolveOcrLanguages([])).toBe('eng');
    });
});
