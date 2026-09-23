import i18n from 'i18next';
import en from '../locales/en.json';

/**
 * Initialise the shared i18next singleton with the English bundle for tests that exercise
 * non-component code calling `i18n.t(...)` directly (export formatters). Vitest isolates module
 * state per file, so this only affects the file that calls it — component tests that assert on raw
 * translation keys keep their uninitialised instance.
 */
export async function initTestI18n(): Promise<void> {
    if (!i18n.isInitialized) {
        await i18n.init({
            lng: 'en',
            fallbackLng: 'en',
            resources: { en: { translation: en } },
            interpolation: { escapeValue: false },
        });
    } else if (!i18n.hasResourceBundle('en', 'translation')) {
        i18n.addResourceBundle('en', 'translation', en);
    }
}
