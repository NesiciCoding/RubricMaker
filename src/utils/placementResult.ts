import type { Test, StudentTest, CefrLevel } from '../types';
import { CEFR_LEVELS } from '../data/cefrDescriptors';
import { scoreSectionPct } from './placementRouting';

export interface PlacementPathStep {
    sectionId: string;
    title: string;
    level?: CefrLevel;
    scorePct: number;
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
            ? passed.reduce((best, step) =>
                  CEFR_LEVELS.indexOf(step.level) > CEFR_LEVELS.indexOf(best.level) ? step : best
              ).level
            : taggedSteps.reduce((worst, step) =>
                  CEFR_LEVELS.indexOf(step.level) < CEFR_LEVELS.indexOf(worst.level) ? step : worst
              ).level;

    return { level, provisional: true, path };
}
