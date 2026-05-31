import { CEFRJ_VOCABULARY } from '../data/cefrjVocabulary';
import type { CefrLevel, CefrVocabProfile, CefrWordHit } from '../types';

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const SKIP_WORDS = new Set([
    'a',
    'an',
    'the',
    'is',
    'am',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'do',
    'does',
    'did',
    'have',
    'has',
    'had',
    'will',
    'would',
    'shall',
    'should',
    'may',
    'might',
    'can',
    'could',
    'must',
    'to',
    'of',
    'in',
    'on',
    'at',
    'by',
    'for',
    'with',
    'as',
    'and',
    'but',
    'or',
    'nor',
    'so',
    'yet',
    'if',
    'not',
    'no',
    'my',
    'your',
    'his',
    'her',
    'its',
    'our',
    'their',
    'i',
    'me',
    'you',
    'he',
    'she',
    'it',
    'we',
    'they',
    'this',
    'that',
    'these',
    'those',
    'which',
    'who',
    'what',
    'how',
    'when',
    'where',
    'why',
    'all',
    'more',
    'very',
    'just',
    'up',
    'out',
    'about',
    'then',
    'than',
    'into',
    'from',
    'also',
]);

function normalise(word: string): string[] {
    const w = word.toLowerCase().replace(/[‘’]/g, "'").replace(/'s$/, '');
    const candidates: string[] = [w];
    if (w.endsWith('ing') && w.length > 5) {
        candidates.push(w.slice(0, -3));
        candidates.push(w.slice(0, -3) + 'e');
    }
    if (w.endsWith('ed') && w.length > 4) {
        candidates.push(w.slice(0, -2));
        candidates.push(w.slice(0, -1));
    }
    if (w.endsWith('es') && w.length > 4) candidates.push(w.slice(0, -2));
    if (w.endsWith('s') && w.length > 3) candidates.push(w.slice(0, -1));
    if (w.endsWith('ly') && w.length > 4) candidates.push(w.slice(0, -2));
    return candidates;
}

function lookupLevel(word: string): CefrLevel | null {
    for (const form of normalise(word)) {
        const level = CEFRJ_VOCABULARY[form];
        if (level) return level as CefrLevel;
    }
    return null;
}

function tokenise(text: string): string[] {
    return text
        .replace(/[–—]/g, ' ')
        .split(/[^a-zA-Z'-]+/)
        .map((w) => w.toLowerCase().replace(/^'+|'+$/g, ''))
        .filter((w) => w.length > 2 && !SKIP_WORDS.has(w));
}

export function profileText(text: string): CefrVocabProfile {
    const levelCounts: Record<CefrLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
    const tokens = tokenise(text);

    const seenWords = new Map<string, CefrLevel>();
    const highlightCandidates = new Map<string, CefrLevel>();

    for (const token of tokens) {
        const level = lookupLevel(token);
        if (!level) continue;
        levelCounts[level]++;
        const existing = seenWords.get(token);
        if (!existing || LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(existing)) {
            seenWords.set(token, level);
        }
    }

    const total = Object.values(levelCounts).reduce((s, c) => s + c, 0);

    let estimatedLevel: CefrLevel = 'A1';
    if (total > 0) {
        for (const level of [...LEVEL_ORDER].reverse()) {
            if (levelCounts[level] / total >= 0.05) {
                estimatedLevel = level;
                break;
            }
        }
    }

    const estimatedIdx = LEVEL_ORDER.indexOf(estimatedLevel);
    for (const [word, level] of seenWords) {
        if (LEVEL_ORDER.indexOf(level) >= estimatedIdx && level !== 'A1') {
            highlightCandidates.set(word, level);
        }
    }

    const highlightWords: CefrWordHit[] = [...highlightCandidates.entries()]
        .sort(([, a], [, b]) => LEVEL_ORDER.indexOf(b) - LEVEL_ORDER.indexOf(a))
        .slice(0, 30)
        .map(([word, level]) => ({ word, level }));

    return { levelCounts, highlightWords, estimatedLevel };
}
