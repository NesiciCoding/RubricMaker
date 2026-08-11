// ─── Free Dictionary API Service (prototype) ──────────────────────────────────
// Docs: https://dictionaryapi.dev/
// Endpoint: https://api.dictionaryapi.dev/api/v2/entries/en/<word>
// Auth: none (no key required)
// Format: JSON
//
// Drop-in replacement for cambridgeApi.lookupWord. Keeps the same
// { level, definition } contract and the same (word, apiKey?) signature so
// existing call sites (VocabularyListEditor) work unchanged — apiKey is
// accepted but ignored. Adds `phonetic` and `partOfSpeech` from the richer JSON.
//
// Caveat: Free Dictionary does NOT return a CEFR level, so `level` is always
// null here — CEFR leveling comes from the bundled word-list profiler
// (cefrVocabularyProfiler), not this API. This source is a hobby host with no
// SLA, so successful lookups are cached in-memory for the session. For a
// production deployment prefer the hosted fork at freedictionaryapi.com
// (1,000 req/hr/IP) by swapping BASE.

import type { CefrLevel } from '../types';

const BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const TIMEOUT_MS = 5000;

export interface FreeDictionaryLookupResult {
    level: CefrLevel | null;
    definition: string | null;
    phonetic: string | null;
    partOfSpeech: string | null;
    example: string | null;
}

interface RawDefinition {
    definition?: string;
    example?: string;
}
interface RawMeaning {
    partOfSpeech?: string;
    definitions?: RawDefinition[];
}
interface RawEntry {
    phonetic?: string;
    phonetics?: { text?: string }[];
    meanings?: RawMeaning[];
}

const cache = new Map<string, FreeDictionaryLookupResult>();

function firstPhonetic(entry: RawEntry): string | null {
    if (entry.phonetic?.trim()) return entry.phonetic.trim();
    const fromList = entry.phonetics?.find((p) => p.text?.trim())?.text;
    return fromList?.trim() ?? null;
}

function extractFromJson(data: RawEntry[]): FreeDictionaryLookupResult | null {
    const entry = data[0];
    if (!entry) return null;

    const meaning = entry.meanings?.find((m) => m.definitions?.some((d) => d.definition?.trim()));
    const def = meaning?.definitions?.find((d) => d.definition?.trim());

    const definition = def?.definition?.trim() ?? null;
    if (!definition) return null;

    return {
        level: null,
        definition,
        phonetic: firstPhonetic(entry),
        partOfSpeech: meaning?.partOfSpeech?.trim() ?? null,
        example: def?.example?.trim() ?? null,
    };
}

/**
 * Look up a word in the Free Dictionary API for a plain-text definition,
 * phonetic transcription, and part of speech.
 *
 * Drop-in for cambridgeApi.lookupWord: same signature and { level, definition }
 * shape. `level` is always null (the source has no CEFR data). Returns null for
 * missing input, non-OK responses, request failures/timeouts, or when no usable
 * definition is present. The second argument is ignored (no key required).
 */
export async function lookupWord(word: string, _apiKey?: string): Promise<FreeDictionaryLookupResult | null> {
    const term = word?.trim().toLowerCase();
    if (!term) return null;

    const cached = cache.get(term);
    if (cached) return cached;

    const url = `${BASE}/${encodeURIComponent(term)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        if (!res.ok) return null; // 404 = word not found, 429/502 = host flaky

        const data = (await res.json()) as RawEntry[];
        if (!Array.isArray(data)) return null;

        const result = extractFromJson(data);
        if (result) cache.set(term, result);
        return result;
    } catch {
        clearTimeout(timer);
        return null;
    }
}
