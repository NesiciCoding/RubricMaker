import { describe, it, expect } from 'vitest';
import {
    FULL_CALIBRATION_SAMPLES,
    GRAMMAR_EVIDENCE_WEIGHTS,
    MIN_CALIBRATION_SAMPLES,
    calibrateGrammarWeights,
    grammarStreamPcts,
} from './grammarWeightCalibration';
import { grammarMasteryBreakdown, withGrammarTargets } from './masteryTargetAnalysis';
import type { GrammarEvidenceWeights } from './grammarWeightCalibration';
import type { GrammarItemMastery } from './masteryProfileAggregator';

/** A row whose three streams carry exactly the given percentages (null = stream has no data). */
function row(
    pcts: { writing: number | null; test: number | null; flashcards: number | null },
    options: { attempts?: number; cards?: number; itemId?: string } = {}
): GrammarItemMastery {
    // 100 cards so an integer percentage maps exactly onto the mastered ratio.
    const cards = options.cards ?? 100;
    return {
        itemId: options.itemId ?? 'gr-present-simple-affirmative',
        level: 'A1',
        labelEn: 'Affirmative',
        labelNl: 'Bevestigend',
        categoryId: 'present-simple',
        categoryLabelEn: 'Present Simple',
        categoryLabelNl: 'Tegenwoordige tijd',
        writing: pcts.writing === null ? null : { instances: 2, avgPct: pcts.writing },
        test:
            pcts.test === null
                ? null
                : {
                      attempts: options.attempts ?? 4,
                      correctAttempts: Math.round(((options.attempts ?? 4) * pcts.test) / 100),
                      accuracyPct: pcts.test,
                  },
        flashcards:
            pcts.flashcards === null
                ? null
                : {
                      cardCount: cards,
                      newCount: 0,
                      learningCount: 0,
                      reviewCount: 0,
                      masteredCount: Math.round((pcts.flashcards / 100) * cards),
                      dueCount: 0,
                  },
    };
}

/** `count` rows where writing matches the peer mean and the other two streams are off by ±deviation. */
function writingAgreesRows(count: number, deviation = 30, identical = false): GrammarItemMastery[] {
    return Array.from({ length: count }, (_, i) =>
        identical
            ? row({ writing: 60, test: 60, flashcards: 60 }, { itemId: `gr-item-${i}` })
            : row(
                  {
                      writing: 60,
                      test: 60 + (i % 2 === 0 ? deviation : -deviation),
                      flashcards: 60 - (i % 2 === 0 ? deviation : -deviation),
                  },
                  { itemId: `gr-item-${i}` }
              )
    );
}

function sumWeights(weights: GrammarEvidenceWeights): number {
    return weights.writing + weights.test + weights.flashcards;
}

describe('calibrateGrammarWeights — standard until the data is thorough', () => {
    it('keeps the standard blend with no evidence', () => {
        const calibration = calibrateGrammarWeights([]);
        expect(calibration.source).toBe('standard');
        expect(calibration.blend).toBe(0);
        expect(calibration.sampleCount).toBe(0);
        expect(calibration.reason).toBe('insufficient-samples');
        expect(calibration.weights).toEqual({ ...GRAMMAR_EVIDENCE_WEIGHTS });
    });

    it(`keeps the standard blend below ${MIN_CALIBRATION_SAMPLES} fully-observed rows`, () => {
        const calibration = calibrateGrammarWeights(writingAgreesRows(MIN_CALIBRATION_SAMPLES - 1));
        expect(calibration.sampleCount).toBe(MIN_CALIBRATION_SAMPLES - 1);
        expect(calibration.source).toBe('standard');
        expect(calibration.reason).toBe('insufficient-samples');
        expect(calibration.weights).toEqual({ ...GRAMMAR_EVIDENCE_WEIGHTS });
    });

    it('does not count rows that lack a stream or carry too little evidence in one', () => {
        const rows = [
            row({ writing: 50, test: null, flashcards: 50 }),
            row({ writing: 50, test: 50, flashcards: null }),
            row({ writing: 50, test: 50, flashcards: 50 }, { attempts: 1 }),
            row({ writing: 50, test: 50, flashcards: 50 }, { cards: 1 }),
        ];
        expect(calibrateGrammarWeights(rows).sampleCount).toBe(0);
        expect(calibrateGrammarWeights(rows).source).toBe('standard');
    });

    it('returns the standard blend when every stream is equally consistent', () => {
        const calibration = calibrateGrammarWeights(writingAgreesRows(FULL_CALIBRATION_SAMPLES, 30, true));
        expect(calibration.sampleCount).toBe(FULL_CALIBRATION_SAMPLES);
        expect(calibration.source).toBe('standard');
        expect(calibration.reason).toBe('degenerate-fit');
        expect(calibration.weights).toEqual({ ...GRAMMAR_EVIDENCE_WEIGHTS });
    });
});

describe('calibrateGrammarWeights — fitting', () => {
    it('shifts weight toward the stream that agrees with the other two', () => {
        const calibration = calibrateGrammarWeights(writingAgreesRows(FULL_CALIBRATION_SAMPLES));
        expect(calibration.source).toBe('calibrated');
        expect(calibration.blend).toBe(1);
        // Writing is the only stream matching the peer consensus, so it gains and the others lose.
        expect(calibration.weights.writing).toBeGreaterThan(GRAMMAR_EVIDENCE_WEIGHTS.writing);
        expect(calibration.weights.test).toBeLessThan(GRAMMAR_EVIDENCE_WEIGHTS.test);
        expect(calibration.weights.flashcards).toBeLessThan(GRAMMAR_EVIDENCE_WEIGHTS.flashcards);
        // Both noisy streams are equally noisy, so they are nudged by the same factor — the
        // standard ordering between them (tests over flashcards) is preserved rather than collapsed.
        expect(calibration.weights.test / calibration.weights.flashcards).toBeCloseTo(0.35 / 0.2, 3);
        expect(sumWeights(calibration.weights)).toBeCloseTo(1, 4);
    });

    it('can lower the standard ordering when writing is the odd one out', () => {
        // Writing off by ±30 from a test/flashcard pair that agree with each other.
        const rows = Array.from({ length: FULL_CALIBRATION_SAMPLES }, (_, i) =>
            row({ writing: 60 + (i % 2 === 0 ? 30 : -30), test: 60, flashcards: 60 }, { itemId: `gr-item-${i}` })
        );
        const calibration = calibrateGrammarWeights(rows);
        expect(calibration.source).toBe('calibrated');
        expect(calibration.weights.writing).toBeLessThan(GRAMMAR_EVIDENCE_WEIGHTS.writing);
        expect(calibration.weights.test).toBeGreaterThan(GRAMMAR_EVIDENCE_WEIGHTS.test);
    });

    it('cannot zero a stream or let one swallow the blend', () => {
        // The most extreme fit the data can produce: writing agrees perfectly, the other two never do.
        const calibration = calibrateGrammarWeights(writingAgreesRows(FULL_CALIBRATION_SAMPLES * 4));
        for (const stream of ['writing', 'test', 'flashcards'] as const) {
            expect(calibration.weights[stream]).toBeGreaterThan(0.05);
            expect(calibration.weights[stream]).toBeLessThan(0.8);
        }
        expect(calibration.weights.writing).toBeLessThan(0.77);
        expect(sumWeights(calibration.weights)).toBeCloseTo(1, 4);
    });

    it('picks up gradually between the minimum and the full sample count', () => {
        const below = calibrateGrammarWeights(writingAgreesRows(MIN_CALIBRATION_SAMPLES));
        const mid = calibrateGrammarWeights(writingAgreesRows(MIN_CALIBRATION_SAMPLES + 20));
        const full = calibrateGrammarWeights(writingAgreesRows(FULL_CALIBRATION_SAMPLES));
        const beyond = calibrateGrammarWeights(writingAgreesRows(FULL_CALIBRATION_SAMPLES * 3));

        // The ramp starts at the minimum, so the first eligible cohort still gets the standard blend.
        expect(below.blend).toBe(0);
        expect(below.weights).toEqual({ ...GRAMMAR_EVIDENCE_WEIGHTS });
        expect(mid.blend).toBeCloseTo(20 / (FULL_CALIBRATION_SAMPLES - MIN_CALIBRATION_SAMPLES), 4);
        expect(full.blend).toBe(1);
        expect(beyond.blend).toBe(1);
        expect(mid.source).toBe('calibrated');
        expect(mid.weights.writing).toBeGreaterThan(below.weights.writing);
        expect(full.weights.writing).toBeGreaterThan(mid.weights.writing);
        // Full takeover is a fixed point: more data does not push further than the fitted weights.
        expect(beyond.weights).toEqual(full.weights);
    });

    it('is deterministic — input order cannot change the result', () => {
        const rows = writingAgreesRows(FULL_CALIBRATION_SAMPLES, 25);
        const forward = calibrateGrammarWeights(rows);
        const reversed = calibrateGrammarWeights([...rows].reverse());
        const repeated = calibrateGrammarWeights(rows);
        expect(reversed).toEqual(forward);
        expect(repeated).toEqual(forward);
    });

    it('reports the residual spread it fitted against', () => {
        const calibration = calibrateGrammarWeights(writingAgreesRows(FULL_CALIBRATION_SAMPLES));
        expect(calibration.spread).toBeDefined();
        expect(calibration.spread!.writing).toBe(0);
        expect(calibration.spread!.test).toBeCloseTo(45 ** 2, 4);
    });
});

describe('grammarStreamPcts', () => {
    it('reads the three streams with the same rules as the breakdown', () => {
        expect(grammarStreamPcts(row({ writing: 80, test: 60, flashcards: 50 }))).toEqual({
            writing: 80,
            test: 60,
            flashcards: 50,
        });
        expect(grammarStreamPcts(row({ writing: null, test: 60, flashcards: null }))).toEqual({
            writing: null,
            test: 60,
            flashcards: null,
        });
    });
});

describe('weights threaded through the mastery analysis', () => {
    it('uses the passed weights for the blend', () => {
        const weights: GrammarEvidenceWeights = { writing: 0, test: 0, flashcards: 1 };
        const entry = grammarMasteryBreakdown(row({ writing: 10, test: 10, flashcards: 90 }), weights);
        expect(entry.pct).toBe(90);
        expect(entry.weightTotal).toBe(1);
    });

    it('withGrammarTargets blends with the calibration it is given', () => {
        const rows = writingAgreesRows(FULL_CALIBRATION_SAMPLES);
        const calibration = calibrateGrammarWeights(rows);
        const entries = withGrammarTargets(rows, [], 'jaar-2', 'havo', { calibration });
        entries.forEach((entry, i) => {
            expect(entry.masteryPct).toBe(grammarMasteryBreakdown(rows[i], calibration.weights).pct);
        });
        // Calibrated weights differ from the standard here, so the two must not agree.
        expect(entries[0].masteryPct).not.toBe(grammarMasteryBreakdown(rows[0]).pct);
    });

    it('withGrammarTargets calibrates from its own rows when not given a calibration', () => {
        const rows = writingAgreesRows(FULL_CALIBRATION_SAMPLES);
        const entries = withGrammarTargets(rows, [], 'jaar-2', 'havo');
        expect(entries[0].masteryPct).toBe(grammarMasteryBreakdown(rows[0], calibrateGrammarWeights(rows).weights).pct);
    });

    it('keeps small inputs on the standard blend', () => {
        const rows = writingAgreesRows(3);
        const entries = withGrammarTargets(rows, [], 'jaar-2', 'havo');
        entries.forEach((entry, i) => {
            expect(entry.masteryPct).toBe(grammarMasteryBreakdown(rows[i], GRAMMAR_EVIDENCE_WEIGHTS).pct);
        });
    });
});
