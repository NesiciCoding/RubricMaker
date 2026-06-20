// ponytail: deterministic rules only — no AI/LLM calls, see CLAUDE.md "No AI generation"

import type {
    CefrSkill,
    InterventionFlag,
    LearningPathConfig,
    LearningPathRecommendation,
    Rubric,
    StudentRubric,
} from '../types';
import type { CefrCellData } from './cefrStudentAggregator';
import { calcEntryPoints } from './gradeCalc';

export const DEFAULT_LEARNING_PATH_CONFIG: LearningPathConfig = {
    consecutiveLowThreshold: 3,
    lowScoreThreshold: 60,
    cohortGapThreshold: 15,
};

/**
 * Ranks rubric recommendations for cells where the student trails the cohort
 * average by more than `cohortGapThreshold` points. Reuses `CefrCellData`
 * produced by `getCefrStudentOverview` rather than re-deriving scores.
 *
 * @param studentId - Student to generate recommendations for
 * @param studentCells - That student's CEFR cells (skill/level + avgScore)
 * @param cohortAverages - skill__level → cohort average score, e.g. from averaging multiple students' cells
 * @param rubrics - Canonical rubrics, used to find untried rubrics tagged with the gap skill/level
 * @param achievedRubricIds - Rubric ids the student has already achieved (excluded from suggestions)
 * @param config - Threshold overrides
 */
export function getLearningPathRecommendations(
    studentId: string,
    studentCells: CefrCellData[],
    cohortAverages: Map<string, number>,
    rubrics: Rubric[],
    achievedRubricIds: Set<string>,
    config: LearningPathConfig = DEFAULT_LEARNING_PATH_CONFIG
): LearningPathRecommendation[] {
    const recommendations: LearningPathRecommendation[] = [];

    for (const cell of studentCells) {
        if (cell.rubricCount === 0) continue;
        const key = `${cell.skill}__${cell.level}`;
        const cohortAverage = cohortAverages.get(key);
        if (cohortAverage === undefined) continue;

        const gap = cell.avgScore - cohortAverage;
        if (gap >= -config.cohortGapThreshold) continue;

        const suggestedRubricIds = rubrics
            .filter(
                (r) =>
                    (r.cefrSkill ?? 'writing') === cell.skill &&
                    r.cefrTargetLevel === cell.level &&
                    !achievedRubricIds.has(r.id)
            )
            .map((r) => r.id);

        recommendations.push({
            studentId,
            skill: cell.skill,
            level: cell.level,
            studentScore: cell.avgScore,
            cohortAverage,
            gap,
            suggestedRubricIds,
        });
    }

    return recommendations.sort((a, b) => a.gap - b.gap);
}

/** Averages CefrCellData[] from multiple students into a skill__level → avgScore cohort map */
export function buildCohortAverages(allStudentCells: CefrCellData[][]): Map<string, number> {
    const sums = new Map<string, { total: number; count: number }>();
    for (const cells of allStudentCells) {
        for (const cell of cells) {
            if (cell.rubricCount === 0) continue;
            const key = `${cell.skill}__${cell.level}`;
            const entry = sums.get(key) ?? { total: 0, count: 0 };
            entry.total += cell.avgScore;
            entry.count += 1;
            sums.set(key, entry);
        }
    }
    const averages = new Map<string, number>();
    sums.forEach((v, k) => averages.set(k, v.total / v.count));
    return averages;
}

interface ChronologicalScore {
    score: number;
    gradedAt: string;
}

function findStreaks(scores: ChronologicalScore[], threshold: number, minLength: number): ChronologicalScore[][] {
    const streaks: ChronologicalScore[][] = [];
    let current: ChronologicalScore[] = [];

    for (const s of scores) {
        if (s.score <= threshold) {
            current.push(s);
        } else {
            if (current.length >= minLength) streaks.push(current);
            current = [];
        }
    }
    if (current.length >= minLength) streaks.push(current);
    return streaks;
}

/**
 * Detects N+ consecutive low scores on the same rubric criterion across a
 * student's graded submissions, ordered by gradedAt.
 */
export function getCriterionInterventionFlags(
    studentId: string,
    studentRubrics: StudentRubric[],
    rubrics: Rubric[],
    config: LearningPathConfig = DEFAULT_LEARNING_PATH_CONFIG
): InterventionFlag[] {
    const graded = studentRubrics
        .filter((sr) => sr.studentId === studentId && sr.gradedAt)
        .sort((a, b) => a.gradedAt!.localeCompare(b.gradedAt!));

    const scoresByCriterion = new Map<string, ChronologicalScore[]>();

    for (const sr of graded) {
        const rubric = sr.rubricSnapshot ?? rubrics.find((r) => r.id === sr.rubricId);
        if (!rubric) continue;

        for (const entry of sr.entries) {
            const criterion = rubric.criteria.find((c) => c.id === entry.criterionId);
            if (!criterion) continue;
            const maxPoints = Math.max(...criterion.levels.map((l) => l.maxPoints), 0);
            if (maxPoints === 0) continue;

            const pct = (calcEntryPoints(entry, criterion) / maxPoints) * 100;
            const list = scoresByCriterion.get(criterion.id) ?? [];
            list.push({ score: pct, gradedAt: sr.gradedAt! });
            scoresByCriterion.set(criterion.id, list);
        }
    }

    const flags: InterventionFlag[] = [];
    scoresByCriterion.forEach((scores, criterionId) => {
        const streaks = findStreaks(scores, config.lowScoreThreshold, config.consecutiveLowThreshold);
        for (const streak of streaks) {
            flags.push({
                studentId,
                kind: 'criterion',
                targetId: criterionId,
                streakLength: streak.length,
                scores: streak.map((s) => s.score),
                triggeredAt: streak[streak.length - 1].gradedAt,
            });
        }
    });

    return flags;
}

/**
 * Detects N+ consecutive low scores on the same CEFR skill across a
 * student's graded, CEFR-tagged rubric submissions, ordered by gradedAt.
 */
export function getCefrSkillInterventionFlags(
    studentId: string,
    studentRubrics: StudentRubric[],
    rubrics: Rubric[],
    config: LearningPathConfig = DEFAULT_LEARNING_PATH_CONFIG
): InterventionFlag[] {
    const graded = studentRubrics
        .filter((sr) => sr.studentId === studentId && sr.gradedAt)
        .sort((a, b) => a.gradedAt!.localeCompare(b.gradedAt!));

    const scoresBySkill = new Map<CefrSkill, ChronologicalScore[]>();

    for (const sr of graded) {
        const rubric = sr.rubricSnapshot ?? rubrics.find((r) => r.id === sr.rubricId);
        if (!rubric?.cefrTargetLevel) continue;

        const skill: CefrSkill = rubric.cefrSkill ?? 'writing';
        const maxPoints = Math.max(...rubric.criteria.flatMap((c) => c.levels.map((l) => l.maxPoints)), 0);
        if (maxPoints === 0) continue;

        const earned = sr.entries.reduce((sum, entry) => {
            const criterion = rubric.criteria.find((c) => c.id === entry.criterionId);
            return criterion ? sum + calcEntryPoints(entry, criterion) : sum;
        }, 0);
        const pct = (earned / maxPoints) * 100;

        const list = scoresBySkill.get(skill) ?? [];
        list.push({ score: pct, gradedAt: sr.gradedAt! });
        scoresBySkill.set(skill, list);
    }

    const flags: InterventionFlag[] = [];
    scoresBySkill.forEach((scores, skill) => {
        const streaks = findStreaks(scores, config.lowScoreThreshold, config.consecutiveLowThreshold);
        for (const streak of streaks) {
            flags.push({
                studentId,
                kind: 'cefrSkill',
                targetId: skill,
                streakLength: streak.length,
                scores: streak.map((s) => s.score),
                triggeredAt: streak[streak.length - 1].gradedAt,
            });
        }
    });

    return flags;
}
