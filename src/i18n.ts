import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';

i18n.use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: {
                translation: en,
            },
        },
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false, // react already safes from xss
        },
    });

// Non-English locale files are ~200KB of JSON each — loading all 5 upfront meant every
// visitor downloaded ~1MB of translations regardless of language. 'en' stays bundled as
// the always-available fallback; the rest load on demand, keyed off whatever language
// LanguageDetector picks or the user later switches to via Settings' i18n.changeLanguage().
const lazyLocales: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
    nl: () => import('./locales/nl.json'),
    fr: () => import('./locales/fr.json'),
    de: () => import('./locales/de.json'),
    es: () => import('./locales/es.json'),
};

function loadLocale(lng: string) {
    const base = lng.split('-')[0];
    const loader = lazyLocales[base];
    if (!loader || i18n.hasResourceBundle(base, 'translation')) return;
    void loader()
        .then(({ default: resources }) => {
            i18n.addResourceBundle(base, 'translation', resources);
            // addResourceBundle doesn't itself trigger a re-render — react-i18next's
            // useTranslation only re-renders on 'languageChanged', so re-emit it once the
            // freshly-loaded strings are actually in the store.
            if (i18n.language === lng) i18n.emit('languageChanged', i18n.language);
        })
        .catch((error) => {
            console.error(`Failed to load ${base} locale`, error);
        });
}

if (i18n.language) loadLocale(i18n.language);
i18n.on('languageChanged', loadLocale);

export default i18n;
