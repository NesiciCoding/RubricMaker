import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { displayedUiLanguage } from './utils/uiLanguage';
import { resetLanguageDetectorCache } from './utils/languageDetectorCache';

// Automatic mode (settings.languageChosen === false) means "always follow the browser", but
// the detector caches whatever it last detected under LANGUAGE_DETECTOR_CACHE_KEY, and that
// cached value — not navigator — wins on the next detect() (it's earlier in the lookup order).
// Left alone, switching the OS/browser language while Automatic is selected has no visible
// effect until the user re-opens the picker, because a plain reload just reads the stale cache
// straight back. Settings load from the same 'rm_settings' key storage.ts uses (read directly,
// not via storage.ts's loadStore(), which does unrelated migration work this early boot path
// shouldn't trigger) — if Automatic was selected, clear the cache before init() so detect()
// falls through to navigator fresh on every boot, not just the moment the option was picked.
try {
    const raw = localStorage.getItem('rm_settings');
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && (parsed as { languageChosen?: unknown }).languageChosen === false) {
        resetLanguageDetectorCache();
    }
} catch {
    // Corrupt settings JSON or blocked storage — leave the detector cache as is.
}

i18n.use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {},
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false, // react already safes from xss
        },
        // We gate the initial render on `i18nReady` (main.tsx) so `en` is always present before
        // the first paint — no backend/suspense needed, and no flash of untranslated keys.
        react: { useSuspense: false },
    });

// `en` is the always-available fallback. It used to be bundled straight into the main entry
// chunk (~66KB gzip that every visitor downloaded before first paint); load it as its own chunk
// instead. `i18nReady` resolves once it's in the store; main.tsx awaits it before rendering.
export const i18nReady = import('./locales/en.json').then(({ default: en }) => {
    i18n.addResourceBundle('en', 'translation', en);
    if (i18n.language?.split('-')[0] === 'en') i18n.emit('languageChanged', i18n.language);
});

// Non-English locale files are ~200KB of JSON each — loading all 5 upfront meant every
// visitor downloaded ~1MB of translations regardless of language. 'en' stays bundled as
// the always-available fallback; the rest load on demand, keyed off whatever language
// LanguageDetector picks or the user later chooses (applied app-wide by AppContext).
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

// index.html ships lang="en"; screen readers pick their voice from it, so it must follow the
// language actually on screen (#615).
function setDocumentLanguage(lng: string | undefined) {
    document.documentElement.lang = displayedUiLanguage(lng);
}
setDocumentLanguage(i18n.language);
i18n.on('languageChanged', setDocumentLanguage);

export default i18n;
