import { describe, expect, it } from 'vitest';
import { chosenUiLanguage, displayedUiLanguage } from './uiLanguage';

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

    it('ignores a language the app does not ship', () => {
        expect(chosenUiLanguage({ language: 'ar', languageChosen: true })).toBeNull();
        expect(chosenUiLanguage({ language: '', languageChosen: true })).toBeNull();
    });
});
