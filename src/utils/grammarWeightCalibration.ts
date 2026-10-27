/**
 * Deterministic calibration of the grammar mastery blend.
 *
 * `GRAMMAR_EVIDENCE_WEIGHTS` is the standard: it encodes how directly each stream demonstrates
 * production of a structure, and it is what every estimate uses until the data is thick enough to
 * say something better. This module never invents a better answer from thin data — it only lets
 * the observed evidence *nudge* that standard, and only once enough fully-observed items exist.
 *
 * Determinism is a hard requirement (the same store must always produce the same weights, in every
 * browser and every test run), so the fit is a closed-form comparison against the peer streams:
 * no random restarts, no iteration to convergence, no dates and no ordering effects — just sums over
 * rows, evaluated in a fixed stream order.
 */
import type { GrammarItemMastery } from './masteryProfileAggregator';

export type GrammarEvidenceStream = 'writing' | 'test' | 'flashcards';

export interface GrammarEvidenceWeights {
    writing: number;
    test: number;
    flashcards: number;
}

/** Fixed order — every sum and every rounding step uses it so results cannot depend on input order. */
export const GRAMMAR_EVIDENCE_STREAMS: readonly GrammarEvidenceStream[] = ['writing', 'test', 'flashcards'];

/**
 * The standard blend: a graded writing instance is the strongest proof of production, an
 * auto-scored test answer next, flashcard recall (recognition, not production) weakest.
 */
export const GRAMMAR_EVIDENCE_WEIGHTS: Readonly<GrammarEvidenceWeights> = Object.freeze({
    writing: 0.45,
    test: 0.35,
    flashcards: 0.2,
});

/**
 * Rows that carry all three streams. Below this the standard weights are used unchanged; at
 * `FULL_CALIBRATION_SAMPLES` the fitted weights take over completely. In between the fit is blended
 * in linearly, so the weighting picks up gradually instead of flipping on a single observation.
 */
export const MIN_CALIBRATION_SAMPLES = 40;
export const FULL_CALIBRATION_SAMPLES = 120;

/** Per-stream evidence depth required from a calibration row (one flashcard or one test attempt is noise). */
const MIN_TEST_ATTEMPTS = 2;
const MIN_FLASHCARD_CARDS = 2;

/**
 * Floor for the peer variance, in percentage points squared. A stream that agrees perfectly with
 * the other two would otherwise get infinite reliability and swallow the whole blend.
 */
const MIN_PEER_VARIANCE = 1;

/** How far the fit may move a stream's weight away from its standard share. */
const MAX_RELIABILITY_RATIO = 2;
const MIN_RELIABILITY_RATIO = 0.5;

export type GrammarCalibrationReason = 'insufficient-samples' | 'degenerate-fit';

export interface GrammarWeightCalibration {
    /** Weights to use for the blend — always the standard until the gates pass. */
    weights: GrammarEvidenceWeights;
    source: 'standard' | 'calibrated';
    /** Rows with all three streams at usable depth; the only rows that can discriminate them. */
    sampleCount: number;
    /** Weight given to the fit (0 = standard only, 1 = fit only). */
    blend: number;
    /** Mean squared residual against the two peer streams, in percentage points². */
    spread?: GrammarEvidenceWeights;
    /** Why the standard weights were kept; absent once the fit is used. */
    reason?: GrammarCalibrationReason;
}

export interface GrammarEvidencePcts {
    writing: number | null;
    test: number | null;
    flashcards: number | null;
}

function round4(value: number): number {
    return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** The three stream percentages a mastery row contributes, or null where a stream has no data. */
export function grammarStreamPcts(row: GrammarItemMastery): GrammarEvidencePcts {
    return {
        writing: row.writing && row.writing.instances > 0 ? row.writing.avgPct : null,
        test: row.test && row.test.attempts > 0 ? row.test.accuracyPct : null,
        flashcards:
            row.flashcards && row.flashcards.cardCount > 0
                ? (row.flashcards.masteredCount / row.flashcards.cardCount) * 100
                : null,
    };
}

/** All three streams present, each backed by enough observations to be worth fitting against. */
function isCalibrationSample(row: GrammarItemMastery, pcts: GrammarEvidencePcts): boolean {
    if (pcts.writing === null || pcts.test === null || pcts.flashcards === null) return false;
    if (!row.test || row.test.attempts < MIN_TEST_ATTEMPTS) return false;
    if (!row.flashcards || row.flashcards.cardCount < MIN_FLASHCARD_CARDS) return false;
    return true;
}

function normalize(weights: GrammarEvidenceWeights): GrammarEvidenceWeights {
    const total = weights.writing + weights.test + weights.flashcards;
    return {
        writing: weights.writing / total,
        test: weights.test / total,
        flashcards: weights.flashcards / total,
    };
}

export function standardGrammarCalibration(
    sampleCount = 0,
    reason: GrammarCalibrationReason = 'insufficient-samples'
): GrammarWeightCalibration {
    return { weights: { ...GRAMMAR_EVIDENCE_WEIGHTS }, source: 'standard', sampleCount, blend: 0, reason };
}

/**
 * Fits the three stream weights from rows that carry all three streams.
 *
 * Each stream is scored against the mean of the other two, which is the only comparison that can
 * tell the streams apart: a consensus over *all* streams would shrink two-stream rows to mirrored
 * residuals and make writing, tests and flashcards indistinguishable. A stream that consistently
 * disagrees with the other two is the noisy one, so it loses weight — reliability being the inverse
 * of that residual variance, which is a deterministic, label-free stand-in for ground truth (there
 * is no independent "true mastery" to regress on in the store).
 *
 * Each stream's standard share is nudged by at most a factor of two (before the blend is
 * renormalised), so calibration tilts the standard rather than replacing it with whatever the
 * current cohort happens to show.
 */
export function calibrateGrammarWeights(rows: Iterable<GrammarItemMastery>): GrammarWeightCalibration {
    const spreadSums: GrammarEvidenceWeights = { writing: 0, test: 0, flashcards: 0 };
    let sampleCount = 0;

    for (const row of rows) {
        const pcts = grammarStreamPcts(row);
        if (!isCalibrationSample(row, pcts)) continue;
        const writing = pcts.writing as number;
        const test = pcts.test as number;
        const flashcards = pcts.flashcards as number;
        sampleCount += 1;
        spreadSums.writing += (writing - (test + flashcards) / 2) ** 2;
        spreadSums.test += (test - (writing + flashcards) / 2) ** 2;
        spreadSums.flashcards += (flashcards - (writing + test) / 2) ** 2;
    }

    if (sampleCount < MIN_CALIBRATION_SAMPLES) return standardGrammarCalibration(sampleCount);

    const spread: GrammarEvidenceWeights = {
        writing: spreadSums.writing / sampleCount,
        test: spreadSums.test / sampleCount,
        flashcards: spreadSums.flashcards / sampleCount,
    };
    const reliability: GrammarEvidenceWeights = {
        writing: 1 / Math.max(spread.writing, MIN_PEER_VARIANCE),
        test: 1 / Math.max(spread.test, MIN_PEER_VARIANCE),
        flashcards: 1 / Math.max(spread.flashcards, MIN_PEER_VARIANCE),
    };
    const meanReliability = (reliability.writing + reliability.test + reliability.flashcards) / 3;
    if (!Number.isFinite(meanReliability) || meanReliability <= 0) {
        return { ...standardGrammarCalibration(sampleCount, 'degenerate-fit'), spread };
    }

    // Multiplicative nudge of each standard share: the ordering built into the standard survives,
    // the fit only decides how much of that ordering the evidence actually supports.
    const adjusted: GrammarEvidenceWeights = {
        writing:
            GRAMMAR_EVIDENCE_WEIGHTS.writing *
            clamp(reliability.writing / meanReliability, MIN_RELIABILITY_RATIO, MAX_RELIABILITY_RATIO),
        test:
            GRAMMAR_EVIDENCE_WEIGHTS.test *
            clamp(reliability.test / meanReliability, MIN_RELIABILITY_RATIO, MAX_RELIABILITY_RATIO),
        flashcards:
            GRAMMAR_EVIDENCE_WEIGHTS.flashcards *
            clamp(reliability.flashcards / meanReliability, MIN_RELIABILITY_RATIO, MAX_RELIABILITY_RATIO),
    };
    const adjustedNormalized = normalize(adjusted);

    const shift = Math.max(
        Math.abs(adjustedNormalized.writing - GRAMMAR_EVIDENCE_WEIGHTS.writing),
        Math.abs(adjustedNormalized.test - GRAMMAR_EVIDENCE_WEIGHTS.test),
        Math.abs(adjustedNormalized.flashcards - GRAMMAR_EVIDENCE_WEIGHTS.flashcards)
    );
    // Every stream equally consistent (or equally noisy): the fit has nothing to say, keep the standard.
    if (shift < 1e-9) return { ...standardGrammarCalibration(sampleCount, 'degenerate-fit'), spread };

    const blend = clamp(
        (sampleCount - MIN_CALIBRATION_SAMPLES) / (FULL_CALIBRATION_SAMPLES - MIN_CALIBRATION_SAMPLES),
        0,
        1
    );
    const weights = normalize({
        writing: blend * adjustedNormalized.writing + (1 - blend) * GRAMMAR_EVIDENCE_WEIGHTS.writing,
        test: blend * adjustedNormalized.test + (1 - blend) * GRAMMAR_EVIDENCE_WEIGHTS.test,
        flashcards: blend * adjustedNormalized.flashcards + (1 - blend) * GRAMMAR_EVIDENCE_WEIGHTS.flashcards,
    });

    return {
        weights: {
            writing: round4(weights.writing),
            test: round4(weights.test),
            flashcards: round4(weights.flashcards),
        },
        source: blend > 0 ? 'calibrated' : 'standard',
        sampleCount,
        blend: round4(blend),
        spread: { writing: round4(spread.writing), test: round4(spread.test), flashcards: round4(spread.flashcards) },
    };
}
