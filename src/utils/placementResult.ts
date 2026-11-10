import type { Test, StudentTest, CefrLevel } from '../types';
import { cefrLevelOrdinal } from './cefrOrdinal';
import { scoreSectionPct } from './placementRouting';
import {
    usesLevelPathEstimate,
    computeStaircaseState,
    cefrMidpoint,
    type StaircaseRunConfig,
} from './placementStaircase';

export interface PlacementPathStep {
    sectionId: string;
    title: string;
    level?: CefrLevel;
    scorePct: number;
    /** Set when a teacher's live level nudge (roadmap 27.2) shifted the level before this step. */
    overridden?: 'up' | 'down';
}

export interface PlacementEstimate {
    level: CefrLevel;
    provisional: true;
    path: PlacementPathStep[];
}

const DEFAULT_TERMINAL_THRESHOLD_PCT = 60;

/**
 * Deterministic, teacher-explainable placement estimate (roadmap Phase 25.2): the highest
 * CEFR-tagged section on the path the student passed (scored at/above that section's own
 * routing threshold, or a 60% default for a terminal section with no routing). Falls back
 * to the lowest tagged level on the path when nothing was passed, so a struggling student
 * still gets a starting estimate rather than none at all.
 */
export function estimatePlacement(test: Test, studentTest: StudentTest): PlacementEstimate | null {
    if (usesLevelPathEstimate(test)) return estimateStaircasePlacement(test, studentTest);

    const sectionPath = studentTest.sectionPath;
    if (!sectionPath?.length) return null;

    const sectionsById = new Map((test.sections ?? []).map((s) => [s.id, s]));
    const path: PlacementPathStep[] = sectionPath.map((sectionId) => {
        const section = sectionsById.get(sectionId);
        return {
            sectionId,
            title: section?.title ?? sectionId,
            level: section?.cefrLevel,
            scorePct: scoreSectionPct(test, sectionId, studentTest.answers),
        };
    });

    const taggedSteps = path.filter((step): step is PlacementPathStep & { level: CefrLevel } => !!step.level);
    if (taggedSteps.length === 0) return null;

    const passed = taggedSteps.filter((step) => {
        const threshold = sectionsById.get(step.sectionId)?.routing?.thresholdPct ?? DEFAULT_TERMINAL_THRESHOLD_PCT;
        return step.scorePct >= threshold;
    });

    const level =
        passed.length > 0
            ? passed.reduce((best, step) => (cefrLevelOrdinal(step.level) > cefrLevelOrdinal(best.level) ? step : best))
                  .level
            : taggedSteps.reduce((worst, step) =>
                  cefrLevelOrdinal(step.level) < cefrLevelOrdinal(worst.level) ? step : worst
              ).level;

    return { level, provisional: true, path };
}

/**
 * The replay config a level-path submission actually ran under: a generator run's configured range
 * plus the start level written onto the submission, and undefined for a classic staircase test,
 * whose replay must keep its own A1–C2 bounds. A starter item can begin outside the range's
 * midpoint, so `placementStartLevel` wins; `cefrMidpoint()` only approximates submissions that
 * predate that field.
 */
export function levelPathRunConfig(test: Test, studentTest: StudentTest): StaircaseRunConfig | undefined {
    if (!test.generatorConfig) return undefined;
    return {
        minLevel: test.generatorConfig.minCefrLevel,
        maxLevel: test.generatorConfig.maxCefrLevel,
        startLevel:
            studentTest.placementStartLevel ??
            cefrMidpoint(test.generatorConfig.minCefrLevel, test.generatorConfig.maxCefrLevel),
    };
}

/**
 * Estimate for a staircase (roadmap Phase 25.3) or live generator (roadmap 27.1) placement run:
 * unlike MST, the run's own convergence rule already settles at the right level, so the estimate
 * is simply the level the replay ends on — no highest-passed/fallback logic needed. A generator
 * run's `generatorConfig` range must be threaded through the replay so clamping matches what
 * actually happened server-side (a staircase test has no `generatorConfig`, so this is a no-op
 * for it and the replay keeps its original A1–C2 bounds).
 */
function estimateStaircasePlacement(test: Test, studentTest: StudentTest): PlacementEstimate | null {
    const levelPath = studentTest.levelPath;
    if (!levelPath?.length) return null;

    const sectionsById = new Map((test.sections ?? []).map((s) => [s.id, s]));
    const path: PlacementPathStep[] = levelPath.map((step) => ({
        sectionId: step.sectionId,
        title: sectionsById.get(step.sectionId)?.title ?? step.sectionId,
        level: step.level,
        scorePct: step.correct ? 100 : 0,
        overridden: step.overridden,
    }));

    const config = levelPathRunConfig(test, studentTest);
    return { level: computeStaircaseState(levelPath, config).level, provisional: true, path };
}
