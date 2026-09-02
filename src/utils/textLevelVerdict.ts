import { scanText } from './cefrVocabularyProfiler';
import type { CefrLevel, CefrWordHit, TargetLevelVerdict } from '../types';

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const ABOVE_TARGET_CAP = 40;

// Coverage thresholds over recognised content words (off-list excluded), a
// RubricMaker presentation of VocabKitchen's coverage figure. Anchored on the
// extensive-reading rule of thumb that ~90%+ known vocabulary reads as
// on-level and below ~75% is too demanding to assign without heavy support.
const SUITABLE_MIN = 90;
const SLIGHTLY_ABOVE_MIN = 75;

function verdictFor(coveragePercent: number): TargetLevelVerdict['verdict'] {
    return coveragePercent >= SUITABLE_MIN
        ? 'suitable'
        : coveragePercent >= SLIGHTLY_ABOVE_MIN
          ? 'slightly_above'
          : 'too_hard';
}

/**
 * Coverage %: the share of *recognised* content words at or below the target
 * (off-list words are excluded from both sides). No recognised words → treated
 * as full coverage (vacuously nothing above target).
 */
export function coverageFromCounts(levelCounts: Record<CefrLevel, number>, target: CefrLevel): number {
    const targetIdx = LEVEL_ORDER.indexOf(target);
    const recognised = LEVEL_ORDER.reduce((sum, lvl) => sum + levelCounts[lvl], 0);
    const known = LEVEL_ORDER.slice(0, targetIdx + 1).reduce((sum, lvl) => sum + levelCounts[lvl], 0);
    return recognised > 0 ? (known / recognised) * 100 : 100;
}

/**
 * Grade an aggregated level distribution against a target CEFR level, when the
 * source words aren't available (e.g. a class's pooled counts). Coverage +
 * verdict only — no above-target word list.
 */
export function computeTargetVerdictFromCounts(
    levelCounts: Record<CefrLevel, number>,
    target: CefrLevel
): Omit<TargetLevelVerdict, 'aboveTargetWords'> {
    const coveragePercent = coverageFromCounts(levelCounts, target);
    return { targetLevel: target, coveragePercent, verdict: verdictFor(coveragePercent) };
}

/**
 * Grade a text against a class's target CEFR level.
 *
 * Coverage is the share of *recognised* content words at or below the target
 * (off-list words — names, typos, jargon — are excluded from both sides, so
 * they neither help nor hurt). Above-target words are the distinct recognised
 * words above the target, ranked highest level first, capped for display.
 *
 * @param text - The text to grade.
 * @param target - The class's target CEFR level.
 * @returns A {@link TargetLevelVerdict}.
 */
export function computeTargetVerdict(text: string, target: CefrLevel): TargetLevelVerdict {
    const { levelCounts, wordLevels } = scanText(text);
    const targetIdx = LEVEL_ORDER.indexOf(target);
    const coveragePercent = coverageFromCounts(levelCounts, target);

    const aboveTargetWords: CefrWordHit[] = [...wordLevels.entries()]
        .filter(([, level]) => LEVEL_ORDER.indexOf(level) > targetIdx)
        .sort(([wa, a], [wb, b]) => LEVEL_ORDER.indexOf(b) - LEVEL_ORDER.indexOf(a) || wa.localeCompare(wb))
        .slice(0, ABOVE_TARGET_CAP)
        .map(([word, level]) => ({ word, level }));

    return { targetLevel: target, coveragePercent, aboveTargetWords, verdict: verdictFor(coveragePercent) };
}
