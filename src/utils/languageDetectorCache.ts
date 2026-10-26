// The default lookupLocalStorage key i18next-browser-languagedetector caches a resolved
// language under. Lives in its own module (no 'i18next'/'react-i18next' import) so both
// i18n.ts (boot-time) and UI code that resets it can share the same key and clearing logic
// without pulling in i18next's own module-eval-time init() as an import side effect.
export const LANGUAGE_DETECTOR_CACHE_KEY = 'i18nextLng';

export function resetLanguageDetectorCache(): void {
    try {
        localStorage.removeItem(LANGUAGE_DETECTOR_CACHE_KEY);
    } catch {
        // Private-mode/blocked storage — detect() still runs, just without a cache to clear.
    }
}
