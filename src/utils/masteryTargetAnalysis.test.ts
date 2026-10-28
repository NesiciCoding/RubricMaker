import { describe, it, expect } from 'vitest';
import {
    compareLevelToTarget,
    comparePercentageToTarget,
    findCefrSkillTarget,
    findGrammarTarget,
    findStandardTarget,
    getCefrSkillTargetProgress,
    grammarMasteryBreakdown,
    grammarMasteryPercentage,
    targetMatchesYearTrack,
    withGrammarTargets,
} from './masteryTargetAnalysis';
import type { GrammarItemMastery } from './masteryProfileAggregator';
import type { CefrCellData } from './cefrStudentAggregator';
import type { GrammarMasteryTarget, MasteryTarget, StandardMasteryTarget } from '../types';

const standardTarget: StandardMasteryTarget = {
    id: 'mt-standard',
    standardGuid: 'st-1',
    standardDescription: 'Cite textual evidence',
    standardSetTitle: 'ELA Standards',
    year: 'jaar-2',
    voTrack: 'havo',
    targetPercentage: 80,
};

const grammarTarget: GrammarMasteryTarget = {
    id: 'mt-grammar',
    scope: 'grammar',
    grammarItemId: 'gr-present-simple-affirmative',
    grammarItemLabel: 'Affirmative (I work, she works)',
    grammarCategoryLabel: 'Present Simple',
    year: 'jaar-2',
    voTrack: 'havo',
    targetPercentage: 75,
};

const cefrTarget: MasteryTarget = {
    id: 'mt-cefr',
    scope: 'cefr',
    cefrSkill: 'writing',
    targetLevel: 'b1-plus',
    year: 'jaar-2',
    voTrack: 'havo',
};

const allTargets: MasteryTarget[] = [standardTarget, grammarTarget, cefrTarget];

function grammarRow(overrides: Partial<GrammarItemMastery> = {}): GrammarItemMastery {
    return {
        itemId: 'gr-present-simple-affirmative',
        level: 'A1',
        labelEn: 'Affirmative (I work, she works)',
        labelNl: 'Bevestigend (I work, she works)',
        categoryId: 'present-simple',
        categoryLabelEn: 'Present Simple',
        categoryLabelNl: 'Tegenwoordige tijd',
        test: null,
        flashcards: null,
        writing: null,
        ...overrides,
    };
}

function cefrCell(skill: CefrCellData['skill'], level: CefrCellData['level'], rubricAchieved: boolean): CefrCellData {
    return {
        skill,
        level,
        rubricCount: 1,
        avgScore: rubricAchieved ? 85 : 55,
        threshold: 70,
        rubricAchieved,
        evidence: [],
        totalDescriptors: 0,
        confidentCount: 0,
        confidenceRate: 0,
        state: rubricAchieved ? 'achieved' : 'developing',
        descriptors: [],
    };
}

describe('targetMatchesYearTrack', () => {
    it('matches only the exact year and track cell', () => {
        expect(targetMatchesYearTrack(standardTarget, 'jaar-2', 'havo')).toBe(true);
        expect(targetMatchesYearTrack(standardTarget, 'jaar-2', 'vwo')).toBe(false);
        expect(targetMatchesYearTrack(standardTarget, 'jaar-3', 'havo')).toBe(false);
    });

    it('requires a year and treats an unset track as the primary-school cell', () => {
        const primary: StandardMasteryTarget = { ...standardTarget, year: 'groep-8', voTrack: undefined };
        expect(targetMatchesYearTrack(primary, 'groep-8', undefined)).toBe(true);
        expect(targetMatchesYearTrack(primary, 'groep-8', 'havo')).toBe(false);
        expect(targetMatchesYearTrack(primary, undefined, undefined)).toBe(false);
    });
});

describe('scoped target lookup', () => {
    it('finds a legacy standard row (no scope) and ignores other scopes', () => {
        expect(findStandardTarget(allTargets, 'st-1', 'jaar-2', 'havo')).toBe(standardTarget);
        expect(findStandardTarget(allTargets, 'gr-present-simple-affirmative', 'jaar-2', 'havo')).toBeUndefined();
        expect(findStandardTarget(allTargets, 'st-1', 'jaar-2', 'vwo')).toBeUndefined();
    });

    it('finds grammar targets only for a grammar item at the exact cell', () => {
        expect(findGrammarTarget(allTargets, 'gr-present-simple-affirmative', 'jaar-2', 'havo')).toBe(grammarTarget);
        expect(findGrammarTarget(allTargets, 'gr-present-simple-affirmative', 'jaar-1', 'havo')).toBeUndefined();
        expect(findGrammarTarget(allTargets, 'st-1', 'jaar-2', 'havo')).toBeUndefined();
    });

    it('finds CEFR skill targets only for the matching skill', () => {
        expect(findCefrSkillTarget(allTargets, 'writing', 'jaar-2', 'havo')).toBe(cefrTarget);
        expect(findCefrSkillTarget(allTargets, 'reading', 'jaar-2', 'havo')).toBeUndefined();
    });

    it('returns undefined without targets', () => {
        expect(findStandardTarget(undefined, 'st-1', 'jaar-2', 'havo')).toBeUndefined();
        expect(findGrammarTarget(undefined, 'gr-present-simple-affirmative', 'jaar-2', 'havo')).toBeUndefined();
        expect(findCefrSkillTarget(undefined, 'writing', 'jaar-2', 'havo')).toBeUndefined();
    });
});

describe('grammarMasteryBreakdown', () => {
    it('blends every available stream with its weight', () => {
        const breakdown = grammarMasteryBreakdown(
            grammarRow({
                writing: { instances: 2, avgPct: 90 },
                test: { attempts: 4, correctAttempts: 3, accuracyPct: 60 },
                flashcards: {
                    cardCount: 2,
                    newCount: 0,
                    learningCount: 0,
                    reviewCount: 0,
                    masteredCount: 1,
                    dueCount: 0,
                },
            })
        );
        expect(breakdown.pct).toBeCloseTo(71.5, 5);
        expect(breakdown.writingPct).toBe(90);
        expect(breakdown.testPct).toBe(60);
        expect(breakdown.flashcardPct).toBe(50);
        expect(breakdown.weightTotal).toBeCloseTo(1, 5);
    });

    it('renormalises over the available streams instead of penalising missing evidence', () => {
        const writingOnly = grammarMasteryPercentage(grammarRow({ writing: { instances: 1, avgPct: 90 } }));
        expect(writingOnly).toBe(90);
        const testOnly = grammarMasteryPercentage(
            grammarRow({ test: { attempts: 2, correctAttempts: 2, accuracyPct: 100 } })
        );
        expect(testOnly).toBe(100);
    });

    it('returns null when no stream has usable data', () => {
        expect(grammarMasteryPercentage(grammarRow())).toBeNull();
        expect(
            grammarMasteryPercentage(
                grammarRow({
                    test: { attempts: 0, correctAttempts: 0, accuracyPct: 0 },
                    writing: { instances: 0, avgPct: 0 },
                    flashcards: {
                        cardCount: 0,
                        newCount: 0,
                        learningCount: 0,
                        reviewCount: 0,
                        masteredCount: 0,
                        dueCount: 0,
                    },
                })
            )
        ).toBeNull();
    });
});

describe('comparePercentageToTarget', () => {
    it('rounds to one decimal before comparing so float noise does not flip the status', () => {
        expect(comparePercentageToTarget(80, 80)).toBe('on-track');
        expect(comparePercentageToTarget(80.04, 80)).toBe('on-track');
        expect(comparePercentageToTarget(79.96, 80)).toBe('on-track');
        expect(comparePercentageToTarget(80.1, 80)).toBe('ahead');
        expect(comparePercentageToTarget(79.9, 80)).toBe('behind');
    });
});

describe('withGrammarTargets', () => {
    it('attaches the matching target and its status', () => {
        const [entry] = withGrammarTargets(
            [grammarRow({ writing: { instances: 1, avgPct: 81 } })],
            allTargets,
            'jaar-2',
            'havo'
        );
        expect(entry.targetPercentage).toBe(75);
        expect(entry.masteryPct).toBe(81);
        expect(entry.status).toBe('ahead');
    });

    it('leaves status undefined when no target exists for the cell', () => {
        const [entry] = withGrammarTargets(
            [grammarRow({ writing: { instances: 1, avgPct: 81 } })],
            allTargets,
            'jaar-1',
            'havo'
        );
        expect(entry.targetPercentage).toBeUndefined();
        expect(entry.status).toBeUndefined();
        expect(entry.masteryPct).toBe(81);
    });

    it("reports 'no-data' when a target exists but the item has no evidence", () => {
        const [entry] = withGrammarTargets([grammarRow()], allTargets, 'jaar-2', 'havo');
        expect(entry.targetPercentage).toBe(75);
        expect(entry.masteryPct).toBeNull();
        expect(entry.status).toBe('no-data');
    });
});

describe('compareLevelToTarget', () => {
    it('compares the coarse achieved level to the fine-grained target', () => {
        expect(compareLevelToTarget('B1', 'b1')).toBe('on-track');
        expect(compareLevelToTarget('B1', 'b1-plus')).toBe('on-track');
        expect(compareLevelToTarget('B1', 'b1-minus')).toBe('ahead');
        expect(compareLevelToTarget('A2', 'b1')).toBe('behind');
        expect(compareLevelToTarget('B2', 'c1-minus')).toBe('behind');
        expect(compareLevelToTarget('B2', 'b1-plus')).toBe('ahead');
    });

    it('has no status without an achieved level', () => {
        expect(compareLevelToTarget(null, 'b1')).toBe('no-data');
    });
});

describe('getCefrSkillTargetProgress', () => {
    const cells = [cefrCell('writing', 'B1', true), cefrCell('reading', 'A2', true), cefrCell('reading', 'A1', true)];

    it('uses a configured per-skill target over the curriculum range', () => {
        const rows = getCefrSkillTargetProgress(cells, allTargets, 'jaar-2', 'havo');
        const writing = rows.find((r) => r.skill === 'writing')!;
        expect(writing.configured).toBe(true);
        expect(writing.targetLevel).toBe('b1-plus');
        expect(writing.achievedLevel).toBe('B1');
        expect(writing.status).toBe('on-track');
        expect(writing.expectedRange).toBeUndefined();
    });

    it('falls back to the curriculum range for unconfigured skills', () => {
        const rows = getCefrSkillTargetProgress(cells, allTargets, 'jaar-2', 'havo');
        const reading = rows.find((r) => r.skill === 'reading')!;
        expect(reading.configured).toBe(false);
        expect(reading.expectedRange).toEqual({ min: 'b1-minus', max: 'b1-minus' });
        expect(reading.achievedLevel).toBe('A2');
        expect(reading.status).toBe('behind');
    });

    it('prefers a cohort-calibrated expectation over the curriculum band', () => {
        const rows = getCefrSkillTargetProgress(cells, allTargets, 'jaar-2', 'havo', {
            expectations: [
                {
                    skill: 'reading',
                    source: 'calibrated',
                    expectedRange: { min: 'a1', max: 'a1' },
                    standardRange: { min: 'b1-minus', max: 'b1-minus' },
                    studentCount: 12,
                    agreement: 1,
                    shift: -1,
                },
            ],
        });
        const reading = rows.find((r) => r.skill === 'reading')!;
        expect(reading.configured).toBe(false);
        expect(reading.calibrated).toBe(true);
        expect(reading.expectedRange).toEqual({ min: 'a1', max: 'a1' });
        expect(reading.standardRange).toEqual({ min: 'b1-minus', max: 'b1-minus' });
        expect(reading.achievedLevel).toBe('A2');
        expect(reading.status).toBe('ahead');

        // A skill without a calibrated expectation keeps the curriculum band.
        const listening = rows.find((r) => r.skill === 'listening')!;
        expect(listening.calibrated).toBe(false);
        expect(listening.standardRange).toBeUndefined();
        expect(listening.expectedRange).toEqual({ min: 'b1-minus', max: 'b1-minus' });
    });

    it('lets a teacher-configured target win over a calibrated expectation', () => {
        const rows = getCefrSkillTargetProgress(cells, allTargets, 'jaar-2', 'havo', {
            expectations: [
                {
                    skill: 'writing',
                    source: 'calibrated',
                    expectedRange: { min: 'c1', max: 'c1' },
                    standardRange: { min: 'b1-minus', max: 'b1-minus' },
                    studentCount: 15,
                    agreement: 0.9,
                    shift: 1,
                },
            ],
        });
        const writing = rows.find((r) => r.skill === 'writing')!;
        expect(writing.configured).toBe(true);
        expect(writing.calibrated).toBe(false);
        expect(writing.targetLevel).toBe('b1-plus');
        expect(writing.expectedRange).toBeUndefined();
    });

    it('reports no-data without a year or without achievement data', () => {
        const noYear = getCefrSkillTargetProgress(cells, allTargets, undefined, undefined);
        expect(noYear.every((r) => r.configured === false && r.status === 'no-data')).toBe(true);

        const empty = getCefrSkillTargetProgress([], [], 'jaar-2', 'havo');
        const listening = empty.find((r) => r.skill === 'listening')!;
        expect(listening.achievedLevel).toBeNull();
        expect(listening.status).toBe('no-data');
    });
});
