import type { StudentRubric, Student, Rubric, RubricCriterion, GradeScale, Class } from '../types';
import { calcGradeSummary, calcClassStats, calcEntryPoints } from './gradeCalc';

export interface ClassComparisonResult {
    classId: string;
    className: string;
    average: number;
    median: number;
    highest: number;
    lowest: number;
    studentCount: number;
    criterionAvgs: Record<string, number>; // criterionId → avg %
}

export interface MultiTrendPoint {
    rubricName: string;
    date: string;
    [classId: string]: number | string;
}

export interface Insight {
    kind: 'struggling' | 'weak_criterion' | 'divergence';
    message: string;
}

export function compareClasses(
    classIds: string[],
    rubricId: string,
    studentRubrics: StudentRubric[],
    students: Student[],
    classes: Class[],
    rubric: Rubric,
    scale: GradeScale | null
): ClassComparisonResult[] {
    return classIds
        .map((classId) => {
            const cls = classes.find((c) => c.id === classId);
            const srs = studentRubrics.filter(
                (sr) => sr.rubricId === rubricId && students.find((s) => s.id === sr.studentId)?.classId === classId
            );
            const summaries = srs.map((sr) => calcGradeSummary(sr, rubric.criteria, scale, rubric));
            const stats = calcClassStats(summaries, scale);

            const criterionAvgs: Record<string, number> = {};
            for (const c of rubric.criteria) {
                const scores = srs.map((sr) => {
                    const entry = sr.entries.find((e) => e.criterionId === c.id);
                    return entry ? calcEntryPoints(entry, c) : 0;
                });
                const maxPts = Math.max(...c.levels.map((l) => l.maxPoints), 1);
                const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
                criterionAvgs[c.id] = parseFloat(((avg / maxPts) * 100).toFixed(1));
            }

            return {
                classId,
                className: cls?.name ?? classId,
                average: summaries.length > 0 ? parseFloat(stats.average.toFixed(1)) : 0,
                median: summaries.length > 0 ? parseFloat(stats.median.toFixed(1)) : 0,
                highest: summaries.length > 0 ? parseFloat(stats.highest.toFixed(1)) : 0,
                lowest: summaries.length > 0 ? parseFloat(stats.lowest.toFixed(1)) : 0,
                studentCount: summaries.length,
                criterionAvgs,
            };
        })
        .filter((r) => r.studentCount > 0);
}

export function buildMultiClassTrend(
    classIds: string[],
    classes: Class[],
    studentRubrics: StudentRubric[],
    students: Student[],
    rubrics: Rubric[],
    gradeScales: GradeScale[]
): MultiTrendPoint[] {
    const relevantRubrics = rubrics
        .filter((r) =>
            classIds.some((classId) =>
                studentRubrics.some(
                    (sr) => sr.rubricId === r.id && students.find((s) => s.id === sr.studentId)?.classId === classId
                )
            )
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return relevantRubrics.map((r) => {
        const scale =
            r.gradeScaleId === 'none' ? null : (gradeScales.find((g) => g.id === r.gradeScaleId) ?? gradeScales[0]);
        const point: MultiTrendPoint = { rubricName: r.name, date: r.createdAt };
        for (const classId of classIds) {
            const sums = studentRubrics
                .filter(
                    (sr) => sr.rubricId === r.id && students.find((s) => s.id === sr.studentId)?.classId === classId
                )
                .map((sr) => calcGradeSummary(sr, r.criteria, scale, r).modifiedPercentage);
            if (sums.length > 0) {
                point[classId] = parseFloat((sums.reduce((a, b) => a + b, 0) / sums.length).toFixed(1));
            }
        }
        // Also carry class names as metadata for the legend (not rendered as a Line)
        for (const classId of classIds) {
            const cls = classes.find((c) => c.id === classId);
            point[`__name_${classId}`] = cls?.name ?? classId;
        }
        return point;
    });
}

export function getInsights(results: ClassComparisonResult[], criteria: RubricCriterion[]): Insight[] {
    const insights: Insight[] = [];

    for (const r of results) {
        if (r.studentCount === 0) continue;
        if (r.average < 55) {
            insights.push({
                kind: 'struggling',
                message: `${r.className} may need targeted support — class average: ${r.average.toFixed(1)}%.`,
            });
        }
        for (const c of criteria) {
            const cAvg = r.criterionAvgs[c.id] ?? 0;
            if (r.average - cAvg >= 15) {
                insights.push({
                    kind: 'weak_criterion',
                    message: `"${c.title}" is a consistent weak point in ${r.className} (${cAvg.toFixed(1)}% vs class avg ${r.average.toFixed(1)}%).`,
                });
            }
        }
    }

    if (results.length >= 2) {
        let maxGap = 0;
        let maxGapCritTitle = '';
        let maxGapHigh = '';
        let maxGapLow = '';
        for (const c of criteria) {
            const avgs = results.map((r) => ({ name: r.className, avg: r.criterionAvgs[c.id] ?? 0 }));
            const sorted = [...avgs].sort((a, b) => a.avg - b.avg);
            const gap = sorted[sorted.length - 1].avg - sorted[0].avg;
            if (gap > maxGap) {
                maxGap = gap;
                maxGapCritTitle = c.title;
                maxGapHigh = sorted[sorted.length - 1].name;
                maxGapLow = sorted[0].name;
            }
        }
        if (maxGap >= 20) {
            insights.push({
                kind: 'divergence',
                message: `"${maxGapCritTitle}" shows the biggest gap: ${maxGapHigh} is ${maxGap.toFixed(0)} pp ahead of ${maxGapLow}.`,
            });
        }
    }

    return insights;
}
