import fc from 'fast-check';
import { describe, it } from 'vitest';
import { calcEntryPoints, calcWeightedScore, applyModifier, calcLetterGrade, calcGradeColor } from '../gradeCalc';
import type { RubricCriterion, ScoreEntry, GradeScale, Modifier } from '../../types';

const finiteFloat = (min = 0, max = 100) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

const singleLevelCriterionArb = fc
    .tuple(finiteFloat(0, 50), finiteFloat(0, 50))
    .map(([minPts, rangeDelta]): RubricCriterion => ({
        id: 'c1',
        title: 'Criterion',
        description: '',
        weight: 1,
        levels: [
            {
                id: 'l1',
                label: 'Level',
                minPoints: minPts,
                maxPoints: minPts + rangeDelta,
                description: '',
                subItems: [],
            },
        ],
    }));

const entryForL1Arb = finiteFloat(0, 200).map((selectedPoints): ScoreEntry => ({
    criterionId: 'c1',
    levelId: 'l1',
    checkedSubItems: [],
    comment: '',
    selectedPoints,
}));

const modifierArb: fc.Arbitrary<Modifier> = fc.oneof(
    fc.record({ type: fc.constant('percentage' as const), value: finiteFloat(-200, 200), reason: fc.string() }),
    fc.record({ type: fc.constant('points' as const), value: finiteFloat(-200, 200), reason: fc.string() }),
    fc.record({ type: fc.constant('level' as const), value: fc.integer({ min: -20, max: 20 }), reason: fc.string() })
);

const scaleWithFullCoverageArb: fc.Arbitrary<GradeScale> = fc.constant({
    id: 'scale',
    name: 'Full Coverage Scale',
    type: 'letter' as const,
    ranges: [{ min: 0, max: 100, label: 'P', color: '#000' }],
});

describe('applyModifier — property tests', () => {
    it('output is always within [0, 100] regardless of input score and modifier magnitude', () => {
        fc.assert(
            fc.property(finiteFloat(-500, 500), modifierArb, (score, modifier) => {
                const result = applyModifier(score, modifier);
                return Number.isFinite(result) && result >= 0 && result <= 100;
            }),
            { numRuns: 500 }
        );
    });

    it('without a modifier, output equals input (no clamping applied)', () => {
        fc.assert(
            fc.property(finiteFloat(0, 100), (score) => {
                return applyModifier(score) === score;
            }),
            { numRuns: 200 }
        );
    });
});

describe('calcEntryPoints — property tests', () => {
    it('result is always ≥ 0 for any valid level selection', () => {
        fc.assert(
            fc.property(singleLevelCriterionArb, entryForL1Arb, (criterion, entry) => {
                const result = calcEntryPoints(entry, criterion);
                return Number.isFinite(result) && result >= 0;
            }),
            { numRuns: 500 }
        );
    });

    it('result never exceeds the level maxPoints', () => {
        fc.assert(
            fc.property(singleLevelCriterionArb, entryForL1Arb, (criterion, entry) => {
                const maxPoints = criterion.levels[0].maxPoints;
                const result = calcEntryPoints(entry, criterion);
                return result <= maxPoints + Number.EPSILON;
            }),
            { numRuns: 500 }
        );
    });

    it('overridePoints always takes precedence over level selection', () => {
        fc.assert(
            fc.property(singleLevelCriterionArb, finiteFloat(0, 200), (criterion, override) => {
                const entry: ScoreEntry = {
                    criterionId: 'c1',
                    levelId: 'l1',
                    checkedSubItems: [],
                    comment: '',
                    overridePoints: override,
                };
                return calcEntryPoints(entry, criterion) === override;
            }),
            { numRuns: 300 }
        );
    });

    it('returns 0 when no levelId is set and no overridePoints', () => {
        fc.assert(
            fc.property(singleLevelCriterionArb, (criterion) => {
                const entry: ScoreEntry = { criterionId: 'c1', levelId: null, checkedSubItems: [], comment: '' };
                return calcEntryPoints(entry, criterion) === 0;
            }),
            { numRuns: 200 }
        );
    });
});

const weightedItemArb = fc.record({
    maxPts: finiteFloat(1, 50),
    selectedPts: finiteFloat(0, 50),
    weight: finiteFloat(0.1, 100),
});

describe('calcWeightedScore — property tests', () => {
    it('returns a value in [0, 100] when earned points are within each level maxPoints', () => {
        fc.assert(
            fc.property(fc.array(weightedItemArb, { minLength: 1, maxLength: 10 }), (items) => {
                const criteria: RubricCriterion[] = items.map((item, i) => ({
                    id: `c${i}`,
                    title: '',
                    description: '',
                    weight: item.weight,
                    levels: [
                        { id: 'l1', label: '', minPoints: 0, maxPoints: item.maxPts, description: '', subItems: [] },
                    ],
                }));
                const entries: ScoreEntry[] = items.map((item, i) => ({
                    criterionId: `c${i}`,
                    levelId: 'l1',
                    checkedSubItems: [],
                    comment: '',
                    selectedPoints: Math.min(item.selectedPts, item.maxPts),
                }));
                const result = calcWeightedScore(entries, criteria);
                return Number.isFinite(result) && result >= 0 && result <= 100 + Number.EPSILON;
            }),
            { numRuns: 300 }
        );
    });
});

describe('calcLetterGrade — property tests', () => {
    it('always returns a non-empty string when the scale covers the full [0, 100] range', () => {
        fc.assert(
            fc.property(finiteFloat(0, 100), scaleWithFullCoverageArb, (score, scale) => {
                const result = calcLetterGrade(score, scale);
                return typeof result === 'string' && result.length > 0;
            }),
            { numRuns: 500 }
        );
    });

    it('never throws for any finite score, even outside [0, 100]', () => {
        fc.assert(
            fc.property(finiteFloat(-200, 200), scaleWithFullCoverageArb, (score, scale) => {
                try {
                    calcLetterGrade(score, scale);
                    return true;
                } catch {
                    return false;
                }
            }),
            { numRuns: 300 }
        );
    });
});

describe('calcGradeColor — property tests', () => {
    it('always returns a non-empty string for any score within the scale', () => {
        fc.assert(
            fc.property(finiteFloat(0, 100), scaleWithFullCoverageArb, (score, scale) => {
                const result = calcGradeColor(score, scale);
                return typeof result === 'string' && result.length > 0;
            }),
            { numRuns: 300 }
        );
    });
});
