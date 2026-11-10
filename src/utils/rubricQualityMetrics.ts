import type { Class, Rubric, ScoreEntry, Student, StudentRubric } from '../types';
import { calcEntryPoints, criterionMaxPoints } from './gradeCalc';
import { dedupeStudentRubrics } from './syncMerge';
import { calcItemQuality, discriminationByItem, type ItemMatrix, type ItemQualityReport } from './testQualityMetrics';
import { gradeTier } from './tieredRubric';

/**
 * A criterion only counts as graded when a level, an override or a single-point outcome was
 * recorded — an entry created by opening the card but left untouched is still ungraded, and would
 * otherwise be read as a zero.
 */
function isGraded(entry: ScoreEntry | undefined): entry is ScoreEntry {
    return !!entry && (!!entry.levelId || entry.overridePoints !== undefined || entry.singlePointOutcome !== undefined);
}

export interface RubricTierCount {
    id: string;
    count: number;
}

export interface RubricQualityReport extends ItemQualityReport {
    /** Tiers with at least one graded student, most grades first; empty for a non-tiered rubric. */
    tiers: RubricTierCount[];
    /** The tier the metrics were computed on, when the rubric is tiered. */
    tierId?: string;
    /** Grades left out because their group submission had already contributed a row. */
    groupedRows: number;
}

/**
 * Classical item-quality analysis (P-value, Rit/Rir, Cronbach's α, SEM, discrimination) for
 * rubric-graded work, where each criterion plays the role of an item. The totals are raw point
 * sums, not weighted percentages: α and the item-total correlations are defined on an unweighted
 * sum, and a weighted total would break the variance decomposition they rely on.
 *
 * Only students with every criterion scored contribute, and a tiered rubric is only ever compared
 * within a single tier — each tier has its own descriptors and thresholds.
 */
export function calcRubricQuality(
    rubric: Rubric,
    studentRubrics: StudentRubric[],
    students: Student[],
    classes: Class[],
    opts: { classId?: string; tierId?: string } = {}
): RubricQualityReport {
    const studentById = new Map(students.map((s) => [s.id, s]));
    const classById = new Map(classes.map((c) => [c.id, c]));

    const scoped = dedupeStudentRubrics(studentRubrics).records.filter(
        (sr) =>
            sr.rubricId === rubric.id &&
            !sr.isPeerReview &&
            !sr.deletedAt &&
            !sr.notHandedIn &&
            (!opts.classId || studentById.get(sr.studentId)?.classId === opts.classId)
    );

    const tierById = new Map<string, string>();
    const tiers: RubricTierCount[] = [];
    if (rubric.tiered) {
        for (const sr of scoped) {
            const student = studentById.get(sr.studentId);
            const cls = student?.classId ? classById.get(student.classId) : undefined;
            const tier = gradeTier(rubric.tiered, sr, student, cls);
            if (tier) tierById.set(sr.id, tier.id);
        }
        const counts = new Map<string, number>();
        for (const id of tierById.values()) counts.set(id, (counts.get(id) ?? 0) + 1);
        tiers.push(...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count })));
    }
    const requestedTier = tiers.some((tier) => tier.id === opts.tierId) ? opts.tierId : undefined;
    const tierId = rubric.tiered ? (requestedTier ?? tiers[0]?.id) : undefined;
    const inTier = tierId ? scoped.filter((sr) => tierById.get(sr.id) === tierId) : scoped;

    // One row per group submission: its members carry copies of the same shared scores, and
    // counting each copy would inflate α and every item-total correlation.
    const seenGroups = new Set<string>();
    let groupedRows = 0;
    const rows: ItemMatrix['rows'] = [];
    for (const sr of inTier) {
        if (sr.groupId) {
            if (seenGroups.has(sr.groupId)) {
                groupedRows += 1;
                continue;
            }
            seenGroups.add(sr.groupId);
        }
        rows.push({
            studentId: sr.studentId,
            scores: rubric.criteria.map((criterion) => {
                const entry = sr.entries.find((e) => e.criterionId === criterion.id);
                return isGraded(entry) ? calcEntryPoints(entry, criterion) : null;
            }),
        });
    }

    const matrix: ItemMatrix = {
        items: rubric.criteria.map((criterion) => ({ id: criterion.id, maxPoints: criterionMaxPoints(criterion) })),
        rows,
    };
    return {
        ...calcItemQuality(matrix, { discriminationOf: discriminationByItem(matrix) }),
        tiers,
        groupedRows,
        ...(tierId ? { tierId } : {}),
    };
}
