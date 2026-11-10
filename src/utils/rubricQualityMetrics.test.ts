import { describe, it, expect } from 'vitest';
import { calcRubricQuality } from './rubricQualityMetrics';
import { MIN_STUDENTS_FOR_CORRELATION } from './testQualityMetrics';
import type { Class, Rubric, RubricCriterion, Student, StudentRubric } from '../types';

const criteria: RubricCriterion[] = [1, 2, 3].map((n) => ({
    id: `c${n}`,
    title: `Criterion ${n}`,
    description: '',
    weight: 1,
    subItemMode: 'points',
    levels: [{ id: `c${n}-level`, label: 'scored', minPoints: 0, maxPoints: 4, description: '', subItems: [] }],
}));

const rubric = { id: 'r1', name: 'Rubric', criteria } as Rubric;

function grade(studentId: string, scores: (number | null)[], extra: Partial<StudentRubric> = {}): StudentRubric {
    return {
        id: `sr-${studentId}`,
        rubricId: 'r1',
        studentId,
        entries: criteria.map((c, i) => ({
            criterionId: c.id,
            levelId: scores[i] === null ? null : `${c.id}-level`,
            selectedPoints: scores[i] ?? undefined,
            checkedSubItems: [],
            comment: '',
        })),
        overallComment: '',
        isPeerReview: false,
        ...extra,
    } as StudentRubric;
}

const students: Student[] = [1, 2, 3, 4, 5, 6].map(
    (n) => ({ id: `s${n}`, name: `Student ${n}`, classId: n <= 3 ? 'class-a' : 'class-b' }) as Student
);
const classes = [
    { id: 'class-a', name: 'A' },
    { id: 'class-b', name: 'B' },
] as Class[];

const grades = [
    grade('s1', [4, 4, 4]),
    grade('s2', [3, 3, 3]),
    grade('s3', [2, 2, 1]),
    grade('s4', [1, 1, 0]),
    grade('s5', [3, 2, 2]),
    grade('s6', [2, 1, 1]),
];

describe('calcRubricQuality', () => {
    it('treats each criterion as an item over the complete grades', () => {
        const report = calcRubricQuality(rubric, grades, students, classes);
        expect(report.summary.n).toBe(6);
        expect(report.summary.maxPoints).toBe(12);
        expect(report.items.map((i) => i.itemId)).toEqual(['c1', 'c2', 'c3']);
        // Mean earned points per criterion, as a share of its own maximum.
        expect(report.items[0].pValue).toBeCloseTo((4 + 3 + 2 + 1 + 3 + 2) / 6 / 4, 5);
        // Totals 12, 9, 5, 2, 7, 4.
        expect(report.summary.mean).toBeCloseTo(6.5, 5);
    });

    it('computes α and the item-rest correlations once there are enough grades', () => {
        const report = calcRubricQuality(rubric, grades, students, classes);
        expect(report.summary.n).toBeGreaterThanOrEqual(MIN_STUDENTS_FOR_CORRELATION);
        expect(report.summary.alpha).not.toBeNull();
        expect(report.summary.alpha!).toBeGreaterThan(0);
        expect(report.items[0].rit!).toBeGreaterThan(0);
        expect(report.summary.sem).not.toBeNull();
    });

    it('leaves out ungraded and partially graded submissions', () => {
        const report = calcRubricQuality(rubric, [...grades, grade('s7', [4, null, 4])], students, classes);
        expect(report.summary.n).toBe(6);
    });

    it('counts a group submission once', () => {
        const grouped = [grade('s1', [4, 4, 4], { groupId: 'g1' }), grade('s2', [4, 4, 4], { groupId: 'g1' })];
        const report = calcRubricQuality(rubric, grouped, students, classes);
        expect(report.summary.n).toBe(1);
        expect(report.groupedRows).toBe(1);
    });

    it('skips peer reviews, soft-deleted grades and work not handed in', () => {
        const filtered = [
            ...grades,
            grade('s7', [4, 4, 4], { isPeerReview: true }),
            grade('s8', [4, 4, 4], { deletedAt: '2026-01-01T00:00:00Z' }),
            grade('s9', [4, 4, 4], { notHandedIn: true }),
        ];
        expect(calcRubricQuality(rubric, filtered, students, classes).summary.n).toBe(6);
    });

    it('scopes to one class', () => {
        const report = calcRubricQuality(rubric, grades, students, classes, { classId: 'class-a' });
        expect(report.summary.n).toBe(3);
    });

    it('never mixes tiers of a tiered rubric', () => {
        const tiered = {
            ...rubric,
            tiered: {
                tiers: [
                    { id: 't1', year: 'jaar-1' },
                    { id: 't2', year: 'jaar-2' },
                ],
                bands: [
                    { id: 'b1', code: 'IO', label: '', points: 0 },
                    { id: 'b2', code: 'B', label: '', points: 1 },
                ],
            },
        } as Rubric;
        const mixed = [
            grade('s1', [4, 4, 4], { tierId: 't1' }),
            grade('s2', [3, 3, 3], { tierId: 't1' }),
            grade('s3', [1, 1, 1], { tierId: 't2' }),
            grade('s4', [0, 0, 0], { tierId: 't2' }),
        ];
        const report = calcRubricQuality(tiered, mixed, students, classes, { tierId: 't2' });
        expect(report.tierId).toBe('t2');
        expect(report.summary.n).toBe(2);
        expect(report.tiers.map((t) => t.id)).toEqual(expect.arrayContaining(['t1', 't2']));
        expect(calcRubricQuality(tiered, mixed, students, classes).tierId).toBe('t1');
    });
});
