import type { AppSettings } from '../types';

export type GrammarEnglishVariant = NonNullable<AppSettings['grammarEnglishVariant']>;

export const GRAMMAR_LANGUAGES = ['en-GB', 'en-US', 'nl', 'fr', 'de-DE', 'es'] as const;
export type GrammarLanguage = (typeof GRAMMAR_LANGUAGES)[number];

type DetectedLanguage = 'en' | 'nl' | 'fr' | 'de' | 'es';

// Function words only: they dominate any running text, so a handful of sentences is enough to
// tell the five app languages apart. Words shared between languages ('de', 'en', 'la', 'que')
// count for each; the distinctive ones decide.
const FUNCTION_WORDS: Record<DetectedLanguage, ReadonlySet<string>> = {
    en: new Set('the and of to is that it was for with you this are have not but they be my i'.split(' ')),
    nl: new Set('de het een en van ik dat niet zijn op te met voor maar ook er wij je naar heb deze'.split(' ')),
    fr: new Set('le la les et est un une des du que pas pour dans ce il elle nous sont avec je au'.split(' ')),
    de: new Set('der die das und ist nicht ein eine ich zu den mit sich auf für auch es wir sie dem'.split(' ')),
    es: new Set('el la los las y es un una que de en por con para no se su del al muy'.split(' ')),
};

const LANGUAGE_TAG: Record<Exclude<DetectedLanguage, 'en'>, GrammarLanguage> = {
    nl: 'nl',
    fr: 'fr',
    de: 'de-DE',
    es: 'es',
};

const MAX_WORDS = 2000;
const MIN_MATCHES = 3;
const MIN_LEAD = 1.5;

/** Best guess at which of the app's five languages `text` is written in, or null when unsure. */
export function detectTextLanguage(text: string): DetectedLanguage | null {
    const words =
        text
            .toLowerCase()
            .match(/\p{L}+/gu)
            ?.slice(0, MAX_WORDS) ?? [];
    const scores = (Object.keys(FUNCTION_WORDS) as DetectedLanguage[]).map((lang) => ({
        lang,
        score: words.reduce((n, w) => (FUNCTION_WORDS[lang].has(w) ? n + 1 : n), 0),
    }));
    scores.sort((a, b) => b.score - a.score);
    const [best, runnerUp] = scores;
    if (best.score < MIN_MATCHES || best.score < runnerUp.score * MIN_LEAD) return null;
    return best.lang;
}

/**
 * LanguageTool language code for `text`. English (and anything undetectable, since this is an
 * EFL app) uses the teacher's spelling variant, so British spellings aren't flagged as errors.
 */
export function resolveGrammarLanguage(text: string, englishVariant: GrammarEnglishVariant = 'en-US'): GrammarLanguage {
    const detected = detectTextLanguage(text);
    return detected && detected !== 'en' ? LANGUAGE_TAG[detected] : englishVariant;
}
