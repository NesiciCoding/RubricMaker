import type { Test, TestQuestion, TestSection } from '../types';

/** Fallback when nothing sets a content language: test content is English (#956). */
export const DEFAULT_CONTENT_LANGUAGE = 'en';

/** Languages the test builder offers for content. `useTTS` maps each to voices. */
export const CONTENT_LANGUAGES = ['en', 'nl', 'fr', 'de', 'es'] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

/**
 * Effective content language for TTS voices and `lang` attributes (#956).
 * First non-blank candidate wins; defaults to English. Deliberately never falls
 * back to the interface language — most students use a Dutch UI, which would
 * read English passages with a Dutch voice (see `Test.contentLanguage`).
 */
export function resolveContentLanguage(...candidates: (string | undefined | null)[]): string {
    for (const candidate of candidates) {
        const code = candidate?.trim();
        if (code) return code;
    }
    return DEFAULT_CONTENT_LANGUAGE;
}

/** Per-question override → per-section override → test default → English (#956). */
export function resolveQuestionContentLanguage(
    question: Pick<TestQuestion, 'contentLanguage'> | undefined,
    section: Pick<TestSection, 'contentLanguage'> | undefined,
    test: Pick<Test, 'contentLanguage'> | undefined
): string {
    return resolveContentLanguage(question?.contentLanguage, section?.contentLanguage, test?.contentLanguage);
}
