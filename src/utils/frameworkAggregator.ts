import { calcEntryPoints } from './gradeCalc';
import { BLOOM_LEVELS } from '../data/bloomsTaxonomy';
import { IB_ATTRIBUTES } from '../data/ibLearnerProfile';
import type { AssessmentFramework, RubricCriterion, StudentRubric } from '../types';

export interface FrameworkBucket {
    categoryId: string;
    categoryLabelEn: string;
    categoryLabelNl: string;
    categoryColor: string;
    avgPercentage: number;
    count: number;
}

export function aggregateFrameworkScores(
    framework: AssessmentFramework,
    studentRubrics: StudentRubric[],
    criteria: RubricCriterion[]
): FrameworkBucket[] {
    const buckets = new Map<string, { scores: number[]; labelEn: string; labelNl: string; color: string }>();

    for (const sr of studentRubrics) {
        const activeCriteria = sr.rubricSnapshot?.criteria ?? criteria;
        for (const criterion of activeCriteria) {
            const entry = sr.entries.find((e) => e.criterionId === criterion.id);
            if (!entry) continue;

            const maxPoints = Math.max(...criterion.levels.map((l) => l.maxPoints), 0);
            if (maxPoints === 0) continue;

            const earned = calcEntryPoints(entry, criterion);
            const pct = (earned / maxPoints) * 100;

            for (const fd of criterion.frameworkDescriptors ?? []) {
                if (fd.framework !== framework) continue;
                const existing = buckets.get(fd.categoryId);
                if (existing) {
                    existing.scores.push(pct);
                } else {
                    buckets.set(fd.categoryId, {
                        scores: [pct],
                        labelEn: fd.categoryLabelEn,
                        labelNl: fd.categoryLabelNl,
                        color: fd.categoryColor,
                    });
                }
            }
        }
    }

    const canonicalIds = framework === 'blooms' ? BLOOM_LEVELS.map((l) => l.id) : IB_ATTRIBUTES.map((a) => a.id);

    return canonicalIds.map((id) => {
        const bucket = buckets.get(id);
        const meta =
            framework === 'blooms' ? BLOOM_LEVELS.find((l) => l.id === id) : IB_ATTRIBUTES.find((a) => a.id === id);

        if (!bucket) {
            return {
                categoryId: id,
                categoryLabelEn: meta?.labelEn ?? id,
                categoryLabelNl: meta?.labelNl ?? id,
                categoryColor: meta?.color ?? '#94a3b8',
                avgPercentage: NaN,
                count: 0,
            };
        }

        const avg = bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length;
        return {
            categoryId: id,
            categoryLabelEn: bucket.labelEn,
            categoryLabelNl: bucket.labelNl,
            categoryColor: bucket.color,
            avgPercentage: avg,
            count: bucket.scores.length,
        };
    });
}
