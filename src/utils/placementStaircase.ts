import type { Test, TestQuestion, CefrLevel, StaircaseStep } from '../types';
import { CEFR_LEVELS } from '../data/cefrDescriptors';
import { isAutoScorable } from './placementRouting';
import { seededShuffle } from './seededShuffle';

/** Shape needed by the staircase helpers below — narrower than `Test` so builder-in-progress state can reuse them directly. */
type SectionedTest = Pick<Test, 'questions' | 'sections'>;

/**
 * Classic single-step staircase constants (roadmap Phase 25.3): start at A2, two consecutive
 * correct answers at a level moves up, a single miss moves down, and the run converges once the
 * level has reversed direction twice. Hardcoded rather than teacher-configurable — the roadmap
 * describes a fixed, explainable algorithm, not a tunable engine.
 */
export const STAIRCASE_START_LEVEL: CefrLevel = 'A2';
export const STEP_UP_AFTER_CORRECT = 2;
export const CONVERGE_AFTER_REVERSALS = 2;
/** Safety cap so a misconfigured or genuinely oscillating run can't ask forever. */
export const MAX_QUESTIONS = 12;

/**
 * Elo-based within-level self-calibration (roadmap Phase 25.4) — item ratings only, no persisted
 * per-student rating. Each level has a fixed Elo "opponent" anchor derived from `computeStaircaseState`'s
 * current level, standing in for the student; this keeps the mechanism a pure refinement of item
 * ordering within a level; the staircase itself still owns level progression.
 */
export const DEFAULT_ELO_RATING = 1200;
export const ELO_K_FACTOR = 24;
export const LEVEL_TO_ELO: Record<CefrLevel, number> = {
    A1: 600,
    A2: 900,
    B1: 1200,
    B2: 1500,
    C1: 1800,
    C2: 2100,
};

/**
 * Half-width of each level's Elo band (roadmap Phase 25.5, teacher-facing rating UI): half the
 * 300-point gap between adjacent `LEVEL_TO_ELO` anchors, so bands tile the Elo axis exactly with
 * no overlap (e.g. A2's [750, 1050] ends exactly where B1's [1050, 1350] begins).
 */
export const CEFR_ELO_BAND_HALF_WIDTH = 150;

/** The non-overlapping Elo range associated with a CEFR level, centered on its `LEVEL_TO_ELO` anchor. */
export function cefrEloRange(level: CefrLevel): { min: number; max: number } {
    const anchor = LEVEL_TO_ELO[level];
    return { min: anchor - CEFR_ELO_BAND_HALF_WIDTH, max: anchor + CEFR_ELO_BAND_HALF_WIDTH };
}

/** Probability the item is answered correctly, standard logistic Elo expectation. */
export function eloExpectedScore(itemRating: number, opponentRating: number): number {
    return 1 / (1 + 10 ** ((itemRating - opponentRating) / 400));
}

/** Updates a single item's rating from one response. `correct` moves the rating down (item was "beaten"); a miss moves it up. */
export function updateItemElo(itemRating: number, opponentRating: number, correct: boolean): number {
    const expected = eloExpectedScore(itemRating, opponentRating);
    const actual = correct ? 1 : 0;
    return itemRating - ELO_K_FACTOR * (actual - expected);
}

export interface StaircaseState {
    level: CefrLevel;
    consecutiveCorrect: number;
    reversalCount: number;
    lastDirection: 'up' | 'down' | null;
    converged: boolean;
}

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

/**
 * Optional overrides for `computeStaircaseState`/`moveLevel`, used by the live generator engine
 * (roadmap 27.1) which runs within a teacher-configured CEFR range rather than the full A1–C2
 * span, and doesn't share the classic staircase's hardcoded `MAX_QUESTIONS` safety cap (the
 * generator owns its own min/max-questions stop rule instead). Omitted fields fall back to the
 * classic staircase constants above, so existing `'staircase'`-engine call sites are unaffected.
 */
export interface StaircaseRunConfig {
    startLevel?: CefrLevel;
    minLevel?: CefrLevel;
    maxLevel?: CefrLevel;
    convergeAfterReversals?: number;
}

/** Index-clamped CEFR level midway between two levels (inclusive range), rounded down on an even span. */
export function cefrMidpoint(minLevel: CefrLevel, maxLevel: CefrLevel): CefrLevel {
    const minIdx = CEFR_LEVELS.indexOf(minLevel);
    const maxIdx = CEFR_LEVELS.indexOf(maxLevel);
    return CEFR_LEVELS[minIdx + Math.floor((maxIdx - minIdx) / 2)];
}

function moveLevel(
    level: CefrLevel,
    direction: 'up' | 'down',
    minLevel: CefrLevel = CEFR_LEVELS[0],
    maxLevel: CefrLevel = CEFR_LEVELS[CEFR_LEVELS.length - 1]
): CefrLevel {
    const idx = CEFR_LEVELS.indexOf(level);
    const minIdx = CEFR_LEVELS.indexOf(minLevel);
    const maxIdx = CEFR_LEVELS.indexOf(maxLevel);
    const nextIdx = direction === 'up' ? idx + 1 : idx - 1;
    return CEFR_LEVELS[Math.min(maxIdx, Math.max(minIdx, nextIdx))];
}

/** Auto-scorable questions belonging to any section tagged with the given level. */
export function levelQuestions(test: SectionedTest, level: CefrLevel): TestQuestion[] {
    const sectionIdsAtLevel = new Set((test.sections ?? []).filter((s) => s.cefrLevel === level).map((s) => s.id));
    return test.questions.filter((q) => q.sectionId && sectionIdsAtLevel.has(q.sectionId) && isAutoScorable(q));
}

/**
 * Pure replay of a staircase run's history — the single source of truth for "what level are we
 * at, and are we done." A level move only counts as a reversal when its direction differs from
 * the previous move's (the first move never reverses); moves are clamped at the configured
 * (default A1/C2) bounds and a clamped move (no actual level change) never counts as a reversal
 * either. `config` lets the live generator engine (27.1) run within a narrower CEFR range and a
 * different start level than the classic staircase — omitted fields fall back to today's constants.
 *
 * A step's `overridden` (roadmap 27.2: a teacher's live level nudge, applied to the question this
 * step represents) shifts the level one step in that direction *before* the step's own
 * correct/incorrect move is applied, and resets the correct-streak — the override relocates the
 * ladder, it isn't itself an answer. It does not count toward reversal detection (that stays a
 * purely answer-driven signal), so a nudge can never single-handedly end the run.
 */
export function computeStaircaseState(
    steps: Pick<StaircaseStep, 'level' | 'correct' | 'overridden'>[],
    config?: StaircaseRunConfig
): StaircaseState {
    const minLevel = config?.minLevel ?? CEFR_LEVELS[0];
    const maxLevel = config?.maxLevel ?? CEFR_LEVELS[CEFR_LEVELS.length - 1];
    const convergeAfterReversals = config?.convergeAfterReversals ?? CONVERGE_AFTER_REVERSALS;
    let level: CefrLevel = config?.startLevel ?? STAIRCASE_START_LEVEL;
    let consecutiveCorrect = 0;
    let reversalCount = 0;
    let lastDirection: 'up' | 'down' | null = null;

    for (const step of steps) {
        if (step.overridden) {
            level = moveLevel(level, step.overridden, minLevel, maxLevel);
            consecutiveCorrect = 0;
        }
        const direction: 'up' | 'down' = step.correct ? 'up' : 'down';
        if (step.correct) {
            consecutiveCorrect++;
            if (consecutiveCorrect < STEP_UP_AFTER_CORRECT) continue;
        }
        const moved = moveLevel(level, direction, minLevel, maxLevel);
        if (moved !== level) {
            if (lastDirection !== null && lastDirection !== direction) reversalCount++;
            lastDirection = direction;
        }
        level = moved;
        consecutiveCorrect = 0;
    }

    const converged = reversalCount >= convergeAfterReversals || (!config && steps.length >= MAX_QUESTIONS);
    return { level, consecutiveCorrect, reversalCount, lastDirection, converged };
}

/**
 * Picks the item whose `eloRating` (defaulting to `DEFAULT_ELO_RATING` when unset) sits closest to
 * `anchor`. Ties are broken by the caller's pre-shuffled item order (first item wins on an exact
 * tie), so a caller wanting deterministic-but-varied tiebreaks should seed-shuffle before calling.
 * Shared by `resolveNextStaircaseQuestion` and the live generator engine's edge-function-side pick
 * (roadmap 27.1), so the "nearest to level anchor" selection rule lives in exactly one place.
 */
export function pickNearestEloItem<T extends { eloRating?: number }>(items: T[], anchor: number): T {
    return items.reduce((best, item) => {
        const bestDistance = Math.abs((best.eloRating ?? DEFAULT_ELO_RATING) - anchor);
        const itemDistance = Math.abs((item.eloRating ?? DEFAULT_ELO_RATING) - anchor);
        return itemDistance < bestDistance ? item : best;
    });
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
