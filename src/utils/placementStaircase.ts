import type { Test, TestQuestion, CefrLevel } from '../types';
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

function moveLevel(level: CefrLevel, direction: 'up' | 'down'): CefrLevel {
    const idx = CEFR_LEVELS.indexOf(level);
    const nextIdx = direction === 'up' ? idx + 1 : idx - 1;
    return CEFR_LEVELS[Math.min(CEFR_LEVELS.length - 1, Math.max(0, nextIdx))];
}

/** Auto-scorable questions belonging to any section tagged with the given level. */
export function levelQuestions(test: SectionedTest, level: CefrLevel): TestQuestion[] {
    const sectionIdsAtLevel = new Set((test.sections ?? []).filter((s) => s.cefrLevel === level).map((s) => s.id));
    return test.questions.filter((q) => q.sectionId && sectionIdsAtLevel.has(q.sectionId) && isAutoScorable(q));
}

/**
 * Pure replay of a staircase run's history — the single source of truth for "what level are we
 * at, and are we done." A level move only counts as a reversal when its direction differs from
 * the previous move's (the first move never reverses); moves are clamped at A1/C2 and a clamped
 * move (no actual level change) never counts as a reversal either.
 */
export function computeStaircaseState(steps: { level: CefrLevel; correct: boolean }[]): StaircaseState {
    let level: CefrLevel = STAIRCASE_START_LEVEL;
    let consecutiveCorrect = 0;
    let reversalCount = 0;
    let lastDirection: 'up' | 'down' | null = null;

    for (const step of steps) {
        const direction: 'up' | 'down' = step.correct ? 'up' : 'down';
        if (step.correct) {
            consecutiveCorrect++;
            if (consecutiveCorrect < STEP_UP_AFTER_CORRECT) continue;
        }
        const moved = moveLevel(level, direction);
        if (moved !== level) {
            if (lastDirection !== null && lastDirection !== direction) reversalCount++;
            lastDirection = direction;
        }
        level = moved;
        consecutiveCorrect = 0;
    }

    const converged = reversalCount >= CONVERGE_AFTER_REVERSALS || steps.length >= MAX_QUESTIONS;
    return { level, consecutiveCorrect, reversalCount, lastDirection, converged };
}

/**
 * Resolves the next question for a staircase test given the steps taken so far. Returns null
 * when the run has converged, or when the current level's pool has no unseen auto-scorable
 * questions left (an exhausted pool is itself a safety-valve convergence).
 */
export function resolveNextStaircaseQuestion(
    test: SectionedTest,
    steps: { sectionId: string; level: CefrLevel; questionId: string; correct: boolean }[],
    code: string
): { sectionId: string; level: CefrLevel; question: TestQuestion } | null {
    const state = computeStaircaseState(steps);
    if (state.converged) return null;

    const pool = levelQuestions(test, state.level);
    if (pool.length === 0) return null;

    const askedIds = new Set(steps.map((s) => s.questionId));
    const next = seededShuffle(pool, `${code}-${state.level}`).find((q) => !askedIds.has(q.id));
    if (!next) return null;

    return { sectionId: next.sectionId!, level: state.level, question: next };
}

/** Total points available across only the questions actually asked, for path-aware scoring. */
export function staircaseMaxPoints(test: SectionedTest, steps: { questionId: string }[]): number {
    const askedIds = new Set(steps.map((s) => s.questionId));
    return test.questions.filter((q) => askedIds.has(q.id)).reduce((sum, q) => sum + q.points, 0);
}
