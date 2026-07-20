// ponytail: deterministic rules only — no AI/LLM calls, see CLAUDE.md "No AI generation"

import type {
    CefrSkill,
    FlashcardDeck,
    InterventionFlag,
    LearningPathConfig,
    LearningPathRecommendation,
    Rubric,
    StudentRubric,
    StudentTest,
    Test,
} from '../types';
import type { CefrCellData } from './cefrStudentAggregator';
import { calcEntryPoints, criterionMaxPoints, criterionPercentage } from './gradeCalc';
import { autoScoreResponse } from './testCalc';

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
            if (criterionMaxPoints(criterion) === 0) continue;

            const pct = criterionPercentage(entry, criterion);
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

/** A rule-based grammar practice suggestion, triggered by a low-score streak on a grammar-linked criterion or question. */
export interface GrammarRecommendation {
    studentId: string;
    grammarItemId: string;
    streakLength: number;
    scores: number[];
    triggeredAt: string;
    /** Grammar-kind FlashcardDecks with a card tagged with this grammar item ("drill it"). */
    suggestedGrammarDeckIds: string[];
    /** Practice-mode, grammar-contentArea Tests with a question tagged with this grammar item ("practice it"). */
    suggestedGrammarTestIds: string[];
}

/**
 * Detects N+ consecutive low scores on the same grammar item — sourced from both graded
 * rubric criteria (via a 'grammar' LinkedFrameworkDescriptor) and graded/submitted test
 * questions (via TestQuestion.linkedGrammarItemId) — and suggests matching grammar content.
 * Mirrors getCriterionInterventionFlags' streak-detection shape; not a retrofit of
 * getLearningPathRecommendations, whose cohort-gap semantics are rubric-shaped.
 */
export function getGrammarRecommendations(
    studentId: string,
    studentRubrics: StudentRubric[],
    rubrics: Rubric[],
    studentTests: StudentTest[],
    tests: Test[],
    flashcardDecks: FlashcardDeck[],
    config: LearningPathConfig = DEFAULT_LEARNING_PATH_CONFIG
): GrammarRecommendation[] {
    const scoresByGrammarItem = new Map<string, ChronologicalScore[]>();

    const gradedRubrics = studentRubrics
        .filter((sr) => sr.studentId === studentId && sr.gradedAt)
        .sort((a, b) => a.gradedAt!.localeCompare(b.gradedAt!));

    for (const sr of gradedRubrics) {
        const rubric = sr.rubricSnapshot ?? rubrics.find((r) => r.id === sr.rubricId);
        if (!rubric) continue;

        for (const entry of sr.entries) {
            const criterion = rubric.criteria.find((c) => c.id === entry.criterionId);
            if (!criterion) continue;
            const grammarDescriptors = criterion.frameworkDescriptors?.filter((d) => d.framework === 'grammar');
            if (!grammarDescriptors?.length) continue;

            if (criterionMaxPoints(criterion) === 0) continue;
            const pct = criterionPercentage(entry, criterion);

            for (const desc of grammarDescriptors) {
                const list = scoresByGrammarItem.get(desc.descriptorId) ?? [];
                list.push({ score: pct, gradedAt: sr.gradedAt! });
                scoresByGrammarItem.set(desc.descriptorId, list);
            }
        }
    }

    const gradedTests = studentTests
        .filter((st) => st.studentId === studentId && (st.status === 'submitted' || st.status === 'graded'))
        .sort((a, b) => (a.submittedAt ?? a.startedAt).localeCompare(b.submittedAt ?? b.startedAt));

    for (const st of gradedTests) {
        const test = tests.find((t) => t.id === st.testId);
        if (!test) continue;

        for (const q of test.questions) {
            if (!q.linkedGrammarItemId || q.points <= 0) continue;
            const answer = st.answers.find((a) => a.questionId === q.id);
            if (!answer) continue;
            const earned = answer.pointsEarned ?? autoScoreResponse(q, answer.response);
            const pct = (earned / q.points) * 100;

            const list = scoresByGrammarItem.get(q.linkedGrammarItemId) ?? [];
            list.push({ score: pct, gradedAt: st.submittedAt ?? st.startedAt });
            scoresByGrammarItem.set(q.linkedGrammarItemId, list);
        }
    }

    const recommendations: GrammarRecommendation[] = [];
    scoresByGrammarItem.forEach((scores, grammarItemId) => {
        const sorted = [...scores].sort((a, b) => a.gradedAt.localeCompare(b.gradedAt));
        const streaks = findStreaks(sorted, config.lowScoreThreshold, config.consecutiveLowThreshold);
        for (const streak of streaks) {
            const suggestedGrammarDeckIds = flashcardDecks
                .filter((d) => d.deckKind === 'grammar' && d.cards.some((c) => c.linkedGrammarItemId === grammarItemId))
                .map((d) => d.id);
            const suggestedGrammarTestIds = tests
                .filter(
                    (t) =>
                        t.mode === 'practice' &&
                        t.contentArea === 'grammar' &&
                        t.questions.some((q) => q.linkedGrammarItemId === grammarItemId)
                )
                .map((t) => t.id);

            recommendations.push({
                studentId,
                grammarItemId,
                streakLength: streak.length,
                scores: streak.map((s) => s.score),
                triggeredAt: streak[streak.length - 1].gradedAt,
                suggestedGrammarDeckIds,
                suggestedGrammarTestIds,
            });
        }
    });

    return recommendations.sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));
}
