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
    matrixRows?: { id: string; correctColumnId: string }[];
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
    answerTolerance?: AnswerTolerance;
    dictationText?: string;
}

/** Opt-in leniencies for typed answers (short-answer, open cloze). Absent/false = exact match after trim + lowercase. */
export interface AnswerTolerance {
    /** Curly quotes → straight, punctuation dropped, whitespace collapsed */
    punctuation?: boolean;
    /** `don't` ≡ `do not` */
    contractions?: boolean;
    /** `colour` ≡ `color` (static list) */
    spelling?: boolean;
    /** Edit distance ≤ 1 per word, for words of 5+ letters */
    slips?: boolean;
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

// Responses are student-controlled, so valid JSON of the wrong shape ("5", "null", {"0": 5})
// must score as unanswered rather than throw inside a scorer.
function parseJsonArray(response: string): unknown[] {
    if (!response) return [];
    try {
        const value: unknown = JSON.parse(response);
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function parseJsonRecord(response: string): Record<string, unknown> {
    if (!response) return {};
    try {
        const value: unknown = JSON.parse(response);
        return value !== null && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
}

// ── Tolerant answer matching ────────────────────────────────────────────────

const CONTRACTIONS: Record<string, string> = {
    "don't": 'do not',
    "doesn't": 'does not',
    "didn't": 'did not',
    "isn't": 'is not',
    "aren't": 'are not',
    "wasn't": 'was not',
    "weren't": 'were not',
    "haven't": 'have not',
    "hasn't": 'has not',
    "hadn't": 'had not',
    "won't": 'will not',
    "wouldn't": 'would not',
    "can't": 'cannot',
    "couldn't": 'could not',
    "shouldn't": 'should not',
    "mustn't": 'must not',
    "i'm": 'i am',
    "you're": 'you are',
    "we're": 'we are',
    "they're": 'they are',
    "i've": 'i have',
    "you've": 'you have',
    "we've": 'we have',
    "they've": 'they have',
    "i'll": 'i will',
    "you'll": 'you will',
    "he'll": 'he will',
    "she'll": 'she will',
    "we'll": 'we will',
    "they'll": 'they will',
    "i'd": 'i would',
    "you'd": 'you would',
    "he'd": 'he would',
    "she'd": 'she would',
    "we'd": 'we would',
    "they'd": 'they would',
    "it's": 'it is',
    "that's": 'that is',
    "there's": 'there is',
    "let's": 'let us',
};

// British → American; both sides are mapped to the American form before comparing.
const BRITISH_TO_AMERICAN: Record<string, string> = {
    colour: 'color',
    favourite: 'favorite',
    neighbour: 'neighbor',
    behaviour: 'behavior',
    honour: 'honor',
    humour: 'humor',
    labour: 'labor',
    flavour: 'flavor',
    centre: 'center',
    theatre: 'theater',
    metre: 'meter',
    litre: 'liter',
    fibre: 'fiber',
    organise: 'organize',
    realise: 'realize',
    recognise: 'recognize',
    apologise: 'apologize',
    analyse: 'analyze',
    travelled: 'traveled',
    travelling: 'traveling',
    traveller: 'traveler',
    cancelled: 'canceled',
    cancelling: 'canceling',
    grey: 'gray',
    tyre: 'tire',
    programme: 'program',
    cheque: 'check',
    defence: 'defense',
    licence: 'license',
    offence: 'offense',
    practise: 'practice',
    catalogue: 'catalog',
    dialogue: 'dialog',
    jewellery: 'jewelry',
    pyjamas: 'pajamas',
    mum: 'mom',
    plough: 'plow',
    aluminium: 'aluminum',
    maths: 'math',
    learnt: 'learned',
    spelt: 'spelled',
    burnt: 'burned',
    dreamt: 'dreamed',
};

function editDistanceWithin1(a: string, b: string): boolean {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
    const [long, short] = a.length > b.length ? [a, b] : [b, a];
    return long.slice(i + 1) === short.slice(i);
}

function tokensMatch(expected: string, given: string, tol: AnswerTolerance): boolean {
    return expected === given || (!!tol.slips && expected.length >= 5 && editDistanceWithin1(expected, given));
}

function answerTokens(text: string, tol: AnswerTolerance): string[] {
    let t = text.trim().toLowerCase();
    if (tol.punctuation || tol.contractions)
        t = t.replace(/[\u2018\u2019\u02bc`]/g, "'").replace(/[\u201c\u201d]/g, '"');
    if (tol.contractions) t = t.replace(/[\p{L}]+'[\p{L}]+/gu, (w) => CONTRACTIONS[w] ?? w);
    if (tol.punctuation) {
        // Punctuation inside a word (don't, co-operate) is dropped, so dont and cooperate match.
        t = t
            .replace(/([\p{L}\p{N}])[^\p{L}\p{N}\s]+(?=[\p{L}\p{N}])/gu, '$1')
            .replace(/[^\p{L}\p{N}']+/gu, ' ')
            .replace(/(^|\s)'+|'+(?=\s|$)/g, '$1');
    }
    let tokens = t.split(/\s+/).filter(Boolean);
    if (tol.contractions) tokens = tokens.flatMap((w) => (CONTRACTIONS[w] ?? w).split(' '));
    if (tol.spelling) tokens = tokens.map((w) => BRITISH_TO_AMERICAN[w] ?? w);
    return tokens;
}

/** True when a typed response matches an accepted answer under the question's opt-in tolerances. */
export function answersMatch(expected: string, response: string, tol?: AnswerTolerance): boolean {
    if (!tol || !(tol.punctuation || tol.contractions || tol.spelling || tol.slips)) {
        return expected.trim().toLowerCase() === response.trim().toLowerCase();
    }
    const a = answerTokens(expected, tol);
    const b = answerTokens(response, tol);
    if (a.length === 0 || a.length !== b.length) return false;
    return a.every((word, i) => tokensMatch(word, b[i], tol));
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
    return answers.some((a) => answersMatch(a, response, question.answerTolerance)) ? question.points : 0;
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
    const selectedSet = new Set(parseJsonArray(response));
    const correctSet = new Set(options.filter((o) => o.isCorrect).map((o) => o.id));

    if (question.partialCredit === false) {
        const exact =
            selectedSet.size === correctSet.size && [...selectedSet].every((id) => correctSet.has(id as string));
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
    const correct = clozeGapCorrectness(question, response);
    return correct.length === 0 ? 0 : partialOrAll(question, correct.filter(Boolean).length, correct.length);
}

/** Per-gap correctness of a cloze response, in gap order — also feeds per-gap item analysis. */
export function clozeGapCorrectness(question: ScorableQuestion, response: string): boolean[] {
    const answers = parseJsonRecord(response);
    const exactTile = question.type === 'cloze-dropdown';
    return parseClozeGaps(question.prompt).map((gap) => {
        const raw = answers[gap.index];
        const studentAnswer = typeof raw === 'string' ? raw.trim() : '';
        if (!studentAnswer) return false;
        if (exactTile) return studentAnswer === gap.alternatives[0];
        return gap.alternatives.some((alt) => answersMatch(alt, studentAnswer, question.answerTolerance));
    });
}

/** Auto-score a matrix question: each row is correct when the student picked its correctColumnId. Supports partial credit. */
export function scoreMatrix(question: ScorableQuestion, response: string): number {
    const correct = matrixRowCorrectness(question, response);
    return correct.length === 0 ? 0 : partialOrAll(question, correct.filter(Boolean).length, correct.length);
}

/** Per-row correctness of a matrix response, in row order. */
export function matrixRowCorrectness(question: ScorableQuestion, response: string): boolean[] {
    const answers = parseJsonRecord(response);
    return (question.matrixRows ?? []).map((row) => answers[row.id] === row.correctColumnId);
}

/**
 * Word-level alignment of a dictation response against the target sentence (Levenshtein over
 * tokens, no speech recognition). Returns, per target word, whether it was matched in the best
 * alignment, plus the edit distance. Case and punctuation never count; contractions, spelling
 * variants and minor slips follow the question's opt-in answerTolerance.
 */
export function alignDictation(
    question: ScorableQuestion,
    response: string
): { matched: boolean[]; distance: number; target: string[] } {
    const tol: AnswerTolerance = { ...question.answerTolerance, punctuation: true };
    const target = answerTokens(question.dictationText ?? '', tol);
    const given = answerTokens(response, tol);
    const n = target.length;
    const m = given.length;
    const d: number[][] = Array.from({ length: n + 1 }, (_, i) => [i, ...new Array<number>(m).fill(0)]);
    for (let j = 1; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const sub = d[i - 1][j - 1] + (tokensMatch(target[i - 1], given[j - 1], tol) ? 0 : 1);
            d[i][j] = Math.min(sub, d[i - 1][j] + 1, d[i][j - 1] + 1);
        }
    }
    const matched = new Array<boolean>(n).fill(false);
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
        const isMatch = tokensMatch(target[i - 1], given[j - 1], tol);
        if (isMatch && d[i][j] === d[i - 1][j - 1]) {
            matched[i - 1] = true;
            i--;
            j--;
        } else if (d[i][j] === d[i - 1][j - 1] + 1) {
            i--;
            j--;
        } else if (d[i][j] === d[i - 1][j] + 1) {
            i--;
        } else {
            j--;
        }
    }
    return { matched, distance: d[n][m], target };
}

/** Auto-score a dictation question: 1 − (word edit distance ÷ target words), floored at 0; all-or-nothing when partialCredit is false. */
export function scoreDictation(question: ScorableQuestion, response: string): number {
    const { matched, distance } = alignDictation(question, response);
    if (matched.length === 0) return 0;
    if (question.partialCredit === false) return distance === 0 ? question.points : 0;
    return question.points * Math.max(0, 1 - distance / matched.length);
}

/** Auto-score a matching question: each pair is correct when the student paired it with itself. Supports partial credit. */
export function scoreMatching(question: ScorableQuestion, response: string): number {
    const pairs = question.matchingPairs ?? [];
    if (pairs.length === 0) return 0;
    const answers = parseJsonRecord(response);
    const correctCount = pairs.filter((pair) => answers[pair.id] === pair.id).length;
    return partialOrAll(question, correctCount, pairs.length);
}

/** Auto-score an ordering question: each position is correct when it matches orderItems' defined order. Supports partial credit. */
export function scoreOrdering(question: ScorableQuestion, response: string): number {
    const items = question.orderItems ?? [];
    if (items.length === 0) return 0;
    const order = parseJsonArray(response);
    const correctCount = items.filter((item, i) => order[i] === item.id).length;
    return partialOrAll(question, correctCount, items.length);
}

/** Auto-score a categorize question: each item is correct when assigned to its defined categoryId. Supports partial credit. */
export function scoreCategorize(question: ScorableQuestion, response: string): number {
    const items = question.categorizeItems ?? [];
    if (items.length === 0) return 0;
    const answers = parseJsonRecord(response);
    const correctCount = items.filter((item) => answers[item.id] === item.categoryId).length;
    return partialOrAll(question, correctCount, items.length);
}

/** Auto-score a hot-text question: each fragment is correct when its selection state matches hotTextCorrectIndices. Supports partial credit. */
export function scoreHotText(question: ScorableQuestion, response: string): number {
    const fragments = parseHotTextFragments(question.hotTextPassage ?? '').filter((s) => s.type === 'fragment');
    if (fragments.length === 0) return 0;

    const selectedSet = new Set(parseJsonArray(response));
    const correctSet = new Set(question.hotTextCorrectIndices ?? []);

    if (question.partialCredit === false) {
        const exact =
            selectedSet.size === correctSet.size && [...selectedSet].every((i) => correctSet.has(i as number));
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
        case 'cloze-bank':
            return scoreCloze(question, response);
        case 'matrix':
            return scoreMatrix(question, response);
        case 'dictation':
            return scoreDictation(question, response);
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
