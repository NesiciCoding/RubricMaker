// ─── Cambridge Dictionary API Service ─────────────────────────────────────────
// Docs: https://dictionary.cambridge.org/api/v1/documentation/html
// Registration: https://dictionary-api.cambridge.org/
// Auth: accessKey query parameter
// Format: XML — CEFR level appears in <lvl> elements
// This service provides optional online enrichment on top of the bundled CEFR-J data.

import type { CefrLevel } from '../types';

const BASE = 'https://dictionary.cambridge.org/api/v1';
const TIMEOUT_MS = 5000;

const VALID_LEVELS = new Set<CefrLevel>(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

/**
 * Parse a raw CEFR level string and return the corresponding validated CefrLevel.
 *
 * @param raw - Raw CEFR level text (may include surrounding whitespace or differing case); may be `null`.
 * @returns `CefrLevel` if `raw` matches one of the allowed levels (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`), `null` otherwise.
 */
function parseLevel(raw: string | null): CefrLevel | null {
    if (!raw) return null;
    const candidate = raw.trim().toUpperCase() as CefrLevel;
    return VALID_LEVELS.has(candidate) ? candidate : null;
}

/**
 * Extracts the CEFR level and the first plain-text definition from a Cambridge Dictionary XML response.
 *
 * @param xml - XML string returned by the Cambridge Dictionary API, expected to contain `<lvl>` and `<def>` elements
 * @returns An object with `level` set to the normalized CEFR level or `null`, and `definition` set to the trimmed first `<def>` text or `null`
 */
function extractFromXml(xml: string): { level: CefrLevel | null; definition: string | null } {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const level = parseLevel(doc.querySelector('lvl')?.textContent ?? null);
    const definition = doc.querySelector('def')?.textContent?.trim() ?? null;
    return { level, definition };
}

export interface CambridgeLookupResult {
    level: CefrLevel | null;
    definition: string | null;
}

/**
 * Look up a word in the Cambridge Dictionary API to retrieve its CEFR level and a plain-text definition.
 *
 * Returns `null` for missing inputs, non-OK HTTP responses, request failures or timeouts, or when the level/definition cannot be extracted.
 *
 * @param word - The word to look up
 * @param apiKey - Cambridge Dictionary API access key
 * @returns An object containing `level` and `definition`, or `null` if the lookup did not produce a valid result
 */
export async function lookupWord(word: string, apiKey: string): Promise<CambridgeLookupResult | null> {
    if (!word || !apiKey) return null;

    const url = `${BASE}/dictionaries/english/entries/${encodeURIComponent(word.toLowerCase())}?accessKey=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        if (!res.ok) return null;

        const xml = await res.text();
        return extractFromXml(xml);
    } catch {
        clearTimeout(timer);
        return null;
    }
}
