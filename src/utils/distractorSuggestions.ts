import nlp from 'compromise';
import { CEFR_WORD_LEVELS } from '../data/cefrLevels';

export type DistractorSource = 'morphological' | 'confusable' | 'sameLevel';

export interface DistractorSuggestion {
    word: string;
    source: DistractorSource;
}

// Groups of words EFL learners commonly mix up; any member suggests the others.
const CONFUSABLE_GROUPS: string[][] = [
    ['make', 'do'],
    ['say', 'tell', 'speak', 'talk'],
    ['since', 'for', 'during', 'from'],
    ['affect', 'effect'],
    ['borrow', 'lend', 'loan'],
    ['bring', 'take', 'fetch'],
    ['look', 'see', 'watch'],
    ['hear', 'listen'],
    ['learn', 'teach', 'study'],
    ['rise', 'raise', 'arise'],
    ['lay', 'lie', 'lain'],
    ['much', 'many', 'a lot of'],
    ['few', 'little', 'a few', 'a little'],
    ['in', 'on', 'at'],
    ['already', 'yet', 'still'],
    ['say', 'said', 'says'],
    ['too', 'very', 'enough'],
    ['also', 'either', 'too'],
    ['economic', 'economical'],
    ['historic', 'historical'],
    ['principal', 'principle'],
    ['advice', 'advise'],
    ['lose', 'loose'],
    ['then', 'than'],
    ['their', 'there', "they're"],
    ['its', "it's"],
    ['whose', "who's"],
    ['accept', 'except'],
    ['quite', 'quiet', 'quit'],
    ['although', 'despite', 'however'],
    ['if', 'unless', 'when'],
    ['rob', 'steal'],
    ['wear', 'carry'],
    ['hope', 'wish'],
    ['remember', 'remind'],
    ['sensible', 'sensitive'],
    ['actually', 'currently'],
    ['must', 'have to', 'should'],
];

const MAX_SUGGESTIONS = 8;
const POOL_SCAN_LIMIT = 4000;

// #1114: pre-group the 1.57 MB CEFR index by level once at module load so
// sameLevelSamePos() doesn't rescan the full 60k-entry Map (and its cross-level
// entries) on every distractor request. The per-level pools hold only plain
// [a-z] words — the same set the loop below would otherwise filter for.
const LEVEL_WORD_POOLS = (() => {
    const pools: Record<string, string[]> = { A1: [], A2: [], B1: [], B2: [], C1: [], C2: [] };
    for (const [candidate, candidateLevel] of CEFR_WORD_LEVELS) {
        if (/^[a-z]+$/.test(candidate)) pools[candidateLevel]?.push(candidate);
    }
    return pools;
})();

// compromise POS tagging is the dominant cost inside the pool scan — cache it
// so repeated suggestions for nearby words don't re-run nlp() per candidate.
const posCache = new Map<string, ReturnType<typeof posOf>>();

function posOf(word: string): 'Verb' | 'Noun' | 'Adjective' | 'Adverb' | null {
    const doc = nlp(word);
    for (const tag of ['Verb', 'Adjective', 'Adverb', 'Noun'] as const) {
        if (doc.has(`#${tag}`)) return tag;
    }
    return null;
}

export function morphological(word: string): string[] {
    const forms: string[] = [];
    const doc = nlp(word);
    const [conjugation] = doc.verbs().conjugate() as Record<string, string>[];
    if (conjugation) {
        for (const [key, form] of Object.entries(conjugation)) {
            if (key !== 'FutureTense' && form) forms.push(form);
        }
    }
    const plural = doc.nouns().toPlural().text();
    if (plural) forms.push(plural);
    const singular = doc.nouns().toSingular().text();
    if (singular) forms.push(singular);
    return forms;
}

function cachedPos(word: string): ReturnType<typeof posOf> {
    let pos = posCache.get(word);
    if (pos === undefined) {
        pos = posOf(word);
        // Bound the cache: pools are ~10k words per level, but a session only
        // ever tags a small neighborhood — evict oldest once large.
        if (posCache.size > 2000) {
            const oldest = posCache.keys().next().value;
            if (oldest !== undefined) posCache.delete(oldest);
        }
        posCache.set(word, pos);
    }
    return pos;
}

function sameLevelSamePos(word: string, count: number): string[] {
    const level = CEFR_WORD_LEVELS.get(word);
    const pos = level && cachedPos(word);
    if (!level || !pos) return [];
    const pool = LEVEL_WORD_POOLS[level] ?? [];
    const found: string[] = [];
    let scanned = 0;
    for (const candidate of pool) {
        if (candidate === word) continue;
        if (++scanned > POOL_SCAN_LIMIT) break;
        if (cachedPos(candidate) === pos) found.push(candidate);
        if (found.length >= count) break;
    }
    return found;
}

/** Deterministic distractor candidates for one answer word; the teacher picks, nothing is auto-inserted. */
export function suggestDistractors(answer: string): DistractorSuggestion[] {
    const word = answer.trim().toLowerCase();
    if (!word) return [];
    const seen = new Set([word]);
    const out: DistractorSuggestion[] = [];
    const add = (candidates: string[], source: DistractorSource) => {
        for (const candidate of candidates) {
            const w = candidate.trim().toLowerCase();
            if (!w || seen.has(w) || out.length >= MAX_SUGGESTIONS) continue;
            seen.add(w);
            out.push({ word: w, source });
        }
    };
    add(morphological(word), 'morphological');
    add(CONFUSABLE_GROUPS.filter((g) => g.includes(word)).flat(), 'confusable');
    add(sameLevelSamePos(word, 3), 'sameLevel');
    return out;
}
