import { describe, it, expect } from 'vitest';
import {
    DEFAULT_WRITING_TREND_CONFIG,
    getClassWeakWritingCriteria,
    getWeakWritingCriteria,
    getWritingCriterionTrends,
} from './writingTrendAggregator';
import type { EssayAssignment, Rubric, RubricCriterion, StudentRubric } from '../types';

// ─── Builders ─────────────────────────────────────────────────────────────────

function mkCriterion(id: string, title: string): RubricCriterion {
    return {
        id,
        title,
        description: '',
        weight: 50,
        levels: [{ id: `${id}_lvl`, label: 'Level', minPoints: 0, maxPoints: 10, description: '', subItems: [] }],
    };
}

function mkRubric(id: string, criteria: RubricCriterion[]): Rubric {
    return {
        id,
        name: `Rubric ${id}`,
        subject: 'English',
        description: '',
        gradeScaleId: 'none',
        format: {} as never,
        attachmentIds: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        totalMaxPoints: 0,
        scoringMode: 'weighted-percentage',
        criteria,
    };
}

function mkAssignment(rubricId: string, studentId: string): EssayAssignment {
    return {
        rubricId,
        studentId,
        teacherKey: 't',
        title: 'Essay',
        readOnlyAfterSubmit: false,
        createdAt: '2024-01-01',
    };
}

function mkSR(
    id: string,
    rubricId: string,
    studentId: string,
    scores: Record<string, number>,
    gradedAt: string,
    extra?: Partial<StudentRubric>
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
        ...extra,
    };
}

// One rubric per essay, all with the same criterion names — like copies of a template rubric.
const rubrics = [1, 2, 3, 4].map((n) =>
    mkRubric(`r${n}`, [mkCriterion(`org${n}`, 'Organisation'), mkCriterion(`gram${n}`, 'Grammar')])
);
const assignmentsFor = (studentId: string) => rubrics.map((r) => mkAssignment(r.id, studentId));

function essays(studentId: string, org: number[], gram: number[], extra?: Partial<StudentRubric>): StudentRubric[] {
    return org.map((o, i) =>
        mkSR(
            `${studentId}-${i + 1}`,
            `r${i + 1}`,
            studentId,
            { [`org${i + 1}`]: o, [`gram${i + 1}`]: gram[i] },
            `2024-0${i + 1}-01`,
            extra
        )
    );
}

describe('getWritingCriterionTrends', () => {
    it('follows a criterion by name across rubric copies, oldest first', () => {
        const trends = getWritingCriterionTrends(
            's1',
            essays('s1', [4, 5, 6], [8, 8, 8]),
            rubrics,
            assignmentsFor('s1')
        );
        const org = trends.find((t) => t.criterionKey === 'organisation')!;
        expect(org.points.map((p) => p.score)).toEqual([40, 50, 60]);
        expect(org.latest).toBe(60);
        expect(org.previous).toBe(50);
        expect(org.average).toBeCloseTo(50);
        expect(org.slope).toBeCloseTo(10);
        expect(org.direction).toBe('improving');
    });

    it('classifies flat and declining trends', () => {
        const trends = getWritingCriterionTrends(
            's1',
            essays('s1', [8, 6, 4], [7, 7, 7]),
            rubrics,
            assignmentsFor('s1')
        );
        expect(trends.find((t) => t.criterionKey === 'organisation')!.direction).toBe('declining');
        expect(trends.find((t) => t.criterionKey === 'grammar')!.direction).toBe('flat');
    });

    it('omits criteria with fewer graded essays than minPoints', () => {
        expect(getWritingCriterionTrends('s1', essays('s1', [4, 5], [8, 8]), rubrics, assignmentsFor('s1'))).toEqual(
            []
        );
    });

    it('ignores work that is not a graded, handed-in essay', () => {
        const base = essays('s1', [4, 5, 6], [8, 8, 8]);
        const noAssignment = getWritingCriterionTrends('s1', base, rubrics, []);
        expect(noAssignment).toEqual([]);

        const excluded = [
            { ...base[0], isPeerReview: true },
            { ...base[1], notHandedIn: true },
            { ...base[2], deletedAt: '2024-05-01' },
        ];
        expect(getWritingCriterionTrends('s1', excluded, rubrics, assignmentsFor('s1'))).toEqual([]);
        expect(
            getWritingCriterionTrends(
                's1',
                [{ ...base[0], gradedAt: undefined }, base[1], base[2]],
                rubrics,
                assignmentsFor('s1')
            )
        ).toEqual([]);
    });

    it('only reads the requested student and prefers the rubric snapshot', () => {
        const mine = essays('s1', [5, 5, 5], [5, 5, 5]);
        const other = essays('s2', [1, 1, 1], [1, 1, 1]);
        const snap = mine.map((sr, i) => ({ ...sr, rubricSnapshot: rubrics[i] }));
        const trends = getWritingCriterionTrends(
            's1',
            [...snap, ...other],
            [],
            [...assignmentsFor('s1'), ...assignmentsFor('s2')]
        );
        expect(trends).toHaveLength(2);
        expect(trends.every((t) => t.average === 50)).toBe(true);
    });

    it('skips criteria worth zero points', () => {
        const zero = mkRubric('rz', [
            {
                ...mkCriterion('z', 'Zero'),
                levels: [{ id: 'z_lvl', label: 'L', minPoints: 0, maxPoints: 0, description: '', subItems: [] }],
            },
        ]);
        const srs = [1, 2, 3].map((n) => mkSR(`z${n}`, 'rz', 's1', { z: 0 }, `2024-0${n}-01`));
        expect(getWritingCriterionTrends('s1', srs, [zero], [mkAssignment('rz', 's1')])).toEqual([]);
    });
});

describe('getWeakWritingCriteria', () => {
    it('flags persistent weakness and declining-below-threshold, weakest first', () => {
        const sr = essays('s1', [6, 5, 4], [3, 3, 3]);
        const weak = getWeakWritingCriteria('s1', sr, rubrics, assignmentsFor('s1'));
        expect(weak.map((t) => t.criterionKey)).toEqual(['grammar', 'organisation']);
        expect(weak[0].persistentWeak).toBe(true);
        expect(weak[1].direction).toBe('declining');
    });

    it('does not flag a strong or improving criterion', () => {
        expect(getWeakWritingCriteria('s1', essays('s1', [5, 6, 8], [9, 9, 9]), rubrics, assignmentsFor('s1'))).toEqual(
            []
        );
    });

    it('honours a custom config', () => {
        const sr = essays('s1', [7, 7, 7], [9, 9, 9]);
        const weak = getWeakWritingCriteria('s1', sr, rubrics, assignmentsFor('s1'), {
            ...DEFAULT_WRITING_TREND_CONFIG,
            lowScoreThreshold: 75,
        });
        expect(weak.map((t) => t.criterionKey)).toEqual(['organisation']);
    });
});

describe('getClassWeakWritingCriteria', () => {
    it('ranks criteria by how many students are persistently weak', () => {
        const srs = [
            ...essays('a', [3, 3, 3], [9, 9, 9]),
            ...essays('b', [4, 4, 4], [9, 9, 9]),
            ...essays('c', [9, 9, 9], [5, 4, 3]),
        ];
        const assignments = ['a', 'b', 'c'].flatMap(assignmentsFor);
        const result = getClassWeakWritingCriteria(['a', 'b', 'c'], srs, rubrics, assignments);
        expect(result.map((r) => r.criterionKey)).toEqual(['organisation', 'grammar']);
        expect(result[0].weakStudentIds).toEqual(['a', 'b']);
        expect(result[0].studentCount).toBe(3);
        expect(result[1].decliningStudentIds).toEqual(['c']);
    });

    it('does not count a decline that stays above the weak threshold', () => {
        const srs = essays('a', [10, 9, 8], [9, 9, 9]);
        expect(getClassWeakWritingCriteria(['a'], srs, rubrics, assignmentsFor('a'))).toEqual([]);
    });

    it('returns nothing when no criterion is weak or declining', () => {
        expect(
            getClassWeakWritingCriteria(['a'], essays('a', [9, 9, 9], [9, 9, 9]), rubrics, assignmentsFor('a'))
        ).toEqual([]);
    });
});
