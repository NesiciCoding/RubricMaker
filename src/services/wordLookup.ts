import { lookupWord as lookupFreeDictionary } from './freeDictionaryApi';
import { lookupWordnet } from './wordnetPack';

// MyMemory is a free public translation API: no key or account, CORS-enabled, rate-limited per IP.
const TRANSLATE_BASE = 'https://api.mymemory.translated.net/get';
// MyMemory's `de` parameter identifies the deployment by email, which raises the anonymous daily quota.
const TRANSLATE_CONTACT_EMAIL = 'admin@rubricmaker.nl';
const TIMEOUT_MS = 5000;
const CONCURRENCY = 4;

export interface WordDetails {
    definition: string | null;
    phonetic: string | null;
    partOfSpeech: string | null;
    example: string | null;
    translation: string | null;
}

const translationCache = new Map<string, string>();

/** Two-letter target code from an i18n language tag; null when no translation is wanted (English). */
export function translationTarget(language: string): string | null {
    const code = language.slice(0, 2).toLowerCase();
    return /^[a-z]{2}$/.test(code) && code !== 'en' ? code : null;
}

export async function translateWord(word: string, target: string): Promise<string | null> {
    const term = word.trim().toLowerCase();
    if (!term) return null;
    const cacheKey = `${target}:${term}`;
    const cached = translationCache.get(cacheKey);
    if (cached) return cached;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(
            `${TRANSLATE_BASE}?q=${encodeURIComponent(term)}&langpair=en|${target}&de=${encodeURIComponent(TRANSLATE_CONTACT_EMAIL)}`,
            {
                signal: controller.signal,
            }
        );
        if (!res.ok) return null;
        const data = (await res.json()) as {
            responseStatus?: number | string;
            responseData?: { translatedText?: string };
        };
        const text = data.responseData?.translatedText?.trim().toLowerCase();
        if (Number(data.responseStatus) !== 200 || !text || text === term) return null;
        translationCache.set(cacheKey, text);
        return text;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/** Online dictionary first; falls back to the downloaded WordNet pack when offline or the word is unknown. */
export async function lookupWordDetails(word: string, target: string | null): Promise<WordDetails> {
    const [online, translation] = await Promise.all([
        lookupFreeDictionary(word),
        target ? translateWord(word, target) : Promise.resolve(null),
    ]);
    if (online) return { ...online, translation };
    const offline = await lookupWordnet(word);
    return {
        definition: offline?.definition ?? null,
        phonetic: null,
        partOfSpeech: offline?.partOfSpeech ?? null,
        example: offline?.example ?? null,
        translation,
    };
}

/** Looks up many words with limited concurrency, preserving input order. */
export async function lookupManyWordDetails(
    words: string[],
    target: string | null,
    onProgress?: (done: number, total: number) => void
): Promise<WordDetails[]> {
    const results: WordDetails[] = new Array(words.length);
    let next = 0;
    let done = 0;
    async function worker() {
        while (next < words.length) {
            const i = next++;
            results[i] = await lookupWordDetails(words[i], target);
            onProgress?.(++done, words.length);
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, words.length) }, worker));
    return results;
}
