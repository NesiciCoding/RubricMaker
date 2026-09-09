/**
 * OCR language routing. Tesseract identifies languages by traineddata code
 * (`eng`, `nld`, …), while the app's UI locales are two-letter (`en`, `nl`, …) and a
 * stored scan setting may already hold a tesseract code or a `+`-joined multi-language
 * string. This maps any of those onto a validated, de-duplicated tesseract language
 * string so the recogniser is never handed an unsupported pack.
 *
 * Only languages whose traineddata the app ships (self-hosted, per the plan) are
 * supported; anything else is dropped, falling back to English so recognition still runs.
 */

/** Tesseract traineddata codes the app ships and supports for scan OCR. */
export const SUPPORTED_OCR_LANGUAGES = ['eng', 'nld', 'fra', 'deu', 'spa'] as const;
export type OcrLanguage = (typeof SUPPORTED_OCR_LANGUAGES)[number];

export const DEFAULT_OCR_LANGUAGE: OcrLanguage = 'eng';

/** App UI locale (`src/locales`) → tesseract traineddata code. */
const LOCALE_TO_TESSERACT: Record<string, OcrLanguage> = {
    en: 'eng',
    nl: 'nld',
    fr: 'fra',
    de: 'deu',
    es: 'spa',
};

export function isSupportedOcrLanguage(code: string): code is OcrLanguage {
    return (SUPPORTED_OCR_LANGUAGES as readonly string[]).includes(code);
}

/** Normalise one token (a UI locale or a tesseract code) to a supported code, or null. */
function normaliseOne(token: string): OcrLanguage | null {
    const t = token.trim().toLowerCase();
    if (!t) return null;
    if (isSupportedOcrLanguage(t)) return t;
    return LOCALE_TO_TESSERACT[t] ?? null;
}

/**
 * Resolve UI locales and/or tesseract codes (a string with `+`/`,` separators, or an
 * array) into a canonical tesseract language string like `'eng'` or `'eng+nld'`.
 * Order is preserved, duplicates removed, unsupported tokens dropped; empty input or
 * all-unsupported falls back to English.
 */
export function resolveOcrLanguages(input?: string | string[]): string {
    const tokens = Array.isArray(input) ? input : (input ?? '').split(/[+,\s]+/);
    const resolved: OcrLanguage[] = [];
    for (const token of tokens) {
        const code = normaliseOne(token);
        if (code && !resolved.includes(code)) resolved.push(code);
    }
    return resolved.length > 0 ? resolved.join('+') : DEFAULT_OCR_LANGUAGE;
}
