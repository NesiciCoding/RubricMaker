import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// #969 (CodeRabbit): Automatic mode means "always follow the browser", but the detector
// caches whatever it last detected and that cache wins over navigator on the next boot.
// Each test re-imports a fresh './i18n' module (simulating a page reload) against a
// localStorage state seeded before that import, since the clearing logic runs at module
// evaluation time, before the detector's own init() runs.
describe('i18n boot: Automatic-mode detector cache clearing (#969)', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('clears a stale cached language on boot while Automatic is selected', async () => {
        localStorage.setItem('rm_settings', JSON.stringify({ languageChosen: false }));
        localStorage.setItem('i18nextLng', 'fr');

        await import('./i18n');

        // jsdom's default navigator.language ('en-US') is what detect() falls through to
        // once the stale 'fr' cache is gone, and the detector re-caches that fresh result.
        expect(localStorage.getItem('i18nextLng')).toBe('en-US');
    });

    it('leaves the cached language alone once a language was explicitly chosen', async () => {
        localStorage.setItem('rm_settings', JSON.stringify({ language: 'fr', languageChosen: true }));
        localStorage.setItem('i18nextLng', 'fr');

        await import('./i18n');

        expect(localStorage.getItem('i18nextLng')).toBe('fr');
    });

    it('leaves the cache alone when there are no settings yet (first boot)', async () => {
        localStorage.setItem('i18nextLng', 'fr');

        await import('./i18n');

        expect(localStorage.getItem('i18nextLng')).toBe('fr');
    });

    it('does not throw on corrupt settings JSON', async () => {
        localStorage.setItem('rm_settings', '{not json');
        localStorage.setItem('i18nextLng', 'fr');

        await expect(import('./i18n')).resolves.toBeDefined();
        expect(localStorage.getItem('i18nextLng')).toBe('fr');
    });
});
