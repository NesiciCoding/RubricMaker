import { describe, it, expect } from 'vitest';
import {
    getLearningPathRecommendations,
    buildCohortAverages,
    getCriterionInterventionFlags,
    getCefrSkillInterventionFlags,
    DEFAULT_LEARNING_PATH_CONFIG,
} from './learningPathAggregator';
import type { CefrCellData } from './cefrStudentAggregator';
import type { Rubric, RubricCriterion, StudentRubric, LearningPathConfig } from '../types';

// ─── Builders ─────────────────────────────────────────────────────────────────

function mkCell(skill: CefrCellData['skill'], level: CefrCellData['level'], avgScore: number): CefrCellData {
    return {
        skill,
        level,
        rubricCount: 1,
        avgScore,
        threshold: 70,
        rubricAchieved: avgScore >= 70,
        totalDescriptors: 0,
        confidentCount: 0,
        confidenceRate: 0,
        state: avgScore >= 70 ? 'achieved' : 'developing',
        descriptors: [],
    };
}

function mkCriterion(id: string, maxPts = 10): RubricCriterion {
    return {
        id,
        title: `Criterion ${id}`,
        description: '',
        weight: 100,
        levels: [{ id: `${id}_lvl`, label: 'Level', minPoints: 0, maxPoints: maxPts, description: '', subItems: [] }],
    };
}

function mkRubric(id: string, criteria: RubricCriterion[], extra?: Partial<Rubric>): Rubric {
    return {
        id,
        name: `Rubric ${id}`,
        subject: 'Test',
        description: '',
        gradeScaleId: 'none',
        format: {} as never,
        attachmentIds: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        totalMaxPoints: 0,
        scoringMode: 'weighted-percentage',
        criteria,
        ...extra,
    };
}

function mkSR(
    id: string,
    rubricId: string,
    studentId: string,
    scores: Record<string, number>,
    gradedAt: string
): StudentRubric {
    return {
        id,
        rubricId,
        studentId,
        overallComment: '',
        isPeerReview: false,
        gradedAt,
        entries: Object.entries(scores).map(([criterionId, selectedPoints]) => ({
            criterionId,
            levelId: `${criterionId}_lvl`,
            selectedPoints,
            checkedSubItems: [],
            comment: '',
        })),
    };
}

// ─── getLearningPathRecommendations ───────────────────────────────────────────

describe('getLearningPathRecommendations', () => {
    it('returns no recommendations with no data', () => {
        expect(() => getLearningPathRecommendations('s1', [], new Map(), [], new Set())).not.toThrow();
        expect(getLearningPathRecommendations('s1', [], new Map(), [], new Set())).toHaveLength(0);
    });

    it('recommends nothing when student is at or above cohort average', () => {
        const cells = [mkCell('writing', 'B1', 80)];
        const cohort = new Map([['writing__B1', 75]]);
        expect(getLearningPathRecommendations('s1', cells, cohort, [], new Set())).toHaveLength(0);
    });

    it('recommends nothing when gap is below threshold (e.g. 10pp < 15pp default)', () => {
        const cells = [mkCell('writing', 'B1', 65)];
        const cohort = new Map([['writing__B1', 75]]);
        expect(getLearningPathRecommendations('s1', cells, cohort, [], new Set())).toHaveLength(0);
    });

    it('recommends when gap exceeds threshold (15pp default)', () => {
        const cells = [mkCell('writing', 'B1', 50)];
        const cohort = new Map([['writing__B1', 75]]); // gap = -25
        const recs = getLearningPathRecommendations('s1', cells, cohort, [], new Set());
        expect(recs).toHaveLength(1);
        expect(recs[0].gap).toBeCloseTo(-25, 0);
    });

    it('handles tied cohort averages (gap = 0, no recommendation)', () => {
        const cells = [mkCell('writing', 'B1', 75)];
        const cohort = new Map([['writing__B1', 75]]);
        expect(getLearningPathRecommendations('s1', cells, cohort, [], new Set())).toHaveLength(0);
    });

    it('skips cells with no cohort average available', () => {
        const cells = [mkCell('writing', 'B1', 30)];
        const cohort = new Map<string, number>(); // no data for writing__B1
        expect(getLearningPathRecommendations('s1', cells, cohort, [], new Set())).toHaveLength(0);
    });

    it('skips cells with zero rubricCount (no data yet for that cell)', () => {
        const cell = { ...mkCell('writing', 'B1', 0), rubricCount: 0 };
        const cohort = new Map([['writing__B1', 75]]);
        expect(getLearningPathRecommendations('s1', [cell], cohort, [], new Set())).toHaveLength(0);
    });

    it('suggests rubrics matching the skill/level, excluding already-achieved ones', () => {
        const cells = [mkCell('writing', 'B1', 40)];
        const cohort = new Map([['writing__B1', 80]]);
        const rubrics = [
            mkRubric('r1', [mkCriterion('c1')], { cefrSkill: 'writing', cefrTargetLevel: 'B1' }),
            mkRubric('r2', [mkCriterion('c1')], { cefrSkill: 'writing', cefrTargetLevel: 'B1' }),
            mkRubric('r3', [mkCriterion('c1')], { cefrSkill: 'reading', cefrTargetLevel: 'B1' }), // wrong skill
            mkRubric('r4', [mkCriterion('c1')], { cefrSkill: 'writing', cefrTargetLevel: 'B2' }), // wrong level
        ];
        const recs = getLearningPathRecommendations('s1', cells, cohort, rubrics, new Set(['r2']));
        expect(recs).toHaveLength(1);
        expect(recs[0].suggestedRubricIds).toEqual(['r1']);
    });

    it('sorts recommendations by largest gap first', () => {
        const cells = [mkCell('writing', 'B1', 50), mkCell('reading', 'B1', 30)];
        const cohort = new Map([
            ['writing__B1', 80], // gap -30
            ['reading__B1', 90], // gap -60
        ]);
        const recs = getLearningPathRecommendations('s1', cells, cohort, [], new Set());
        expect(recs).toHaveLength(2);
        expect(recs[0].skill).toBe('reading');
        expect(recs[1].skill).toBe('writing');
    });
});

// ─── buildCohortAverages ──────────────────────────────────────────────────────

describe('buildCohortAverages', () => {
    it('returns empty map with no data', () => {
        expect(buildCohortAverages([]).size).toBe(0);
    });

    it('averages a single skill/level across multiple students', () => {
        const allCells = [[mkCell('writing', 'B1', 60)], [mkCell('writing', 'B1', 80)]];
        const averages = buildCohortAverages(allCells);
        expect(averages.get('writing__B1')).toBeCloseTo(70, 0);
    });

    it('ignores cells with zero rubricCount', () => {
        const allCells = [[{ ...mkCell('writing', 'B1', 60), rubricCount: 0 }], [mkCell('writing', 'B1', 80)]];
        const averages = buildCohortAverages(allCells);
        expect(averages.get('writing__B1')).toBeCloseTo(80, 0);
    });

    it('produces tied averages when all students score identically', () => {
        const allCells = [[mkCell('writing', 'B1', 70)], [mkCell('writing', 'B1', 70)], [mkCell('writing', 'B1', 70)]];
        const averages = buildCohortAverages(allCells);
        expect(averages.get('writing__B1')).toBe(70);
    });
});

// ─── getCriterionInterventionFlags ────────────────────────────────────────────

describe('getCriterionInterventionFlags', () => {
    const c1 = mkCriterion('c1', 10);
    const rubric = mkRubric('r1', [c1]);

    it('returns no flags with no data', () => {
        expect(() => getCriterionInterventionFlags('s1', [], [])).not.toThrow();
        expect(getCriterionInterventionFlags('s1', [], [])).toHaveLength(0);
    });

    it('does not flag exactly N-1 (2) consecutive low scores', () => {
        // low = score <= 60%; using 2/10 = 20% (low) twice
        const srs = [mkSR('a', 'r1', 's1', { c1: 2 }, '2024-01-01'), mkSR('b', 'r1', 's1', { c1: 2 }, '2024-01-02')];
        const flags = getCriterionInterventionFlags('s1', srs, [rubric]);
        expect(flags).toHaveLength(0);
    });

    it('flags exactly N (3) consecutive low scores', () => {
        const srs = [
            mkSR('a', 'r1', 's1', { c1: 2 }, '2024-01-01'),
            mkSR('b', 'r1', 's1', { c1: 2 }, '2024-01-02'),
            mkSR('c', 'r1', 's1', { c1: 2 }, '2024-01-03'),
        ];
        const flags = getCriterionInterventionFlags('s1', srs, [rubric]);
        expect(flags).toHaveLength(1);
        expect(flags[0].streakLength).toBe(3);
        expect(flags[0].targetId).toBe('c1');
        expect(flags[0].kind).toBe('criterion');
    });

    it('a streak of N-1 lows broken by one good score then more lows does not produce a false flag', () => {
        // 2 lows, then a good score (9/10=90%), then 2 more lows → no single streak reaches 3
        const srs = [
            mkSR('a', 'r1', 's1', { c1: 2 }, '2024-01-01'),
            mkSR('b', 'r1', 's1', { c1: 2 }, '2024-01-02'),
            mkSR('c', 'r1', 's1', { c1: 9 }, '2024-01-03'),
            mkSR('d', 'r1', 's1', { c1: 2 }, '2024-01-04'),
            mkSR('e', 'r1', 's1', { c1: 2 }, '2024-01-05'),
        ];
        const flags = getCriterionInterventionFlags('s1', srs, [rubric]);
        expect(flags).toHaveLength(0);
    });

    it('flags a streak longer than the threshold with the correct length', () => {
        const srs = [
            mkSR('a', 'r1', 's1', { c1: 1 }, '2024-01-01'),
            mkSR('b', 'r1', 's1', { c1: 1 }, '2024-01-02'),
            mkSR('c', 'r1', 's1', { c1: 1 }, '2024-01-03'),
            mkSR('d', 'r1', 's1', { c1: 1 }, '2024-01-04'),
        ];
        const flags = getCriterionInterventionFlags('s1', srs, [rubric]);
        expect(flags).toHaveLength(1);
        expect(flags[0].streakLength).toBe(4);
    });

    it('respects a custom consecutiveLowThreshold config', () => {
        const config: LearningPathConfig = { ...DEFAULT_LEARNING_PATH_CONFIG, consecutiveLowThreshold: 2 };
        const srs = [mkSR('a', 'r1', 's1', { c1: 2 }, '2024-01-01'), mkSR('b', 'r1', 's1', { c1: 2 }, '2024-01-02')];
        const flags = getCriterionInterventionFlags('s1', srs, [rubric], config);
        expect(flags).toHaveLength(1);
    });

    it('ignores other students entries', () => {
        const srs = [
            mkSR('a', 'r1', 's2', { c1: 1 }, '2024-01-01'),
            mkSR('b', 'r1', 's2', { c1: 1 }, '2024-01-02'),
            mkSR('c', 'r1', 's2', { c1: 1 }, '2024-01-03'),
        ];
        const flags = getCriterionInterventionFlags('s1', srs, [rubric]);
        expect(flags).toHaveLength(0);
    });

    it('ignores ungraded submissions (no gradedAt)', () => {
        const srs = [
            { ...mkSR('a', 'r1', 's1', { c1: 1 }, '2024-01-01'), gradedAt: undefined },
            { ...mkSR('b', 'r1', 's1', { c1: 1 }, '2024-01-02'), gradedAt: undefined },
            { ...mkSR('c', 'r1', 's1', { c1: 1 }, '2024-01-03'), gradedAt: undefined },
        ];
        const flags = getCriterionInterventionFlags('s1', srs, [rubric]);
        expect(flags).toHaveLength(0);
    });

    it('sorts by gradedAt rather than array order', () => {
        const srs = [
            mkSR('c', 'r1', 's1', { c1: 1 }, '2024-01-03'),
            mkSR('a', 'r1', 's1', { c1: 1 }, '2024-01-01'),
            mkSR('b', 'r1', 's1', { c1: 1 }, '2024-01-02'),
        ];
        const flags = getCriterionInterventionFlags('s1', srs, [rubric]);
        expect(flags).toHaveLength(1);
        expect(flags[0].triggeredAt).toBe('2024-01-03');
    });
});

// ─── getCefrSkillInterventionFlags ────────────────────────────────────────────

describe('getCefrSkillInterventionFlags', () => {
    const c1 = mkCriterion('c1', 10);
    const rubric = mkRubric('r1', [c1], { cefrSkill: 'speaking_production', cefrTargetLevel: 'B1' });

    it('returns no flags with no data', () => {
        expect(getCefrSkillInterventionFlags('s1', [], [])).toHaveLength(0);
    });

    it('ignores rubrics without a cefrTargetLevel', () => {
        const plainRubric = mkRubric('r2', [c1]);
        const srs = [
            mkSR('a', 'r2', 's1', { c1: 1 }, '2024-01-01'),
            mkSR('b', 'r2', 's1', { c1: 1 }, '2024-01-02'),
            mkSR('c', 'r2', 's1', { c1: 1 }, '2024-01-03'),
        ];
        expect(getCefrSkillInterventionFlags('s1', srs, [plainRubric])).toHaveLength(0);
    });

    it('does not flag N-1 consecutive lows', () => {
        const srs = [mkSR('a', 'r1', 's1', { c1: 2 }, '2024-01-01'), mkSR('b', 'r1', 's1', { c1: 2 }, '2024-01-02')];
        expect(getCefrSkillInterventionFlags('s1', srs, [rubric])).toHaveLength(0);
    });

    it('flags exactly N consecutive lows on the same CEFR skill', () => {
        const srs = [
            mkSR('a', 'r1', 's1', { c1: 2 }, '2024-01-01'),
            mkSR('b', 'r1', 's1', { c1: 2 }, '2024-01-02'),
            mkSR('c', 'r1', 's1', { c1: 2 }, '2024-01-03'),
        ];
        const flags = getCefrSkillInterventionFlags('s1', srs, [rubric]);
        expect(flags).toHaveLength(1);
        expect(flags[0].kind).toBe('cefrSkill');
        expect(flags[0].targetId).toBe('speaking_production');
    });

    it('a broken streak (low, low, good, low, low) produces no flag', () => {
        const srs = [
            mkSR('a', 'r1', 's1', { c1: 2 }, '2024-01-01'),
            mkSR('b', 'r1', 's1', { c1: 2 }, '2024-01-02'),
            mkSR('c', 'r1', 's1', { c1: 9 }, '2024-01-03'),
            mkSR('d', 'r1', 's1', { c1: 2 }, '2024-01-04'),
            mkSR('e', 'r1', 's1', { c1: 2 }, '2024-01-05'),
        ];
        expect(getCefrSkillInterventionFlags('s1', srs, [rubric])).toHaveLength(0);
    });

    it('defaults skill to writing when rubric.cefrSkill is unset', () => {
        const noSkillRubric = mkRubric('r3', [c1], { cefrTargetLevel: 'B1' });
        const srs = [
            mkSR('a', 'r3', 's1', { c1: 2 }, '2024-01-01'),
            mkSR('b', 'r3', 's1', { c1: 2 }, '2024-01-02'),
            mkSR('c', 'r3', 's1', { c1: 2 }, '2024-01-03'),
        ];
        const flags = getCefrSkillInterventionFlags('s1', srs, [noSkillRubric]);
        expect(flags[0].targetId).toBe('writing');
    });
});

// ─── Stress test ──────────────────────────────────────────────────────────────

describe('stress test — large dataset', () => {
    it('handles many students and submissions without throwing', () => {
        const c1 = mkCriterion('c1', 10);
        const rubric = mkRubric('r1', [c1], { cefrSkill: 'writing', cefrTargetLevel: 'B1' });
        const srs: StudentRubric[] = [];
        for (let s = 0; s < 50; s++) {
            for (let g = 0; g < 10; g++) {
                srs.push(
                    mkSR(
                        `sr_${s}_${g}`,
                        'r1',
                        `s${s}`,
                        { c1: (g % 10) + 1 },
                        `2024-01-${String(g + 1).padStart(2, '0')}`
                    )
                );
            }
        }
        expect(() => getCriterionInterventionFlags('s0', srs, [rubric])).not.toThrow();
        expect(() => getCefrSkillInterventionFlags('s0', srs, [rubric])).not.toThrow();
    });
});
