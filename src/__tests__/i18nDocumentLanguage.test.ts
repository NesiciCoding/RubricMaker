import { afterAll, describe, expect, it } from 'vitest';
import i18n, { i18nReady } from '../i18n';

// #615: index.html ships lang="en", and screen readers pick their voice from it.
describe('html lang', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('follows the interface language', async () => {
        await i18nReady;
        await i18n.changeLanguage('nl');
        expect(document.documentElement.lang).toBe('nl');
        await i18n.changeLanguage('de-AT');
        expect(document.documentElement.lang).toBe('de');
    });

    it('says English when the browser asks for a language the app does not ship', async () => {
        await i18n.changeLanguage('pt-BR');
        expect(document.documentElement.lang).toBe('en');
    });
});
