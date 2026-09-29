// Rule-based only — no AI/LLM calls (see CLAUDE.md "No AI generation"). Same shape as learningPathAggregator.
import type {
    ClassWeakCriterion,
    EssayAssignment,
    Rubric,
    StudentRubric,
    WritingCriterionTrend,
    WritingTrendConfig,
    WritingTrendDirection,
    WritingTrendPoint,
} from '../types';
import { criterionMaxPoints, criterionPercentage } from './gradeCalc';

export const DEFAULT_WRITING_TREND_CONFIG: WritingTrendConfig = {
    lowScoreThreshold: 60,
    minPoints: 3,
    slopeEpsilon: 2,
};

function isGradedEssay(sr: StudentRubric, assignments: EssayAssignment[]): boolean {
    return (
        !!sr.gradedAt &&
        !sr.isPeerReview &&
        !sr.notHandedIn &&
        !sr.deletedAt &&
        assignments.some((a) => a.rubricId === sr.rubricId && a.studentId === sr.studentId)
    );
}

function slopeOf(scores: number[]): number {
    const n = scores.length;
    if (n < 2) return 0;
    const meanX = (n - 1) / 2;
    const meanY = scores.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    scores.forEach((y, x) => {
        num += (x - meanX) * (y - meanY);
        den += (x - meanX) ** 2;
    });
    return num / den;
}

function directionOf(slope: number, epsilon: number): WritingTrendDirection {
    if (slope > epsilon) return 'improving';
    if (slope < -epsilon) return 'declining';
    return 'flat';
}

/**
 * Follows each rubric criterion across a student's graded essays (ordered by gradedAt). Essays are
 * graded through ordinary StudentRubrics, so an essay is a graded, handed-in StudentRubric whose
 * (rubricId, studentId) has an EssayAssignment. Criteria are matched by name so copies of a rubric
 * stay on one line; criteria with fewer than `minPoints` graded essays are omitted.
 */
export function getWritingCriterionTrends(
    studentId: string,
    studentRubrics: StudentRubric[],
    rubrics: Rubric[],
    essayAssignments: EssayAssignment[],
    config: WritingTrendConfig = DEFAULT_WRITING_TREND_CONFIG
): WritingCriterionTrend[] {
    const essays = studentRubrics
        .filter((sr) => sr.studentId === studentId && isGradedEssay(sr, essayAssignments))
        .sort((a, b) => a.gradedAt!.localeCompare(b.gradedAt!));

    const byCriterion = new Map<string, { name: string; points: WritingTrendPoint[] }>();
    for (const sr of essays) {
        const rubric = sr.rubricSnapshot ?? rubrics.find((r) => r.id === sr.rubricId);
        if (!rubric) continue;
        for (const entry of sr.entries) {
            const criterion = rubric.criteria.find((c) => c.id === entry.criterionId);
            if (!criterion || criterionMaxPoints(criterion) === 0) continue;
            const key = (criterion.title ?? '').trim().toLowerCase() || criterion.id;
            const bucket = byCriterion.get(key) ?? { name: criterion.title || criterion.id, points: [] };
            bucket.points.push({
                studentRubricId: sr.id,
                gradedAt: sr.gradedAt!,
                score: criterionPercentage(entry, criterion),
            });
            byCriterion.set(key, bucket);
        }
    }

    const trends: WritingCriterionTrend[] = [];
    byCriterion.forEach(({ name, points }, criterionKey) => {
        if (points.length < config.minPoints) return;
        const scores = points.map((p) => p.score);
        const slope = slopeOf(scores);
        trends.push({
            studentId,
            criterionKey,
            name,
            points,
            latest: scores[scores.length - 1],
            previous: scores.length > 1 ? scores[scores.length - 2] : null,
            average: scores.reduce((a, b) => a + b, 0) / scores.length,
            slope,
            direction: directionOf(slope, config.slopeEpsilon),
            persistentWeak: scores.slice(-config.minPoints).every((s) => s <= config.lowScoreThreshold),
        });
    });
    return trends;
}

/** Trends worth a teacher's attention — persistently weak or declining below threshold — weakest first. */
export function getWeakWritingCriteria(
    studentId: string,
    studentRubrics: StudentRubric[],
    rubrics: Rubric[],
    essayAssignments: EssayAssignment[],
    config: WritingTrendConfig = DEFAULT_WRITING_TREND_CONFIG
): WritingCriterionTrend[] {
    return getWritingCriterionTrends(studentId, studentRubrics, rubrics, essayAssignments, config)
        .filter((t) => t.persistentWeak || (t.direction === 'declining' && t.latest <= config.lowScoreThreshold))
        .sort((a, b) => a.average - b.average || a.name.localeCompare(b.name));
}

/** Class view: criteria on which several students are weak or declining, most affected first. */
export function getClassWeakWritingCriteria(
    studentIds: string[],
    studentRubrics: StudentRubric[],
    rubrics: Rubric[],
    essayAssignments: EssayAssignment[],
    config: WritingTrendConfig = DEFAULT_WRITING_TREND_CONFIG
): ClassWeakCriterion[] {
    const acc = new Map<string, { name: string; scores: number[]; weak: string[]; declining: string[] }>();
    for (const studentId of studentIds) {
        for (const t of getWritingCriterionTrends(studentId, studentRubrics, rubrics, essayAssignments, config)) {
            const e = acc.get(t.criterionKey) ?? { name: t.name, scores: [], weak: [], declining: [] };
            e.scores.push(t.average);
            if (t.persistentWeak) e.weak.push(studentId);
            if (t.direction === 'declining' && t.latest <= config.lowScoreThreshold) e.declining.push(studentId);
            acc.set(t.criterionKey, e);
        }
    }
    const out: ClassWeakCriterion[] = [];
    acc.forEach((e, criterionKey) => {
        if (!e.weak.length && !e.declining.length) return;
        out.push({
            criterionKey,
            name: e.name,
            studentCount: e.scores.length,
            weakStudentIds: e.weak,
            decliningStudentIds: e.declining,
            averageScore: e.scores.reduce((a, b) => a + b, 0) / e.scores.length,
        });
    });
    return out.sort(
        (a, b) =>
            b.weakStudentIds.length - a.weakStudentIds.length ||
            a.averageScore - b.averageScore ||
            a.name.localeCompare(b.name)
    );
}
