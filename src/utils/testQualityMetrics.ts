import type { StudentTest, Test, TestAnswer } from '../types';
import { scoreTestAnswer } from './testCalc';
import { calcTestItemAnalysis } from './testSummaryAggregator';

/** Below this many complete score rows, correlations and α are too noisy to show. */
export const MIN_STUDENTS_FOR_CORRELATION = 5;

export type ItemQualityFlag = 'too_hard' | 'too_easy' | 'weak_rir' | 'negative_rir' | 'alpha_rises';

export interface ItemQuality {
    questionId: string;
    maxPoints: number;
    sampleSize: number;
    mean: number | null;
    pValue: number | null;
    /** Pearson correlation of the item score with the total score. */
    rit: number | null;
    /** Correlation of the item score with the total of the other items (corrected item-total). */
    rir: number | null;
    /** Upper/lower-27% discrimination index from calcTestItemAnalysis. */
    discrimination: number | null;
    /** Cronbach's α of the test without this item. */
    alphaIfDeleted: number | null;
    flags: ItemQualityFlag[];
}

export interface TestQualitySummary {
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

export interface TestQualityReport {
    summary: TestQualitySummary;
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
export function calcTestQuality(test: Test, studentTests: StudentTest[]): TestQualityReport {
    const questions = test.questions;
    const maxPoints = questions.reduce((s, q) => s + q.points, 0);
    const submissions = scoredSubmissions(test, studentTests);

    const rows = submissions.map((st) => {
        const answers = latestAnswers(st);
        return {
            studentId: st.studentId,
            scores: questions.map((q) => {
                const a = answers.get(q.id);
                return a ? scoreTestAnswer(q, a) : null;
            }),
        };
    });
    const complete = rows.filter((r) => r.scores.every((v) => v !== null)) as {
        studentId: string;
        scores: number[];
    }[];
    const matrix = complete.map((r) => r.scores);
    const totals = matrix.map((row) => row.reduce((s, v) => s + v, 0));
    const enough = complete.length >= MIN_STUDENTS_FOR_CORRELATION;

    const alpha = enough ? cronbachAlpha(matrix) : null;
    const totalVar = variance(totals);
    const sd = totalVar === null ? null : Math.sqrt(totalVar);

    const itemAnalysis = new Map(calcTestItemAnalysis(submissions, test).map((r) => [r.questionId, r]));

    const items: ItemQuality[] = questions.map((q, j) => {
        const answered = rows.map((r) => r.scores[j]).filter((v): v is number => v !== null);
        const itemMean = mean(answered);
        const pValue = itemMean === null || q.points <= 0 ? null : itemMean / q.points;
        const column = matrix.map((row) => row[j]);
        const rest = matrix.map((row, i) => totals[i] - row[j]);
        const rit = enough ? pearson(column, totals) : null;
        const rir = enough ? pearson(column, rest) : null;
        const alphaIfDeleted =
            enough && questions.length > 2 ? cronbachAlpha(matrix.map((row) => row.filter((_, k) => k !== j))) : null;

        const flags: ItemQualityFlag[] = [];
        if (pValue !== null && pValue < 0.3) flags.push('too_hard');
        if (pValue !== null && pValue > 0.9) flags.push('too_easy');
        if (rir !== null && rir < 0) flags.push('negative_rir');
        else if (rir !== null && rir < 0.2) flags.push('weak_rir');
        if (alpha !== null && alphaIfDeleted !== null && alphaIfDeleted > alpha + 0.01) flags.push('alpha_rises');

        return {
            questionId: q.id,
            maxPoints: q.points,
            sampleSize: answered.length,
            mean: itemMean,
            pValue,
            rit,
            rir,
            discrimination: itemAnalysis.get(q.id)?.discrimination ?? null,
            alphaIfDeleted,
            flags,
        };
    });

    return {
        summary: {
            n: complete.length,
            maxPoints,
            mean: mean(totals),
            sd,
            median: median(totals),
            min: totals.length ? Math.min(...totals) : null,
            max: totals.length ? Math.max(...totals) : null,
            alpha,
            sem: alpha !== null && sd !== null ? sd * Math.sqrt(Math.max(0, 1 - alpha)) : null,
        },
        items,
        totals: complete.map((r, i) => ({ studentId: r.studentId, points: totals[i] })),
    };
}

/** Rule-of-thumb reading of α for teacher-made tests. */
export function alphaBand(alpha: number | null): 'unknown' | 'low' | 'acceptable' | 'good' {
    if (alpha === null) return 'unknown';
    if (alpha < 0.6) return 'low';
    if (alpha < 0.8) return 'acceptable';
    return 'good';
}
