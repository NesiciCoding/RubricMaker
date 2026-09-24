// Single source of truth for the staircase / generator placement ladder and its Elo
// self-calibration. Imported by the client (src/utils/placementStaircase.ts, placementResult.ts)
// and by the submit-test and next-placement-question edge functions. Keep it dependency-free
// apart from sibling _shared modules — see testScoring.ts.

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export const CEFR_LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

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
 *
 * DEFAULT_ELO_RATING and ELO_K_FACTOR are also hardcoded in the update_test_question_elo RPC
 * (migration 064); src/__tests__/atomicEloParity.test.ts keeps the two in sync.
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

/** The fields of a recorded step the ladder replay reads. */
export interface StaircaseStepInput {
    correct: boolean;
    /** Set when a teacher's live level nudge (roadmap 27.2) shifted the level before this step's question was picked. */
    overridden?: 'up' | 'down';
}

/**
 * Optional overrides for `computeStaircaseState`/`moveCefrLevel`, used by the live generator engine
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

/** Clamps a level into [minLevel, maxLevel] by CEFR order. */
export function clampCefrLevel(level: CefrLevel, minLevel: CefrLevel, maxLevel: CefrLevel): CefrLevel {
    const idx = CEFR_LEVELS.indexOf(level);
    const minIdx = CEFR_LEVELS.indexOf(minLevel);
    const maxIdx = CEFR_LEVELS.indexOf(maxLevel);
    return CEFR_LEVELS[Math.min(maxIdx, Math.max(minIdx, idx))];
}

/** Index-clamped CEFR level midway between two levels (inclusive range), rounded down on an even span. */
export function cefrMidpoint(minLevel: CefrLevel, maxLevel: CefrLevel): CefrLevel {
    const minIdx = CEFR_LEVELS.indexOf(minLevel);
    const maxIdx = CEFR_LEVELS.indexOf(maxLevel);
    return CEFR_LEVELS[minIdx + Math.floor((maxIdx - minIdx) / 2)];
}

/** One level step in `direction`, clamped to [minLevel, maxLevel] (default A1–C2). */
export function moveCefrLevel(
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
export function computeStaircaseState<S extends StaircaseStepInput>(
    steps: S[],
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
            level = moveCefrLevel(level, step.overridden, minLevel, maxLevel);
            consecutiveCorrect = 0;
        }
        const direction: 'up' | 'down' = step.correct ? 'up' : 'down';
        if (step.correct) {
            consecutiveCorrect++;
            if (consecutiveCorrect < STEP_UP_AFTER_CORRECT) continue;
        }
        const moved = moveCefrLevel(level, direction, minLevel, maxLevel);
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
 * Replays a classic staircase run from its correct/incorrect sequence: the level each step was
 * asked at, and whether any step was asked after the run had already converged. The client
 * (resolveNextStaircaseQuestion) checks convergence on the prefix *before* every step it asks,
 * so a legitimate levelPath never contains a step whose own preceding prefix had converged —
 * submit-test uses this to reject a forged trace.
 */
export function replayStaircaseLevels(correctFlags: boolean[]): {
    levelBeforeStep: CefrLevel[];
    askedAfterConverged: boolean;
} {
    const levelBeforeStep: CefrLevel[] = [];
    let askedAfterConverged = false;
    for (let i = 0; i < correctFlags.length; i++) {
        const before = computeStaircaseState(correctFlags.slice(0, i).map((correct) => ({ correct })));
        levelBeforeStep.push(before.level);
        if (before.converged) askedAfterConverged = true;
    }
    return { levelBeforeStep, askedAfterConverged };
}

/**
 * Picks the item whose `eloRating` (defaulting to `DEFAULT_ELO_RATING` when unset) sits closest to
 * `anchor`. Ties are broken by the caller's pre-shuffled item order (first item wins on an exact
 * tie), so a caller wanting deterministic-but-varied tiebreaks should seed-shuffle before calling.
 * Shared by the client's staircase engine and the live generator engine's edge-function-side pick
 * (roadmap 27.1), so the "nearest to level anchor" selection rule lives in exactly one place.
 */
export function pickNearestEloItem<T extends { eloRating?: number }>(items: T[], anchor: number): T {
    return items.reduce((best, item) => {
        const bestDistance = Math.abs((best.eloRating ?? DEFAULT_ELO_RATING) - anchor);
        const itemDistance = Math.abs((item.eloRating ?? DEFAULT_ELO_RATING) - anchor);
        return itemDistance < bestDistance ? item : best;
    });
}
