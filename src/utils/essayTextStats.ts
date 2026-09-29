// Mirrors vocabkitchen-CLI analysis.py (count_syllables, count_sentences, compute_readability).
// Parity cases live in sync/writing-fixtures.json and are checked on both sides.
import type { EssayTextStats, ReadabilityStats, TransitionCategory } from '../types';
import { htmlToPlainText } from './essayUtils';

export const TRANSITION_WORDS: Record<TransitionCategory, string[]> = {
    addition: ['in addition', 'additionally', 'furthermore', 'moreover', 'also', 'besides', 'as well as', 'not only'],
    contrast: [
        'however',
        'but',
        'although',
        'though',
        'whereas',
        'while',
        'nevertheless',
        'nonetheless',
        'on the other hand',
        'in contrast',
        'despite',
        'in spite of',
        'yet',
        'instead',
    ],
    cause: [
        'because',
        'since',
        'therefore',
        'thus',
        'consequently',
        'as a result',
        'hence',
        'so that',
        'due to',
        'owing to',
    ],
    sequence: [
        'first',
        'firstly',
        'second',
        'secondly',
        'third',
        'thirdly',
        'next',
        'then',
        'finally',
        'afterwards',
        'meanwhile',
        'subsequently',
        'eventually',
        'at first',
        'in the end',
    ],
    example: ['for example', 'for instance', 'such as', 'in particular', 'namely', 'to illustrate'],
    conclusion: [
        'in conclusion',
        'to conclude',
        'in summary',
        'to sum up',
        'overall',
        'in short',
        'all in all',
        'to summarise',
        'to summarize',
    ],
};

const SENT_SPLIT_RE = /[.!?]+(?:\s+|$)/;
const WORD_RE = /[a-zA-Z0-9]+/g;

export function tokenizeWords(text: string): string[] {
    return text.match(WORD_RE) ?? [];
}

export function splitSentences(text: string): string[] {
    return text.split(SENT_SPLIT_RE).filter((p) => p.trim());
}

export function countSentences(text: string): number {
    return Math.max(splitSentences(text).length, 1);
}

export function countSyllables(word: string): number {
    let w = word.toLowerCase();
    if (w.length <= 3) return 1;
    let extra = 0;
    if (w.endsWith('ed')) {
        w = w.slice(0, -2);
        if ('td'.includes(w[w.length - 1])) extra = 1;
    }
    if (w.endsWith('e') && !(w.endsWith('le') && w.length > 2 && !'aeiou'.includes(w[w.length - 3]))) {
        w = w.slice(0, -1);
    }
    if (!w) return 1;
    let count = 0;
    let inVowel = false;
    for (const ch of w) {
        if ('aeiouy'.includes(ch)) {
            if (!inVowel) count++;
            inVowel = true;
        } else {
            inVowel = false;
        }
    }
    return Math.max(count + extra, 1);
}

// toFixed rounds from the exact binary value like Python's round(); half-even ties are negligible here.
function round1(x: number): number {
    return Number(x.toFixed(1)) + 0;
}

function fleschDescription(fre: number): string {
    if (fre >= 90) return 'very easy';
    if (fre >= 80) return 'easy';
    if (fre >= 70) return 'fairly easy';
    if (fre >= 60) return 'plain English';
    if (fre >= 50) return 'fairly difficult';
    if (fre >= 30) return 'difficult';
    return 'very difficult';
}

export function computeReadability(text: string, wordCount = tokenizeWords(text).length): ReadabilityStats | null {
    if (!wordCount) return null;
    const sentences = countSentences(text);
    const syllables = tokenizeWords(text).reduce((sum, t) => sum + countSyllables(t), 0);
    const wordsPerSentence = wordCount / sentences;
    const syllablesPerWord = syllables / wordCount;
    const fre = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
    const fk = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
    return {
        fleschReadingEase: round1(fre),
        fleschKincaidGrade: round1(fk),
        description: fleschDescription(fre),
    };
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TRANSITION_ENTRIES = (Object.entries(TRANSITION_WORDS) as [TransitionCategory, string[]][])
    .flatMap(([category, phrases]) => phrases.map((phrase) => ({ category, phrase })))
    .sort((a, b) => b.phrase.length - a.phrase.length);

const TRANSITION_RE = new RegExp(`\\b(${TRANSITION_ENTRIES.map((e) => escapeRe(e.phrase)).join('|')})\\b`, 'gi');
const CATEGORY_BY_PHRASE = new Map(TRANSITION_ENTRIES.map((e) => [e.phrase, e.category]));

export function countTransitions(text: string, wordCount: number): EssayTextStats['transitions'] {
    const byCategory: Record<TransitionCategory, number> = {
        addition: 0,
        contrast: 0,
        cause: 0,
        sequence: 0,
        example: 0,
        conclusion: 0,
    };
    const byPhrase: Record<string, number> = {};
    let total = 0;
    for (const m of text.matchAll(TRANSITION_RE)) {
        const phrase = m[1].toLowerCase();
        byCategory[CATEGORY_BY_PHRASE.get(phrase)!]++;
        byPhrase[phrase] = (byPhrase[phrase] ?? 0) + 1;
        total++;
    }
    return { total, per100Words: wordCount ? round1((total / wordCount) * 100) : 0, byCategory, byPhrase };
}

/** Accepts plain text or TipTap HTML. */
export function computeEssayStats(input: string): EssayTextStats {
    const text = /<[a-z][^>]*>/i.test(input) ? htmlToPlainText(input) : input;
    const wordCount = tokenizeWords(text).length;
    const lengths = splitSentences(text).map((s) => tokenizeWords(s).length);
    const sentenceCount = wordCount ? Math.max(lengths.length, 1) : 0;
    const mean = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
    const variance = lengths.length ? lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length : 0;
    return {
        wordCount,
        sentenceCount,
        avgWordsPerSentence: round1(mean),
        sentenceLengths: lengths,
        sentenceLengthVariance: round1(variance),
        sentenceLengthStdDev: round1(Math.sqrt(variance)),
        minSentenceLength: lengths.length ? Math.min(...lengths) : 0,
        maxSentenceLength: lengths.length ? Math.max(...lengths) : 0,
        transitions: countTransitions(text, wordCount),
        readability: computeReadability(text, wordCount),
    };
}
