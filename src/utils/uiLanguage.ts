import type { AppSettings } from '../types';

export const UI_LANGUAGES = ['en', 'nl', 'fr', 'de', 'es'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

function isUiLanguage(code: string): code is UiLanguage {
    return (UI_LANGUAGES as readonly string[]).includes(code);
}

export function baseLanguage(tag: string | undefined): string {
    return (tag ?? '').split('-')[0].toLowerCase();
}

/** The interface language a BCP 47 tag ends up showing: its base code when the app ships it, else English (i18n's fallback). */
export function displayedUiLanguage(tag: string | undefined): UiLanguage {
    const base = baseLanguage(tag);
    return isUiLanguage(base) ? base : 'en';
}

/**
 * The interface language the user picked, or null to follow the browser. `settings.language` defaults
 * to 'en', so an 'en' saved before `languageChosen` existed may only be the default; any other stored
 * value was chosen by hand.
 */
export function chosenUiLanguage(settings: Pick<AppSettings, 'language' | 'languageChosen'>): UiLanguage | null {
    const language = settings.language?.toLowerCase();
    if (!language || !isUiLanguage(language)) return null;
    if (settings.languageChosen || language !== 'en') return language;
    return null;
}
