import { normaliseForSearch } from './searchMatch';

export type PriorCommentSourceKind = 'bank' | 'feedback';

export interface PriorCommentSource {
    id: string;
    /** Plain text — markup stripped by the caller, inserted verbatim. */
    text: string;
    source: PriorCommentSourceKind;
    /** Short context line: tags for a bank snippet, the student's name for past feedback. */
    label?: string;
}

export interface RankedPriorComment extends PriorCommentSource {
    score: number;
}

/** One row of the `search_prior_comments` RPC (comment bank only; past feedback is ranked locally). */
export interface PriorCommentHit {
    id: string;
    text: string;
    tags: string[];
    score: number;
}

const TRIGRAM_PAD = '  ';

function trigrams(normalised: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const word of normalised.split(/\s+/)) {
        if (!word) continue;
        const padded = `${TRIGRAM_PAD}${word}${TRIGRAM_PAD}`;
        for (let i = 0; i + 3 <= padded.length; i += 1) {
            const gram = padded.slice(i, i + 3);
            counts.set(gram, (counts.get(gram) ?? 0) + 1);
        }
    }
    return counts;
}

/**
 * Dice coefficient over trigram bags — the shape of pg_trgm's `similarity()`, so the offline
 * ranking tolerates the same typos the server-side one does.
 */
export function trigramSimilarity(a: string, b: string): number {
    const left = trigrams(normaliseForSearch(a));
    const right = trigrams(normaliseForSearch(b));
    if (left.size === 0 || right.size === 0) return 0;

    let shared = 0;
    let leftTotal = 0;
    let rightTotal = 0;
    for (const count of left.values()) leftTotal += count;
    for (const count of right.values()) rightTotal += count;
    for (const [gram, count] of left) shared += Math.min(count, right.get(gram) ?? 0);
    return (2 * shared) / (leftTotal + rightTotal);
}

/**
 * Ranks the teacher's own prior comments for a query, independently of the database.
 *
 * Word order does not matter (every query token must occur somewhere) and a typo still matches
 * through trigram similarity, which is the second half of the server-side ranking. Results are
 * deduplicated by text, so a snippet saved to the bank and also left as feedback appears once.
 */
export function rankPriorComments(query: string, sources: PriorCommentSource[], limit = 6): RankedPriorComment[] {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const queryNorm = normaliseForSearch(trimmed);
    const queryTokens = queryNorm.split(/\s+/).filter(Boolean);
    if (queryTokens.length === 0) return [];

    const seen = new Set<string>();
    const ranked: RankedPriorComment[] = [];

    for (const source of sources) {
        const text = source.text.trim();
        if (!text) continue;

        const norm = normaliseForSearch(text);
        if (seen.has(norm)) continue;

        const tokens = new Set(norm.split(/\s+/).filter(Boolean));
        const present = queryTokens.filter((token) => tokens.has(token)).length;
        const coverage = present / queryTokens.length;
        const phrase = norm.includes(queryNorm);
        const similarity = trigramSimilarity(trimmed, text);

        if (!phrase && coverage < 0.5 && similarity < 0.25) continue;

        seen.add(norm);
        ranked.push({ ...source, text, score: (phrase ? 3 : 0) + 2 * coverage + similarity });
    }

    return ranked
        .sort((a, b) => b.score - a.score || a.text.length - b.text.length || a.text.localeCompare(b.text))
        .slice(0, Math.max(1, limit));
}

/**
 * Puts server-ranked bank hits first (Postgres ranks them over the whole corpus) and appends the
 * local results the server did not return — chiefly past feedback, which lives in client state.
 */
export function mergePriorComments(
    remote: PriorCommentHit[],
    local: Array<PriorCommentSource & { score?: number }>,
    limit = 6
): RankedPriorComment[] {
    const seen = new Set<string>();
    const merged: RankedPriorComment[] = [];

    for (const hit of remote) {
        const text = hit.text.trim();
        if (!text) continue;
        const key = normaliseForSearch(text);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({
            id: hit.id,
            text,
            source: 'bank',
            label: hit.tags.length > 0 ? hit.tags.join(' · ') : undefined,
            score: hit.score,
        });
    }

    for (const item of local) {
        const key = normaliseForSearch(item.text);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({ ...item, score: item.score ?? 0 });
    }

    return merged.slice(0, Math.max(1, limit));
}
