import { describe, expect, it } from 'vitest';
import { baseLanguage, chosenUiLanguage, displayedUiLanguage } from './uiLanguage';

describe('baseLanguage', () => {
    it('lower-cases the primary subtag', () => {
        expect(baseLanguage('pt-BR')).toBe('pt');
        expect(baseLanguage('NL')).toBe('nl');
        expect(baseLanguage(undefined)).toBe('');
    });
});

describe('displayedUiLanguage', () => {
    it('reduces a tag to a language the app ships', () => {
        expect(displayedUiLanguage('nl-NL')).toBe('nl');
        expect(displayedUiLanguage('de')).toBe('de');
        expect(displayedUiLanguage('ES-mx')).toBe('es');
    });

    it('falls back to English, which i18next shows for anything else', () => {
        expect(displayedUiLanguage('pt-BR')).toBe('en');
        expect(displayedUiLanguage('')).toBe('en');
        expect(displayedUiLanguage(undefined)).toBe('en');
    });
});

// #615: settings.language defaults to 'en', so it cannot override a Dutch browser unless chosen.
describe('chosenUiLanguage', () => {
    it('follows the browser while the stored language is only the default', () => {
        expect(chosenUiLanguage({ language: 'en' })).toBeNull();
        expect(chosenUiLanguage({ language: 'en', languageChosen: false })).toBeNull();
    });

    it('applies English once it was picked explicitly', () => {
        expect(chosenUiLanguage({ language: 'en', languageChosen: true })).toBe('en');
    });

    it('treats any other stored language as a choice, including ones saved before the flag existed', () => {
        expect(chosenUiLanguage({ language: 'nl' })).toBe('nl');
        expect(chosenUiLanguage({ language: 'fr', languageChosen: true })).toBe('fr');
    });

    it('follows the browser again once reset to Automatic, even with a non-English language left over', () => {
        expect(chosenUiLanguage({ language: 'nl', languageChosen: false })).toBeNull();
        expect(chosenUiLanguage({ language: 'fr', languageChosen: false })).toBeNull();
    });

    it('ignores a language the app does not ship', () => {
        expect(chosenUiLanguage({ language: 'ar', languageChosen: true })).toBeNull();
        expect(chosenUiLanguage({ language: '', languageChosen: true })).toBeNull();
    });
});
