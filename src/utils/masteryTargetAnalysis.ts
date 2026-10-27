import type {
    CefrLevel,
    CefrSkill,
    CefrSkillTarget,
    CefrSubLevel,
    CefrSubLevelRange,
    GrammarMasteryTarget,
    MasteryTarget,
    SchoolYear,
    StandardMasteryTarget,
    VoTrack,
} from '../types';
import { CEFR_SKILLS } from '../data/cefrDescriptors';
import { getCefrTargetRange } from '../data/cefrTrackYearTargets';
import { cefrLevelOrdinal, cefrSubLevelBaseLevel, cefrSubLevelOrdinal, compareToRange } from './cefrOrdinal';
import type { ProgressStatus } from './cefrOrdinal';
import type { GrammarItemMastery } from './masteryProfileAggregator';
import type { CefrCellData } from './cefrStudentAggregator';
import { GRAMMAR_EVIDENCE_WEIGHTS, calibrateGrammarWeights, grammarStreamPcts } from './grammarWeightCalibration';
import type { GrammarEvidenceWeights, GrammarWeightCalibration } from './grammarWeightCalibration';
import type { CefrExpectationCalibration } from './cefrExpectationCalibration';

export { GRAMMAR_EVIDENCE_WEIGHTS };
export type { GrammarEvidenceWeights, GrammarWeightCalibration };

// ─── Target lookup ────────────────────────────────────────────────────────────

/**
 * A target applies to exactly one (year, track) cell. groep-7/8 have no track, so those rows are
 * stored without one and only match an undefined track (see SCHOOL_YEAR_HAS_TRACK) — the same
 * equality rule `learningGoalsAggregator` has always used for standards.
 */
export function targetMatchesYearTrack(
    target: Pick<MasteryTarget, 'year' | 'voTrack'>,
    year: SchoolYear | undefined,
    voTrack: VoTrack | undefined
): boolean {
    if (!year || target.year !== year) return false;
    return (target.voTrack ?? undefined) === (voTrack ?? undefined);
}

/** Legacy rows have no `scope`; everything else is discriminated by its own literal scope. */
export function isStandardTarget(t: MasteryTarget): t is StandardMasteryTarget {
    return (t.scope ?? 'standard') === 'standard';
}

export function findStandardTarget(
    targets: MasteryTarget[] | undefined,
    standardGuid: string,
    year: SchoolYear | undefined,
    voTrack: VoTrack | undefined
): StandardMasteryTarget | undefined {
    if (!targets) return undefined;
    return targets.find(
        (t): t is StandardMasteryTarget =>
            isStandardTarget(t) && t.standardGuid === standardGuid && targetMatchesYearTrack(t, year, voTrack)
    );
}

export function findGrammarTarget(
    targets: MasteryTarget[] | undefined,
    grammarItemId: string,
    year: SchoolYear | undefined,
    voTrack: VoTrack | undefined
): GrammarMasteryTarget | undefined {
    if (!targets) return undefined;
    return targets.find(
        (t): t is GrammarMasteryTarget =>
            t.scope === 'grammar' && t.grammarItemId === grammarItemId && targetMatchesYearTrack(t, year, voTrack)
    );
}

export function findCefrSkillTarget(
    targets: MasteryTarget[] | undefined,
    skill: CefrSkill,
    year: SchoolYear | undefined,
    voTrack: VoTrack | undefined
): CefrSkillTarget | undefined {
    if (!targets) return undefined;
    return targets.find(
        (t): t is CefrSkillTarget =>
            t.scope === 'cefr' && t.cefrSkill === skill && targetMatchesYearTrack(t, year, voTrack)
    );
}

// ─── Grammar: blended mastery estimate ────────────────────────────────────────

export interface GrammarMasteryBreakdown {
    /** Weighted, available-streams-only estimate in percent; null when the item has no evidence at all. */
    pct: number | null;
    testPct: number | null;
    flashcardPct: number | null;
    writingPct: number | null;
    /** Sum of the weights that actually contributed — exposed for tooltips/tests. */
    weightTotal: number;
}

/**
 * Blends the grammar mastery profile's test accuracy, flashcard mastery ratio and rubric writing
 * average into one percentage. Only streams with data contribute and the weights are renormalised
 * across them, so a student measured by writing alone is scored on that alone rather than being
 * penalised for missing flashcard/test evidence. `weights` defaults to the standard blend; callers
 * that have a calibrated set pass it in (see `grammarWeightCalibration`).
 */
export function grammarMasteryBreakdown(
    row: GrammarItemMastery,
    weights: GrammarEvidenceWeights = GRAMMAR_EVIDENCE_WEIGHTS
): GrammarMasteryBreakdown {
    const { writing: writingPct, test: testPct, flashcards: flashcardPct } = grammarStreamPcts(row);

    const parts: { weight: number; pct: number }[] = [];
    if (writingPct !== null) parts.push({ weight: weights.writing, pct: writingPct });
    if (testPct !== null) parts.push({ weight: weights.test, pct: testPct });
    if (flashcardPct !== null) parts.push({ weight: weights.flashcards, pct: flashcardPct });

    const weightTotal = parts.reduce((sum, p) => sum + p.weight, 0);
    const pct = weightTotal > 0 ? parts.reduce((sum, p) => sum + p.pct * p.weight, 0) / weightTotal : null;

    return { pct, testPct, flashcardPct, writingPct, weightTotal };
}

/** Convenience wrapper around `grammarMasteryBreakdown` for callers that only need the estimate. */
export function grammarMasteryPercentage(
    row: GrammarItemMastery,
    weights: GrammarEvidenceWeights = GRAMMAR_EVIDENCE_WEIGHTS
): number | null {
    return grammarMasteryBreakdown(row, weights).pct;
}

function roundToOneDecimal(value: number): number {
    return Math.round(value * 10) / 10;
}

/** Percentage targets use the same ahead/on-track/behind semantics as standards targets. */
export function comparePercentageToTarget(pct: number, targetPercentage: number): ProgressStatus {
    const pctRounded = roundToOneDecimal(pct);
    if (pctRounded > targetPercentage) return 'ahead';
    if (pctRounded < targetPercentage) return 'behind';
    return 'on-track';
}

export interface GrammarTargetProgress {
    row: GrammarItemMastery;
    masteryPct: number | null;
    breakdown: GrammarMasteryBreakdown;
    /** Present only when a grammar target exists for this item at the student's (year, track). */
    targetPercentage?: number;
    /** Undefined when no target is configured; 'no-data' when a target exists but the item has no evidence. */
    status?: ProgressStatus;
}

export interface GrammarTargetsOptions {
    /** Weights to blend with; defaults to standard weights calibrated from `rows` (usually standard). */
    weights?: GrammarEvidenceWeights;
    /**
     * Calibration that produced `weights`. The student profile passes a cohort-wide fit here so a
     * single student's rows are not asked to calibrate the blend on their own.
     */
    calibration?: GrammarWeightCalibration;
}

/**
 * Attaches the matching grammar target and its ahead/on-track/behind status to every mastery row.
 * Rows without a configured target keep `status`/`targetPercentage` undefined so the UI can render
 * the evidence it already shows without inventing a comparison.
 *
 * The blend uses `options.weights`, else the weights calibrated from these rows, else the standard
 * blend — so small inputs (a handful of items) behave exactly as they always did.
 */
export function withGrammarTargets(
    rows: GrammarItemMastery[],
    targets: MasteryTarget[] | undefined,
    year: SchoolYear | undefined,
    voTrack: VoTrack | undefined,
    options: GrammarTargetsOptions = {}
): GrammarTargetProgress[] {
    const calibration = options.calibration ?? (options.weights ? undefined : calibrateGrammarWeights(rows));
    const weights = options.weights ?? calibration?.weights ?? GRAMMAR_EVIDENCE_WEIGHTS;
    return rows.map((row) => {
        const breakdown = grammarMasteryBreakdown(row, weights);
        const target = findGrammarTarget(targets, row.itemId, year, voTrack);
        if (!target) return { row, masteryPct: breakdown.pct, breakdown };
        return {
            row,
            masteryPct: breakdown.pct,
            breakdown,
            targetPercentage: target.targetPercentage,
            status:
                breakdown.pct === null ? 'no-data' : comparePercentageToTarget(breakdown.pct, target.targetPercentage),
        };
    });
}

// ─── CEFR: per-skill target levels ────────────────────────────────────────────

/**
 * Compares a student's coarse achieved level (A1–C2) against a fine-grained target sub-level.
 * A target with a +/- variant counts as met by its base level: the grid can say "B1" but not
 * "B1+", so an achieved B1 against a `b1-plus` target is on-track rather than behind. A
 * below-base target (`a2-minus`) is already exceeded by an achieved A2.
 */
export function compareLevelToTarget(achieved: CefrLevel | null, target: CefrSubLevel): ProgressStatus {
    if (!achieved) return 'no-data';
    const achievedOrdinal = cefrLevelOrdinal(achieved);
    const targetOrdinal = cefrSubLevelOrdinal(target);
    if (achievedOrdinal > targetOrdinal) return 'ahead';
    if (achievedOrdinal === targetOrdinal) return 'on-track';
    const base = cefrSubLevelBaseLevel(target);
    return base && achievedOrdinal === cefrLevelOrdinal(base) ? 'on-track' : 'behind';
}

export interface CefrSkillTargetProgress {
    skill: CefrSkill;
    achievedLevel: CefrLevel | null;
    /** Teacher-configured expected level; absent when falling back to the curriculum range. */
    targetLevel?: CefrSubLevel;
    /** Curriculum (or cohort-calibrated) band used when no per-skill target is configured. */
    expectedRange?: CefrSubLevelRange;
    /** True when this row is driven by a teacher-configured target rather than the curriculum table. */
    configured: boolean;
    /** True when `expectedRange` comes from cohort calibration rather than the curriculum table. */
    calibrated: boolean;
    /** The curriculum range the calibrated expectation was shifted from. */
    standardRange?: CefrSubLevelRange;
    status: ProgressStatus;
}

export interface CefrTargetProgressOptions {
    /** Skills to report; defaults to all five. */
    skills?: CefrSkill[];
    /** Cohort-calibrated expectations, overriding the curriculum band where they applied. */
    expectations?: CefrExpectationCalibration[];
}

/**
 * Mirrors `highestLevelForSkill` in `cefrStudentAggregator` (achieved cells first, else any cell with
 * data) without importing that module — keeps this analysis file usable in isolation and out of the
 * aggregator's heavier test/mock dependency graph. Exported for `calibrationCohorts`, so the cohort
 * observations and the per-skill table can never disagree about a student's level.
 */
export function achievedLevelForSkill(cells: CefrCellData[], skill: CefrSkill): CefrLevel | null {
    const skillCells = cells.filter((c) => c.skill === skill && ((c.rubricCount ?? 0) > 0 || c.totalDescriptors > 0));
    if (skillCells.length === 0) return null;
    const achieved = skillCells.filter((c) => c.state === 'achieved');
    const pool = achieved.length > 0 ? achieved : skillCells;
    return pool.reduce<CefrLevel>(
        (best, c) => (cefrLevelOrdinal(c.level) > cefrLevelOrdinal(best) ? c.level : best),
        pool[0].level
    );
}

/**
 * Builds one row per CEFR skill with its achieved level and target comparison. A teacher-configured
 * per-skill target overrides everything; otherwise a cohort-calibrated expectation is used if one
 * applied, and finally the uniform curriculum range from `CEFR_TRACK_YEAR_TARGETS`, so the analysis
 * still works out of the box.
 */
export function getCefrSkillTargetProgress(
    cells: CefrCellData[],
    targets: MasteryTarget[] | undefined,
    year: SchoolYear | undefined,
    voTrack: VoTrack | undefined,
    options: CefrTargetProgressOptions = {}
): CefrSkillTargetProgress[] {
    const skills = options.skills ?? CEFR_SKILLS;
    const curriculumRange = year ? getCefrTargetRange(year, voTrack) : undefined;
    return skills.map((skill) => {
        const achievedLevel = achievedLevelForSkill(cells, skill);
        const target = findCefrSkillTarget(targets, skill, year, voTrack);
        if (target) {
            return {
                skill,
                achievedLevel,
                targetLevel: target.targetLevel,
                configured: true,
                calibrated: false,
                status: compareLevelToTarget(achievedLevel, target.targetLevel),
            };
        }
        const cohort = options.expectations?.find((e) => e.skill === skill);
        const calibratedRange = cohort?.source === 'calibrated' ? cohort.expectedRange : undefined;
        const fallbackRange = calibratedRange ?? curriculumRange;
        return {
            skill,
            achievedLevel,
            expectedRange: fallbackRange,
            configured: false,
            calibrated: calibratedRange !== undefined,
            standardRange: calibratedRange ? (cohort?.standardRange ?? curriculumRange) : undefined,
            status: fallbackRange ? compareToRange(achievedLevel ?? undefined, fallbackRange) : 'no-data',
        };
    });
}
