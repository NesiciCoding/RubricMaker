// Single source of truth for test auto-scoring and the cloze/hot-text markup it depends on.
//
// Imported by the client (src/utils/testCalc.ts, src/utils/clozeParse.ts) and by the
// submit-test and next-placement-question edge functions, so the score a student sees and
// the score the server validates can never drift apart. It must stay dependency-free and
// runnable in both Deno and the browser: no imports, no DOM, no Deno APIs.

export interface ScorableOption {
    id: string;
    isCorrect: boolean;
}

export interface ScorableQuestion {
    type: string;
    points: number;
    prompt: string;
    options?: ScorableOption[];
    matchingPairs?: { id: string }[];
    orderItems?: { id: string }[];
    categorizeItems?: { id: string; categoryId: string }[];
    hotTextPassage?: string;
    hotTextCorrectIndices?: number[];
    expectedAnswer?: string;
    expectedAnswers?: string[];
    expectedNumericValue?: number;
    numericTolerance?: number;
    partialCredit?: boolean;
    correctBoolean?: boolean;
}

// ── Cloze / hot-text markup ─────────────────────────────────────────────────

export interface ClozeGap {
    index: number;
    alternatives: string[];
}

export interface HotTextTextSegment {
    type: 'text';
    text: string;
}

export interface HotTextFragmentSegment {
    type: 'fragment';
    index: number;
    text: string;
}

export type HotTextSegment = HotTextTextSegment | HotTextFragmentSegment;

export const CLOZE_GAP_PATTERN = /\{\{(.*?)\}\}/g;
const HOT_TEXT_FRAGMENT_PATTERN = /\[\[(.*?)\]\]/g;

export function splitClozeAlternatives(raw: string): string[] {
    return raw
        .split('|')
        .map((alt) => alt.trim())
        .filter((alt) => alt.length > 0);
}

export function parseClozeGaps(prompt: string): ClozeGap[] {
    const gaps: ClozeGap[] = [];
    const pattern = new RegExp(CLOZE_GAP_PATTERN.source, 'g');
    let match: RegExpExecArray | null;
    let index = 0;
    while ((match = pattern.exec(prompt)) !== null) {
        gaps.push({ index, alternatives: splitClozeAlternatives(match[1]) });
        index += 1;
    }
    return gaps;
}

export function parseHotTextFragments(passage: string): HotTextSegment[] {
    const segments: HotTextSegment[] = [];
    const pattern = new RegExp(HOT_TEXT_FRAGMENT_PATTERN.source, 'g');
    let lastIndex = 0;
    let fragmentIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(passage)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', text: passage.slice(lastIndex, match.index) });
        }
        segments.push({ type: 'fragment', index: fragmentIndex, text: match[1] });
        fragmentIndex += 1;
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < passage.length) {
        segments.push({ type: 'text', text: passage.slice(lastIndex) });
    }
    return segments;
}

// ── Auto-scoring ────────────────────────────────────────────────────────────

function parseJson<T>(response: string, fallback: T): T {
    if (!response) return fallback;
    try {
        return JSON.parse(response) as T;
    } catch {
        return fallback;
    }
}

function partialOrAll(question: ScorableQuestion, correctCount: number, total: number): number {
    if (question.partialCredit === false) {
        return correctCount === total ? question.points : 0;
    }
    return question.points * (correctCount / total);
}

/**
 * Exact-match auto-score for a short-answer question: full points when the
 * trimmed, case-insensitive response matches any of expectedAnswers (or the
 * legacy single expectedAnswer); 0 otherwise. Returns null when the question
 * has no expected answer to match against.
 */
export function scoreShortAnswerExact(question: ScorableQuestion, response: string): number | null {
    const answers = question.expectedAnswers?.length
        ? question.expectedAnswers
        : question.expectedAnswer
          ? [question.expectedAnswer]
          : [];
    if (question.type !== 'short-answer' || answers.length === 0) return null;
    const trimmedResponse = response.trim().toLowerCase();
    return answers.some((a) => a.trim().toLowerCase() === trimmedResponse) ? question.points : 0;
}

/** Auto-score for a numeric question: full points when the response is within ± numericTolerance of expectedNumericValue. */
export function scoreNumeric(question: ScorableQuestion, response: string): number | null {
    if (question.type !== 'numeric' || question.expectedNumericValue === undefined) return null;
    const trimmed = response.trim();
    // Number('') is 0, not NaN — an unanswered question must not auto-match expectedNumericValue: 0
    if (trimmed === '') return 0;
    const value = Number(trimmed);
    if (Number.isNaN(value)) return 0;
    const tolerance = question.numericTolerance ?? 0;
    // Epsilon guards against float imprecision (e.g. 3.14 - 3.13 !== 0.01 exactly in IEEE 754)
    return Math.abs(value - question.expectedNumericValue) <= tolerance + 1e-9 ? question.points : 0;
}

/** Auto-score for a multiple-response (checkbox) question, supporting partial credit. */
export function scoreMultipleResponse(question: ScorableQuestion, response: string): number {
    const options = question.options ?? [];
    const selectedSet = new Set(parseJson<string[]>(response, []));
    const correctSet = new Set(options.filter((o) => o.isCorrect).map((o) => o.id));

    if (question.partialCredit === false) {
        const exact = selectedSet.size === correctSet.size && [...selectedSet].every((id) => correctSet.has(id));
        return exact ? question.points : 0;
    }

    if (options.length === 0) return 0;
    const matches = options.filter((o) => selectedSet.has(o.id) === correctSet.has(o.id)).length;
    return question.points * (matches / options.length);
}

/**
 * Auto-score a cloze (fill-the-gap) or cloze-dropdown question. Each gap's
 * answer is matched independently — `cloze` accepts any pipe-separated
 * alternative (case-insensitive, trimmed); `cloze-dropdown` requires the
 * first alternative (the correct option). Supports partial credit.
 */
export function scoreCloze(question: ScorableQuestion, response: string): number {
    const gaps = parseClozeGaps(question.prompt);
    if (gaps.length === 0) return 0;

    const answers = parseJson<Record<string, string>>(response, {});
    const isDropdown = question.type === 'cloze-dropdown';
    const correctCount = gaps.filter((gap) => {
        const studentAnswer = (answers[gap.index] ?? '').trim();
        if (!studentAnswer) return false;
        if (isDropdown) return studentAnswer === gap.alternatives[0];
        return gap.alternatives.some((alt) => alt.toLowerCase() === studentAnswer.toLowerCase());
    }).length;

    return partialOrAll(question, correctCount, gaps.length);
}

/** Auto-score a matching question: each pair is correct when the student paired it with itself. Supports partial credit. */
export function scoreMatching(question: ScorableQuestion, response: string): number {
    const pairs = question.matchingPairs ?? [];
    if (pairs.length === 0) return 0;
    const answers = parseJson<Record<string, string>>(response, {});
    const correctCount = pairs.filter((pair) => answers[pair.id] === pair.id).length;
    return partialOrAll(question, correctCount, pairs.length);
}

/** Auto-score an ordering question: each position is correct when it matches orderItems' defined order. Supports partial credit. */
export function scoreOrdering(question: ScorableQuestion, response: string): number {
    const items = question.orderItems ?? [];
    if (items.length === 0) return 0;
    const order = parseJson<string[]>(response, []);
    const correctCount = items.filter((item, i) => order[i] === item.id).length;
    return partialOrAll(question, correctCount, items.length);
}

/** Auto-score a categorize question: each item is correct when assigned to its defined categoryId. Supports partial credit. */
export function scoreCategorize(question: ScorableQuestion, response: string): number {
    const items = question.categorizeItems ?? [];
    if (items.length === 0) return 0;
    const answers = parseJson<Record<string, string>>(response, {});
    const correctCount = items.filter((item) => answers[item.id] === item.categoryId).length;
    return partialOrAll(question, correctCount, items.length);
}

/** Auto-score a hot-text question: each fragment is correct when its selection state matches hotTextCorrectIndices. Supports partial credit. */
export function scoreHotText(question: ScorableQuestion, response: string): number {
    const fragments = parseHotTextFragments(question.hotTextPassage ?? '').filter((s) => s.type === 'fragment');
    if (fragments.length === 0) return 0;

    const selectedSet = new Set(parseJson<number[]>(response, []));
    const correctSet = new Set(question.hotTextCorrectIndices ?? []);

    if (question.partialCredit === false) {
        const exact = selectedSet.size === correctSet.size && [...selectedSet].every((i) => correctSet.has(i));
        return exact ? question.points : 0;
    }

    const matches = fragments.filter((f) => selectedSet.has(f.index) === correctSet.has(f.index)).length;
    return question.points * (matches / fragments.length);
}

/** Open questions need manual points, so routing/staircase/generator logic must skip them. */
export function isAutoScorable<Q extends { type: string }>(question: Q): boolean {
    return question.type !== 'open';
}

/** Auto-score a raw response string against the question's correct-answer data, ignoring manual overrides. */
export function autoScoreResponse(question: ScorableQuestion, response: string): number {
    switch (question.type) {
        case 'multiple-choice': {
            const selected = question.options?.find((o) => o.id === response);
            return selected?.isCorrect ? question.points : 0;
        }
        case 'multiple-response':
            return scoreMultipleResponse(question, response);
        case 'true-false':
            return response === String(question.correctBoolean ?? true) ? question.points : 0;
        case 'short-answer':
            return scoreShortAnswerExact(question, response) ?? 0;
        case 'numeric':
            return scoreNumeric(question, response) ?? 0;
        case 'cloze':
        case 'cloze-dropdown':
            return scoreCloze(question, response);
        case 'matching':
            return scoreMatching(question, response);
        case 'ordering':
            return scoreOrdering(question, response);
        case 'categorize':
            return scoreCategorize(question, response);
        case 'hot-text':
            return scoreHotText(question, response);
        default:
            return 0;
    }
}
