import type { Test, TestQuestion, CefrLevel, StaircaseStep } from '../types';
import { isAutoScorable } from '../../supabase/functions/_shared/testScoring.ts';
import { seededShuffle } from '../../supabase/functions/_shared/seededShuffle.ts';
import {
    computeStaircaseState,
    pickNearestEloItem,
    LEVEL_TO_ELO,
} from '../../supabase/functions/_shared/placementStaircase.ts';

export {
    STAIRCASE_START_LEVEL,
    STEP_UP_AFTER_CORRECT,
    CONVERGE_AFTER_REVERSALS,
    MAX_QUESTIONS,
    DEFAULT_ELO_RATING,
    ELO_K_FACTOR,
    LEVEL_TO_ELO,
    CEFR_ELO_BAND_HALF_WIDTH,
    cefrEloRange,
    eloExpectedScore,
    updateItemElo,
    cefrMidpoint,
    computeStaircaseState,
    pickNearestEloItem,
} from '../../supabase/functions/_shared/placementStaircase.ts';
export type { StaircaseState, StaircaseRunConfig } from '../../supabase/functions/_shared/placementStaircase.ts';

/** Shape needed by the staircase helpers below — narrower than `Test` so builder-in-progress state can reuse them directly. */
type SectionedTest = Pick<Test, 'questions' | 'sections'>;

/** A staircase (adaptive-ladder) placement test — sections are CEFR-level question pools, not routing stages. */
export function isStaircaseTest(test: Pick<Test, 'mode' | 'placementEngine'>): boolean {
    return test.mode === 'placement' && test.placementEngine === 'staircase';
}

/**
 * True for either engine that produces a `StudentTest.levelPath` (a per-question adaptive trace)
 * rather than an `sectionPath` (MST's fixed routing stages) — the staircase engine (25.3) and the
 * live generator engine (27.1), which reuses the same `StaircaseStep`/`computeStaircaseState`
 * replay even though its questions are pulled from the bank at runtime instead of a pre-authored pool.
 */
export function usesLevelPathEstimate(test: Pick<Test, 'mode' | 'placementEngine'>): boolean {
    return test.mode === 'placement' && (test.placementEngine === 'staircase' || test.placementEngine === 'generator');
}

/** Auto-scorable questions belonging to any section tagged with the given level. */
export function levelQuestions(test: SectionedTest, level: CefrLevel): TestQuestion[] {
    const sectionIdsAtLevel = new Set((test.sections ?? []).filter((s) => s.cefrLevel === level).map((s) => s.id));
    return test.questions.filter((q) => q.sectionId && sectionIdsAtLevel.has(q.sectionId) && isAutoScorable(q));
}

/**
 * Resolves the next question for a staircase test given the steps taken so far. Returns null
 * when the run has converged, or when the current level's pool has no unseen auto-scorable
 * questions left (an exhausted pool is itself a safety-valve convergence).
 *
 * Among unseen items, prefers the one whose `eloRating` (Phase 25.4) sits closest to the current
 * level's Elo anchor — the seeded shuffle order remains the tiebreak, so with unrated (default-rating)
 * items this reduces to the pre-25.4 seeded-draw behavior exactly.
 */
export function resolveNextStaircaseQuestion(
    test: SectionedTest,
    steps: StaircaseStep[],
    code: string
): { sectionId: string; level: CefrLevel; question: TestQuestion } | null {
    const state = computeStaircaseState(steps);
    if (state.converged) return null;

    const pool = levelQuestions(test, state.level);
    if (pool.length === 0) return null;

    const askedIds = new Set(steps.map((s) => s.questionId));
    const unseen = seededShuffle(pool, `${code}-${state.level}`).filter((q) => !askedIds.has(q.id));
    if (unseen.length === 0) return null;

    const next = pickNearestEloItem(unseen, LEVEL_TO_ELO[state.level]);
    return { sectionId: next.sectionId!, level: state.level, question: next };
}

/**
 * Total points available across only the questions actually asked, for path-aware scoring.
 * Takes a plain question list rather than a `Test` so callers can pass a merged list — a
 * generator-engine (27.1) run's asked questions live in `StudentTest.askedQuestionSnapshots`,
 * not `test.questions`, since they're pulled from the bank at runtime rather than pre-authored.
 */
export function staircaseMaxPoints(questions: TestQuestion[], steps: Pick<StaircaseStep, 'questionId'>[]): number {
    const askedIds = new Set(steps.map((s) => s.questionId));
    return questions.filter((q) => askedIds.has(q.id)).reduce((sum, q) => sum + q.points, 0);
}
