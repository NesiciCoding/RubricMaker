import { CEFR_WORD_LEVELS } from '../data/cefrLevels';
import type { CefrLevel } from '../types';
import { renderClozeSegments } from './clozeParse';
import { morphological } from './distractorSuggestions';

const PREFIXES = ['', 'un', 'in', 'im', 'il', 'ir', 'dis', 'mis', 're', 'over', 'under', 'non', 'pre', 'anti'];
const SUFFIXES = [
    'ly',
    'ness',
    'ment',
    'ful',
    'less',
    'able',
    'ible',
    'ion',
    'ation',
    'ity',
    'al',
    'ous',
    'ive',
    'ish',
    'en',
    'ize',
    'ise',
    'hood',
    'ship',
    'ance',
    'ence',
    'ant',
    'ent',
    'ic',
    'ical',
    'er',
    'or',
    'ist',
    'y',
    'ed',
    'ing',
    's',
];
const LEVEL_RANK: Record<CefrLevel, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };
const MAX_SUGGESTIONS = 10;

function stemVariants(stem: string): string[] {
    const variants = new Set([stem]);
    if (stem.endsWith('e')) variants.add(stem.slice(0, -1));
    if (stem.endsWith('y')) variants.add(`${stem.slice(0, -1)}i`);
    if (/[^aeiou][aeiou][^aeiou]$/.test(stem)) variants.add(stem + stem.slice(-1));
    return [...variants];
}

/**
 * Derived forms of a stem word for a word-formation gap: affix candidates that actually exist in
 * the CEFR word index (so `happy → happiness`, never `happyness`), plus compromise inflections.
 * Deterministic and ordered easy-to-hard; the teacher picks, nothing is auto-inserted.
 */
export function suggestDerivedForms(stem: string): string[] {
    const word = stem.trim().toLowerCase();
    if (word.length < 3 || !/^[a-z]+$/.test(word)) return [];
    const found = new Map<string, number>();
    for (const prefix of PREFIXES) {
        for (const base of stemVariants(word)) {
            for (const suffix of ['', ...SUFFIXES]) {
                const candidate = `${prefix}${base}${suffix}`;
                const level = CEFR_WORD_LEVELS.get(candidate);
                if (level && candidate !== word && prefix + suffix !== '') {
                    found.set(candidate, LEVEL_RANK[level]);
                }
            }
        }
    }
    const ordered = [...found.entries()]
        .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
        .map(([w]) => w)
        .slice(0, MAX_SUGGESTIONS);
    const extra = morphological(word).filter((w) => w !== word && !found.has(w));
    return [...new Set([...ordered, ...extra])].slice(0, MAX_SUGGESTIONS);
}

/** For each gap (in order), the stem word written right after it — `{{happiness}}(HAPPY)` → 'HAPPY' — or null when it has none. */
export function gapStems(prompt: string): (string | null)[] {
    const segments = renderClozeSegments(prompt);
    return segments.flatMap((segment, i) => {
        if (segment.type !== 'gap') return [];
        const next = segments[i + 1];
        const match = next?.type === 'text' ? /^\s*\(([^()]+)\)/.exec(next.text) : null;
        return [match ? match[1].trim() : null];
    });
}
