import { criterionMaxPoints, criterionPercentage } from './gradeCalc';
import { BLOOM_LEVELS } from '../data/bloomsTaxonomy';
import { IB_ATTRIBUTES } from '../data/ibLearnerProfile';
import { GRAMMAR_CATEGORIES } from '../data/grammarStandards';
import { SLO_KERNDOELEN } from '../data/sloKerndoelen';
import type { AssessmentFramework, RubricCriterion, StudentRubric } from '../types';

export interface FrameworkBucket {
    categoryId: string;
    categoryLabelEn: string;
    categoryLabelNl: string;
    categoryColor: string;
    avgPercentage: number;
    count: number;
}

type CategoryMeta = { id: string; labelEn: string; labelNl: string; color: string };

const CANONICAL_CATEGORIES: Record<AssessmentFramework, CategoryMeta[]> = {
    blooms: BLOOM_LEVELS,
    ib: IB_ATTRIBUTES,
    grammar: GRAMMAR_CATEGORIES,
    slo: SLO_KERNDOELEN,
};

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

            if (criterionMaxPoints(criterion) === 0) continue;

            const pct = criterionPercentage(entry, criterion);

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

    const canonical = CANONICAL_CATEGORIES[framework];

    return canonical.map((meta) => {
        const id = meta.id;
        const bucket = buckets.get(id);

        if (!bucket) {
            return {
                categoryId: id,
                categoryLabelEn: meta.labelEn,
                categoryLabelNl: meta.labelNl,
                categoryColor: meta.color,
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
