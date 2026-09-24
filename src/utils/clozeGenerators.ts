import nlp from 'compromise';
import { CEFR_WORD_LEVELS } from '../data/cefrLevels';
import { classifyAcademic } from './academicWordList';
import type { CefrLevel } from '../types';

export type ClozeStrategy =
    'fixedRatio' | 'cTest' | 'preposition' | 'article' | 'modal' | 'pastTense' | 'aboveLevel' | 'academic';

export interface ClozeGeneratorOptions {
    /** For 'fixedRatio': gap every Nth word after the first sentence (default 7). */
    everyNth?: number;
    /** For 'aboveLevel': the target CEFR level — words at or above it are gapped. */
    cefrLevel?: CefrLevel;
}

const LEVEL_RANK: Record<CefrLevel, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

const WORD_PATTERN = /[A-Za-z][A-Za-z']*/g;

/**
 * Splits text into sentence chunks, each including its trailing punctuation and whitespace, so
 * `chunks.join('') === text` always holds — the split point is zero-width (after a `.!?`, before
 * the next non-space run), so no character is ever consumed by the split itself. Not
 * abbreviation-aware ("U.S." splits as a sentence) — good enough for an authoring aid the teacher
 * reviews before saving, not for the scorer itself.
 */
function splitSentences(text: string): string[] {
    if (!text) return [];
    const parts = text.split(/(?<=[.!?])(\s+)/);
    const chunks: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
        chunks.push(parts[i] + (parts[i + 1] ?? ''));
    }
    return chunks;
}

function wrapGap(word: string): string {
    return `{{${word}}}`;
}

/** Replaces text ranges (by offset into `text`) with `{{word}}`, applied back-to-front so earlier offsets stay valid. */
function gapRanges(text: string, ranges: { start: number; length: number }[]): string {
    const sorted = [...ranges].sort((a, b) => b.start - a.start);
    let result = text;
    for (const r of sorted) {
        const word = result.slice(r.start, r.start + r.length);
        result = result.slice(0, r.start) + wrapGap(word) + result.slice(r.start + r.length);
    }
    return result;
}

/** Gaps every Nth word (default 7) counting from the start of the second sentence onward. */
export function generateFixedRatioCloze(text: string, everyNth = 7): string {
    const sentences = splitSentences(text);
    if (sentences.length <= 1) return text;
    const head = sentences[0];
    const tail = sentences.slice(1).join('');
    const ranges: { start: number; length: number }[] = [];
    let count = 0;
    let match: RegExpExecArray | null;
    const pattern = new RegExp(WORD_PATTERN.source, 'g');
    while ((match = pattern.exec(tail)) !== null) {
        count += 1;
        if (count % everyNth === 0) {
            ranges.push({ start: match.index, length: match[0].length });
        }
    }
    return head + gapRanges(tail, ranges);
}

/**
 * C-test: from the second sentence onward, deletes the second half of every second eligible
 * (3+ letter) word — `because` -> `bec{{ause}}`. A well-established EFL placement format; the
 * existing cloze scorer already handles multi-character gap answers as-is.
 */
export function generateCTest(text: string): string {
    const sentences = splitSentences(text);
    if (sentences.length <= 1) return text;
    const head = sentences[0];
    const tail = sentences.slice(1).join('');
    const ranges: { start: number; length: number }[] = [];
    let eligibleCount = 0;
    let match: RegExpExecArray | null;
    const pattern = new RegExp(WORD_PATTERN.source, 'g');
    while ((match = pattern.exec(tail)) !== null) {
        const word = match[0];
        if (word.length < 3) continue;
        eligibleCount += 1;
        if (eligibleCount % 2 === 0) {
            const keep = Math.ceil(word.length / 2);
            ranges.push({ start: match.index + keep, length: word.length - keep });
        }
    }
    return head + gapRanges(tail, ranges);
}

type PosTarget = 'preposition' | 'article' | 'modal' | 'pastTense';

const POS_QUERY: Record<PosTarget, string> = {
    preposition: '#Preposition',
    article: '#Determiner',
    modal: '#Modal',
    pastTense: '#PastTense',
};

interface CompromiseOffset {
    offset: { start: number; length: number };
}

/** Gaps every word compromise tags for the given part of speech (articles are narrowed to a/an/the). */
export function generatePosCloze(text: string, pos: PosTarget): string {
    const doc = nlp(text);
    const matches = doc.match(POS_QUERY[pos]).json({ offset: true }) as CompromiseOffset[];
    const ranges = matches
        .map((m) => m.offset)
        .filter((offset) => {
            if (pos !== 'article') return true;
            const word = text.slice(offset.start, offset.start + offset.length).toLowerCase();
            return word === 'a' || word === 'an' || word === 'the';
        });
    return gapRanges(text, ranges);
}

/** Gaps every word at or above the given CEFR level, per the CEFR vocabulary index. Off-list words are left alone. */
export function generateAboveLevelCloze(text: string, cefrLevel: CefrLevel): string {
    const targetRank = LEVEL_RANK[cefrLevel];
    const ranges: { start: number; length: number }[] = [];
    let match: RegExpExecArray | null;
    const pattern = new RegExp(WORD_PATTERN.source, 'g');
    while ((match = pattern.exec(text)) !== null) {
        const level = CEFR_WORD_LEVELS.get(match[0].toLowerCase());
        if (level && LEVEL_RANK[level] >= targetRank) {
            ranges.push({ start: match.index, length: match[0].length });
        }
    }
    return gapRanges(text, ranges);
}

/** Gaps every AWL/NAWL academic-vocabulary word. */
export function generateAcademicCloze(text: string): string {
    const ranges: { start: number; length: number }[] = [];
    let match: RegExpExecArray | null;
    const pattern = new RegExp(WORD_PATTERN.source, 'g');
    while ((match = pattern.exec(text)) !== null) {
        if (classifyAcademic(match[0].toLowerCase())) {
            ranges.push({ start: match.index, length: match[0].length });
        }
    }
    return gapRanges(text, ranges);
}

export function generateCloze(text: string, strategy: ClozeStrategy, options: ClozeGeneratorOptions = {}): string {
    switch (strategy) {
        case 'fixedRatio':
            return generateFixedRatioCloze(text, options.everyNth ?? 7);
        case 'cTest':
            return generateCTest(text);
        case 'preposition':
        case 'article':
        case 'modal':
        case 'pastTense':
            return generatePosCloze(text, strategy);
        case 'aboveLevel':
            return generateAboveLevelCloze(text, options.cefrLevel ?? 'B2');
        case 'academic':
            return generateAcademicCloze(text);
    }
}
