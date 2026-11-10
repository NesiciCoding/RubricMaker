import type { StudentTest, Test, TestAnswer } from '../types';
import { scoreTestAnswer } from './testCalc';
import { calcTestItemAnalysis } from './testSummaryAggregator';

/** Below this many complete score rows, correlations and α are too noisy to show. */
export const MIN_STUDENTS_FOR_CORRELATION = 5;
/** Below this many complete rows the upper/lower-27% split is too small to read. */
export const MIN_STUDENTS_FOR_DISCRIMINATION = 8;
const DISCRIMINATION_GROUP_RATIO = 0.27;

export type ItemQualityFlag = 'too_hard' | 'too_easy' | 'weak_rir' | 'negative_rir' | 'alpha_rises';

/**
 * The engine is generic over "items": a test's questions, or a rubric's criteria. Each adapter
 * builds the same students × items matrix, so the maths lives in exactly one place.
 */
export interface ItemMatrixItem {
    id: string;
    maxPoints: number;
}

export interface ItemMatrixRow {
    studentId: string;
    /** `null` for a cell that was not scored; a row with any `null` is left out of the correlations. */
    scores: (number | null)[];
}

export interface ItemMatrix {
    items: ItemMatrixItem[];
    rows: ItemMatrixRow[];
}

export interface ItemQuality {
    itemId: string;
    maxPoints: number;
    sampleSize: number;
    mean: number | null;
    pValue: number | null;
    /** Pearson correlation of the item score with the total score. */
    rit: number | null;
    /** Correlation of the item score with the total of the other items (corrected item-total). */
    rir: number | null;
    /** Upper/lower-27% discrimination: how much better the top scorers did on this item. */
    discrimination: number | null;
    /** Cronbach's α of the set without this item. */
    alphaIfDeleted: number | null;
    flags: ItemQualityFlag[];
}

export interface ItemQualitySummary {
    n: number;
    maxPoints: number;
    mean: number | null;
    sd: number | null;
    median: number | null;
    min: number | null;
    max: number | null;
    /** Cronbach's α; equals KR-20 when every item is scored 0/1. */
    alpha: number | null;
    /** Standard error of measurement in points: SD·√(1−α). */
    sem: number | null;
}

export interface ItemQualityReport {
    summary: ItemQualitySummary;
    items: ItemQuality[];
    /** Per-student total points of the complete rows the metrics were computed from. */
    totals: { studentId: string; points: number }[];
}

export function mean(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sample variance (n − 1), the convention item-analysis tools report. */
export function variance(values: number[]): number | null {
    if (values.length < 2) return null;
    const m = mean(values)!;
    return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

export function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function pearson(xs: number[], ys: number[]): number | null {
    if (xs.length !== ys.length || xs.length < 2) return null;
    const mx = mean(xs)!;
    const my = mean(ys)!;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < xs.length; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        sxy += dx * dy;
        sxx += dx * dx;
        syy += dy * dy;
    }
    if (sxx === 0 || syy === 0) return null;
    return sxy / Math.sqrt(sxx * syy);
}

/** Cronbach's α over a students × items matrix (rows are complete). */
export function cronbachAlpha(matrix: number[][]): number | null {
    const k = matrix[0]?.length ?? 0;
    if (k < 2 || matrix.length < 2) return null;
    const totals = matrix.map((row) => row.reduce((s, v) => s + v, 0));
    const totalVar = variance(totals);
    if (!totalVar) return null;
    let itemVarSum = 0;
    for (let j = 0; j < k; j++) itemVarSum += variance(matrix.map((row) => row[j]))!;
    return (k / (k - 1)) * (1 - itemVarSum / totalVar);
}

/** Rows scored on every item; anything else would read as zeroes and drag the correlations down. */
function completeRows(matrix: ItemMatrix): { studentId: string; scores: number[] }[] {
    const complete: { studentId: string; scores: number[] }[] = [];
    for (const row of matrix.rows) {
        if (row.scores.length !== matrix.items.length) continue;
        const scores: number[] = [];
        let isComplete = true;
        for (const value of row.scores) {
            if (value === null) {
                isComplete = false;
                break;
            }
            scores.push(value);
        }
        if (isComplete) complete.push({ studentId: row.studentId, scores });
    }
    return complete;
}

/**
 * Upper/lower-27% discrimination per item, computed from the matrix alone. Ranked by total score,
 * and null below `MIN_STUDENTS_FOR_DISCRIMINATION` — a smaller split is noise.
 */
export function discriminationByItem(matrix: ItemMatrix): (itemId: string) => number | null {
    const complete = completeRows(matrix);
    const totals = complete.map((row) => row.scores.reduce((s, v) => s + v, 0));
    const ranked = complete
        .map((row, i) => ({ studentId: row.studentId, total: totals[i] }))
        .sort((a, b) => b.total - a.total);
    const groupSize = Math.max(1, Math.round(ranked.length * DISCRIMINATION_GROUP_RATIO));
    const upper = new Set(ranked.slice(0, groupSize).map((r) => r.studentId));
    const lower = new Set(ranked.slice(-groupSize).map((r) => r.studentId));
    const enough = ranked.length >= MIN_STUDENTS_FOR_DISCRIMINATION;

    const columns = new Map<string, { studentId: string; fraction: number }[]>();
    matrix.items.forEach((item, j) => {
        columns.set(
            item.id,
            complete.map((row) => ({
                studentId: row.studentId,
                fraction: item.maxPoints > 0 ? row.scores[j] / item.maxPoints : 0,
            }))
        );
    });

    const groupMean = (column: { studentId: string; fraction: number }[], ids: Set<string>) => {
        const values = column.filter((c) => ids.has(c.studentId)).map((c) => c.fraction);
        return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
    };

    return (itemId) => {
        if (!enough) return null;
        const column = columns.get(itemId);
        if (!column) return null;
        const top = groupMean(column, upper);
        const bottom = groupMean(column, lower);
        return top === null || bottom === null ? null : top - bottom;
    };
}

/**
 * Classical item-quality report over any students × items matrix: difficulty (P), item-total and
 * item-rest correlations, Cronbach's α (and α if an item is dropped), SEM and discrimination.
 * `discriminationOf` lets an adapter supply a richer source (the test adapter reuses its
 * distractor analysis pass); without it the 27% split is computed from the matrix.
 */
export function calcItemQuality(
    matrix: ItemMatrix,
    opts: { discriminationOf?: (itemId: string) => number | null } = {}
): ItemQualityReport {
    const complete = completeRows(matrix);
    const totals = complete.map((row) => row.scores.reduce((s, v) => s + v, 0));
    const enough = complete.length >= MIN_STUDENTS_FOR_CORRELATION;
    const matrixValues = complete.map((row) => row.scores);

    const totalVar = variance(totals);
    const sd = totalVar === null ? null : Math.sqrt(totalVar);
    const alpha = enough ? cronbachAlpha(matrixValues) : null;
    const discriminationOf = opts.discriminationOf ?? discriminationByItem(matrix);

    const items: ItemQuality[] = matrix.items.map((item, j) => {
        const answered = matrix.rows.map((row) => row.scores[j]).filter((v): v is number => v !== null);
        const itemMean = mean(answered);
        const pValue = itemMean === null || item.maxPoints <= 0 ? null : itemMean / item.maxPoints;
        const column = complete.map((row) => row.scores[j]);
        const rest = complete.map((row, i) => totals[i] - row.scores[j]);
        const rit = enough ? pearson(column, totals) : null;
        const rir = enough ? pearson(column, rest) : null;
        const alphaIfDeleted =
            enough && matrix.items.length > 2
                ? cronbachAlpha(complete.map((row) => row.scores.filter((_, k) => k !== j)))
                : null;

        const flags: ItemQualityFlag[] = [];
        if (pValue !== null && pValue < 0.3) flags.push('too_hard');
        if (pValue !== null && pValue > 0.9) flags.push('too_easy');
        if (rir !== null && rir < 0) flags.push('negative_rir');
        else if (rir !== null && rir < 0.2) flags.push('weak_rir');
        if (alpha !== null && alphaIfDeleted !== null && alphaIfDeleted > alpha + 0.01) flags.push('alpha_rises');

        return {
            itemId: item.id,
            maxPoints: item.maxPoints,
            sampleSize: answered.length,
            mean: itemMean,
            pValue,
            rit,
            rir,
            discrimination: discriminationOf(item.id),
            alphaIfDeleted,
            flags,
        };
    });

    return {
        summary: {
            n: complete.length,
            maxPoints: matrix.items.reduce((s, item) => s + item.maxPoints, 0),
            mean: mean(totals),
            sd,
            median: median(totals),
            min: totals.length ? Math.min(...totals) : null,
            max: totals.length ? Math.max(...totals) : null,
            alpha,
            sem: alpha !== null && sd !== null ? sd * Math.sqrt(Math.max(0, 1 - alpha)) : null,
        },
        items,
        totals: complete.map((row, i) => ({ studentId: row.studentId, points: totals[i] })),
    };
}

function latestAnswers(st: StudentTest): Map<string, TestAnswer> {
    const byQuestion = new Map<string, TestAnswer>();
    for (const answer of st.answers) byQuestion.set(answer.questionId, answer);
    return byQuestion;
}

/** One latest attempt per student, skipping absentees and submissions without answers. */
function scoredSubmissions(test: Test, studentTests: StudentTest[]): StudentTest[] {
    const byStudent = new Map<string, StudentTest>();
    for (const st of studentTests) {
        if (st.testId !== test.id || (!st.absent && st.answers.length === 0)) continue;
        const prev = byStudent.get(st.studentId);
        if (!prev || (st.attemptNumber ?? 1) >= (prev.attemptNumber ?? 1)) byStudent.set(st.studentId, st);
    }
    return [...byStudent.values()].filter((st) => !st.absent);
}

/**
 * Classical test-theory quality report for a test: difficulty (P), item-total and item-rest
 * correlations, Cronbach's α (and α if an item is dropped), SEM and the score distribution.
 * Only students with a score on every question count toward the correlations and α, as
 * missing cells would otherwise read as zeroes.
 */
export function calcTestQuality(test: Test, studentTests: StudentTest[]): ItemQualityReport {
    const questions = test.questions;
    const submissions = scoredSubmissions(test, studentTests);
    const matrix: ItemMatrix = {
        items: questions.map((q) => ({ id: q.id, maxPoints: q.points })),
        rows: submissions.map((st) => {
            const answers = latestAnswers(st);
            return {
                studentId: st.studentId,
                scores: questions.map((q) => {
                    const a = answers.get(q.id);
                    return a ? scoreTestAnswer(q, a) : null;
                }),
            };
        }),
    };
    const discrimination = new Map(
        calcTestItemAnalysis(submissions, test).map((row) => [row.questionId, row.discrimination])
    );
    return calcItemQuality(matrix, { discriminationOf: (itemId) => discrimination.get(itemId) ?? null });
}

/** Rule-of-thumb reading of α for teacher-made tests. */
export function alphaBand(alpha: number | null): 'unknown' | 'low' | 'acceptable' | 'good' {
    if (alpha === null) return 'unknown';
    if (alpha < 0.6) return 'low';
    if (alpha < 0.8) return 'acceptable';
    return 'good';
}
