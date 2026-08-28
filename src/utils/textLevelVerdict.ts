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

    const recognised = LEVEL_ORDER.reduce((sum, lvl) => sum + levelCounts[lvl], 0);
    const known = LEVEL_ORDER.slice(0, targetIdx + 1).reduce((sum, lvl) => sum + levelCounts[lvl], 0);
    // No recognised words → vacuously nothing above target: treat as full coverage.
    const coveragePercent = recognised > 0 ? (known / recognised) * 100 : 100;

    const aboveTargetWords: CefrWordHit[] = [...wordLevels.entries()]
        .filter(([, level]) => LEVEL_ORDER.indexOf(level) > targetIdx)
        .sort(([wa, a], [wb, b]) => LEVEL_ORDER.indexOf(b) - LEVEL_ORDER.indexOf(a) || wa.localeCompare(wb))
        .slice(0, ABOVE_TARGET_CAP)
        .map(([word, level]) => ({ word, level }));

    const verdict: TargetLevelVerdict['verdict'] =
        coveragePercent >= SUITABLE_MIN
            ? 'suitable'
            : coveragePercent >= SLIGHTLY_ABOVE_MIN
              ? 'slightly_above'
              : 'too_hard';

    return { targetLevel: target, coveragePercent, aboveTargetWords, verdict };
}
