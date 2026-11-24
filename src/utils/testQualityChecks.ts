import { CEFR_LEVELS } from '../data/cefrDescriptors';
import type { CefrLevel, TestQuestion, TestQuestionType, TestSection } from '../types';
import { stripHtmlTags } from './exportDataPrep';

export type TestQualityCheckId =
    | 'time_over'
    | 'time_short'
    | 'cefr_above'
    | 'cefr_below'
    | 'no_points'
    | 'duplicate_options'
    | 'no_distractor'
    | 'twin_true_false'
    | 'repeated_stimulus';

export interface TestQualityFinding {
    id: TestQualityCheckId;
    /** Questions the hint is about, empty when it is about the test as a whole. */
    questionIds: string[];
    /** The same questions numbered as students see them (1-based, in the order given). */
    numbers: number[];
    values?: Record<string, string | number>;
}

export interface TestQualityInput {
    questions: TestQuestion[];
    sections?: TestSection[];
    /** Configured time limit; the time hints are absent without one. */
    durationMinutes?: number;
    /** The test's CEFR target; the CEFR hint is absent without one. */
    cefrTargetLevel?: CefrLevel;
}

/** Reading speed the time estimate assumes. */
export const QUALITY_WORDS_PER_MINUTE = 120;
/** How far the estimate may drift from the configured limit before it is flagged, as a fraction. */
export const QUALITY_TIME_TOLERANCE = 0.2;

// Fixed answering overhead per question type, in seconds; reading time is added on top.
const ANSWER_SECONDS: Record<TestQuestionType, number> = {
    'multiple-choice': 30,
    'multiple-response': 45,
    'true-false': 15,
    'short-answer': 30,
    open: 180,
    cloze: 30,
    'cloze-dropdown': 30,
    'cloze-bank': 45,
    matrix: 40,
    dictation: 60,
    'key-word-transformation': 45,
    'error-correction': 60,
    'sentence-builder': 45,
    matching: 45,
    ordering: 45,
    categorize: 45,
    'hot-text': 45,
    numeric: 30,
    'audio-response': 120,
};

const countWords = (text: string | undefined): number =>
    text ? stripHtmlTags(text).trim().split(/\s+/).filter(Boolean).length : 0;

const normalizeText = (text: string | undefined): string =>
    stripHtmlTags(text ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

function questionWords(q: TestQuestion): number {
    let words = countWords(q.prompt) + countWords(q.dictationText);
    for (const o of q.options ?? []) words += countWords(o.text);
    for (const p of q.matchingPairs ?? []) words += countWords(p.left) + countWords(p.right);
    for (const d of q.matchingDistractors ?? []) words += countWords(d);
    for (const i of q.orderItems ?? []) words += countWords(i.text);
    for (const r of q.matrixRows ?? []) words += countWords(r.text);
    for (const c of q.matrixColumns ?? []) words += countWords(c.text);
    for (const c of q.categories ?? []) words += countWords(c.label);
    for (const i of q.categorizeItems ?? []) words += countWords(i.text);
    return words;
}

/** What the test asks a student to read plus a fixed answering time per question type, in whole minutes; a section's passage counts once. */
export function estimateTestMinutes(questions: TestQuestion[], sections: TestSection[] = []): number {
    const passageWords = sections.reduce((sum, s) => sum + countWords(s.content), 0);
    const questionWordCount = questions.reduce((sum, q) => sum + questionWords(q), 0);
    const readingSeconds = ((passageWords + questionWordCount) / QUALITY_WORDS_PER_MINUTE) * 60;
    const answeringSeconds = questions.reduce((sum, q) => sum + ANSWER_SECONDS[q.type], 0);
    return Math.max(1, Math.round((readingSeconds + answeringSeconds) / 60));
}

const stimulusKey = (q: TestQuestion): string =>
    q.imageUrl || q.audioUrl ? `${q.imageUrl ?? ''}|${q.audioUrl ?? ''}` : '';

function cefrFinding(q: TestQuestion, number: number, target: CefrLevel): TestQualityFinding | null {
    const levels = (q.linkedCefrDescriptors ?? []).map((d) => d.level);
    if (levels.length === 0) return null;
    const targetRank = CEFR_LEVELS.indexOf(target);
    const ranked = levels.map((level) => ({ level, rank: CEFR_LEVELS.indexOf(level) }));
    const highest = ranked.reduce((best, cur) => (cur.rank > best.rank ? cur : best));
    const lowest = ranked.reduce((best, cur) => (cur.rank < best.rank ? cur : best));
    if (highest.rank > targetRank) {
        return {
            id: 'cefr_above',
            questionIds: [q.id],
            numbers: [number],
            values: { number, level: highest.level, target },
        };
    }
    if (lowest.rank < targetRank) {
        return {
            id: 'cefr_below',
            questionIds: [q.id],
            numbers: [number],
            values: { number, level: lowest.level, target },
        };
    }
    return null;
}

/**
 * Non-blocking hints about test quality, derived from the test as written: nothing here is stored and
 * nothing prevents a save. Each hint names the questions it belongs to so the checks screen can link
 * to them.
 */
export function testQualityChecks({
    questions,
    sections = [],
    durationMinutes,
    cefrTargetLevel,
}: TestQualityInput): TestQualityFinding[] {
    const findings: TestQualityFinding[] = [];

    if (questions.length > 0 && durationMinutes && durationMinutes > 0) {
        const estimated = estimateTestMinutes(questions, sections);
        const values = { estimated, duration: durationMinutes };
        if (estimated > durationMinutes * (1 + QUALITY_TIME_TOLERANCE)) {
            findings.push({ id: 'time_over', questionIds: [], numbers: [], values });
        } else if (estimated < durationMinutes * (1 - QUALITY_TIME_TOLERANCE)) {
            findings.push({ id: 'time_short', questionIds: [], numbers: [], values });
        }
    }

    questions.forEach((q, index) => {
        const number = index + 1;
        if (!(q.points > 0)) {
            findings.push({ id: 'no_points', questionIds: [q.id], numbers: [number], values: { number } });
        }
        if (q.type === 'multiple-choice' || q.type === 'multiple-response') {
            const options = q.options ?? [];
            const texts = options.map((o) => normalizeText(o.text)).filter(Boolean);
            if (new Set(texts).size < texts.length) {
                findings.push({ id: 'duplicate_options', questionIds: [q.id], numbers: [number], values: { number } });
            }
            if (q.type === 'multiple-choice' && options.length >= 2 && options.every((o) => o.isCorrect)) {
                findings.push({ id: 'no_distractor', questionIds: [q.id], numbers: [number], values: { number } });
            }
        }
        if (cefrTargetLevel) {
            const finding = cefrFinding(q, number, cefrTargetLevel);
            if (finding) findings.push(finding);
        }
    });

    const trueFalseStems = new Map<string, { id: string; number: number }[]>();
    questions.forEach((q, index) => {
        if (q.type !== 'true-false') return;
        const stem = normalizeText(q.prompt);
        if (!stem) return;
        trueFalseStems.set(stem, [...(trueFalseStems.get(stem) ?? []), { id: q.id, number: index + 1 }]);
    });
    for (const twins of trueFalseStems.values()) {
        if (twins.length < 2) continue;
        findings.push({
            id: 'twin_true_false',
            questionIds: twins.map((t) => t.id),
            numbers: twins.map((t) => t.number),
            values: { numbers: twins.map((t) => t.number).join(', ') },
        });
    }

    for (let index = 1; index < questions.length; index++) {
        const key = stimulusKey(questions[index]);
        if (!key || key !== stimulusKey(questions[index - 1])) continue;
        findings.push({
            id: 'repeated_stimulus',
            questionIds: [questions[index].id],
            numbers: [index + 1],
            values: { number: index + 1 },
        });
    }

    return findings;
}
