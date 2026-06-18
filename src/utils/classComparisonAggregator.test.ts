import { describe, it, expect } from 'vitest';
import { compareClasses, buildMultiClassTrend, getInsights } from './classComparisonAggregator';
import type { Rubric, StudentRubric, Student, Class, RubricCriterion } from '../types';

// ─── Builders ─────────────────────────────────────────────────────────────────

function mkCriterion(id: string, title: string, maxPts = 10): RubricCriterion {
    return {
        id,
        title,
        description: '',
        weight: 100,
        // Single level spanning full range — calcEntryPoints returns selectedPoints directly (no clamping)
        levels: [{ id: `${id}_lvl`, label: 'Level', minPoints: 0, maxPoints: maxPts, description: '', subItems: [] }],
    };
}

function mkRubric(id: string, criteria: RubricCriterion[], createdAt = '2024-01-01'): Rubric {
    return {
        id,
        name: `Rubric ${id}`,
        subject: 'Test',
        description: '',
        gradeScaleId: 'none',
        format: {} as never,
        attachmentIds: [],
        createdAt,
        updatedAt: createdAt,
        totalMaxPoints: 0,
        scoringMode: 'weighted-percentage',
        criteria,
    };
}

function mkSR(id: string, rubricId: string, studentId: string, scores: Record<string, number>): StudentRubric {
    return {
        id,
        rubricId,
        studentId,
        overallComment: '',
        isPeerReview: false,
        entries: Object.entries(scores).map(([criterionId, selectedPoints]) => ({
            criterionId,
            levelId: `${criterionId}_lvl`,
            selectedPoints,
            checkedSubItems: [],
            comment: '',
        })),
    };
}

function mkStudent(id: string, classId: string): Student {
    return { id, name: `Student ${id}`, classId };
}

function mkClass(id: string, name: string, extra?: Partial<Class>): Class {
    return { id, name, ...extra };
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const c1 = mkCriterion('c1', 'Writing', 10);
const c2 = mkCriterion('c2', 'Grammar', 10);
const rubric = mkRubric('r1', [c1, c2]);

const students = [
    mkStudent('s1', 'cls1'),
    mkStudent('s2', 'cls1'),
    mkStudent('s3', 'cls1'),
    mkStudent('s4', 'cls2'),
    mkStudent('s5', 'cls2'),
];
const classes = [mkClass('cls1', 'Class A'), mkClass('cls2', 'Class B')];

// ─── compareClasses ───────────────────────────────────────────────────────────

describe('compareClasses', () => {
    it('returns one result per class that has graded students', () => {
        const srs = [mkSR('a', 'r1', 's1', { c1: 8, c2: 6 }), mkSR('b', 'r1', 's4', { c1: 9, c2: 9 })];
        const results = compareClasses(['cls1', 'cls2'], 'r1', srs, students, classes, rubric, null);
        expect(results).toHaveLength(2);
        expect(results.find((r) => r.classId === 'cls1')?.studentCount).toBe(1);
        expect(results.find((r) => r.classId === 'cls2')?.studentCount).toBe(1);
    });

    it('filters out classes with no graded students', () => {
        const srs = [mkSR('a', 'r1', 's1', { c1: 8, c2: 6 })];
        const results = compareClasses(['cls1', 'cls2'], 'r1', srs, students, classes, rubric, null);
        expect(results).toHaveLength(1);
        expect(results[0].classId).toBe('cls1');
    });

    it('ignores studentRubrics for other rubrics', () => {
        const srs = [mkSR('a', 'r1', 's1', { c1: 8, c2: 6 }), mkSR('b', 'r_other', 's2', { c1: 10, c2: 10 })];
        const results = compareClasses(['cls1'], 'r1', srs, students, classes, rubric, null);
        expect(results[0].studentCount).toBe(1);
    });

    it('ignores students from other classes', () => {
        // s4 is in cls2; grading it should not appear in cls1 result
        const srs = [mkSR('a', 'r1', 's1', { c1: 8, c2: 8 }), mkSR('b', 'r1', 's4', { c1: 2, c2: 2 })];
        const results = compareClasses(['cls1'], 'r1', srs, students, classes, rubric, null);
        expect(results[0].studentCount).toBe(1);
        expect(results[0].average).toBeCloseTo(80, 0);
    });

    it('computes correct weighted average across criteria', () => {
        // s1: c1=8/10=80%, c2=4/10=40% → 60%; s2: c1=6/10=60%, c2=8/10=80% → 70%
        // class avg = 65%
        const srs = [mkSR('a', 'r1', 's1', { c1: 8, c2: 4 }), mkSR('b', 'r1', 's2', { c1: 6, c2: 8 })];
        const results = compareClasses(['cls1'], 'r1', srs, students, classes, rubric, null);
        expect(results[0].average).toBeCloseTo(65, 0);
    });

    it('computes criterion averages independently per class', () => {
        const srs = [mkSR('a', 'r1', 's1', { c1: 10, c2: 2 }), mkSR('b', 'r1', 's2', { c1: 10, c2: 2 })];
        const results = compareClasses(['cls1'], 'r1', srs, students, classes, rubric, null);
        expect(results[0].criterionAvgs['c1']).toBeCloseTo(100, 0);
        expect(results[0].criterionAvgs['c2']).toBeCloseTo(20, 0);
    });

    it('criterion avg is 0 when no entries exist for that criterion', () => {
        const srs = [
            {
                ...mkSR('a', 'r1', 's1', {}),
                entries: [
                    { criterionId: 'c1', levelId: 'c1_lvl', selectedPoints: 8, checkedSubItems: [], comment: '' },
                ],
            },
        ];
        const results = compareClasses(['cls1'], 'r1', srs, students, classes, rubric, null);
        expect(results[0].criterionAvgs['c2']).toBe(0);
    });

    it('median differs from average with skewed distribution', () => {
        // Three at 80%, one at 20% → sorted: 20, 80, 80, 80 → median=80, avg=65
        const s = [mkStudent('a', 'x'), mkStudent('b', 'x'), mkStudent('c', 'x'), mkStudent('d', 'x')];
        const cls = [mkClass('x', 'X')];
        const srs = [
            mkSR('1', 'r1', 'a', { c1: 8, c2: 8 }),
            mkSR('2', 'r1', 'b', { c1: 8, c2: 8 }),
            mkSR('3', 'r1', 'c', { c1: 8, c2: 8 }),
            mkSR('4', 'r1', 'd', { c1: 2, c2: 2 }),
        ];
        const results = compareClasses(['x'], 'r1', srs, s, cls, rubric, null);
        expect(results[0].median).toBeCloseTo(80, 0);
        expect(results[0].average).toBeCloseTo(65, 0);
    });

    it('highest and lowest reflect the correct extreme scores', () => {
        const srs = [
            mkSR('a', 'r1', 's1', { c1: 10, c2: 10 }), // 100%
            mkSR('b', 'r1', 's2', { c1: 1, c2: 1 }), //  10%
            mkSR('c', 'r1', 's3', { c1: 6, c2: 6 }), //  60%
        ];
        const results = compareClasses(['cls1'], 'r1', srs, students, classes, rubric, null);
        expect(results[0].highest).toBeCloseTo(100, 0);
        expect(results[0].lowest).toBeCloseTo(10, 0);
    });

    it('carries className from classes array', () => {
        const srs = [mkSR('a', 'r1', 's1', { c1: 5, c2: 5 })];
        const results = compareClasses(['cls1'], 'r1', srs, students, classes, rubric, null);
        expect(results[0].className).toBe('Class A');
    });

    it('falls back to classId as className when class not found', () => {
        const srs = [mkSR('a', 'r1', 's1', { c1: 5, c2: 5 })];
        const results = compareClasses(['cls1'], 'r1', srs, students, [], rubric, null);
        expect(results[0].className).toBe('cls1');
    });

    it('single-student class: average = median = highest = lowest', () => {
        const srs = [mkSR('a', 'r1', 's4', { c1: 7, c2: 7 })];
        const results = compareClasses(['cls2'], 'r1', srs, students, classes, rubric, null);
        const r = results[0];
        expect(r.average).toBeCloseTo(r.median, 1);
        expect(r.highest).toBeCloseTo(r.lowest, 1);
    });
});

// ─── buildMultiClassTrend ─────────────────────────────────────────────────────

describe('buildMultiClassTrend', () => {
    it('returns points sorted by rubric createdAt ascending', () => {
        const rubrics = [mkRubric('r2', [c1, c2], '2024-03-01'), mkRubric('r1', [c1, c2], '2024-01-01')];
        const srs = [mkSR('a', 'r1', 's1', { c1: 6, c2: 6 }), mkSR('b', 'r2', 's1', { c1: 8, c2: 8 })];
        const trend = buildMultiClassTrend(['cls1'], classes, srs, students, rubrics, []);
        expect(trend[0].rubricName).toBe('Rubric r1');
        expect(trend[1].rubricName).toBe('Rubric r2');
    });

    it('keys avg values by classId', () => {
        const rubrics = [mkRubric('r1', [c1, c2])];
        const srs = [mkSR('a', 'r1', 's1', { c1: 8, c2: 8 }), mkSR('b', 'r1', 's4', { c1: 4, c2: 4 })];
        const trend = buildMultiClassTrend(['cls1', 'cls2'], classes, srs, students, rubrics, []);
        expect(typeof trend[0]['cls1']).toBe('number');
        expect(typeof trend[0]['cls2']).toBe('number');
    });

    it('omits classId key when class has no data for that rubric', () => {
        const rubrics = [mkRubric('r1', [c1, c2])];
        const srs = [mkSR('a', 'r1', 's1', { c1: 8, c2: 8 })]; // only cls1 student graded
        const trend = buildMultiClassTrend(['cls1', 'cls2'], classes, srs, students, rubrics, []);
        expect(trend[0]['cls1']).toBeDefined();
        expect(trend[0]['cls2']).toBeUndefined();
    });

    it('averages multiple students per class per rubric', () => {
        const rubrics = [mkRubric('r1', [c1, c2])];
        const srs = [
            mkSR('a', 'r1', 's1', { c1: 10, c2: 10 }), // 100%
            mkSR('b', 'r1', 's2', { c1: 0, c2: 0 }), //   0%
        ];
        const trend = buildMultiClassTrend(['cls1'], classes, srs, students, rubrics, []);
        expect(trend[0]['cls1']).toBeCloseTo(50, 0);
    });

    it('filters out rubrics with no data in any selected class', () => {
        const rubrics = [
            mkRubric('r1', [c1, c2], '2024-01-01'), // has data
            mkRubric('r_empty', [c1, c2], '2024-02-01'), // no data
        ];
        const srs = [mkSR('a', 'r1', 's1', { c1: 6, c2: 6 })];
        const trend = buildMultiClassTrend(['cls1'], classes, srs, students, rubrics, []);
        expect(trend).toHaveLength(1);
        expect(trend[0].rubricName).toBe('Rubric r1');
    });

    it('returns empty array when no classIds provided', () => {
        const rubrics = [mkRubric('r1', [c1, c2])];
        expect(buildMultiClassTrend([], classes, [], students, rubrics, [])).toHaveLength(0);
    });

    it('carries class name metadata keyed by __name_<classId>', () => {
        const rubrics = [mkRubric('r1', [c1, c2])];
        const srs = [mkSR('a', 'r1', 's1', { c1: 5, c2: 5 })];
        const trend = buildMultiClassTrend(['cls1'], classes, srs, students, rubrics, []);
        expect(trend[0]['__name_cls1']).toBe('Class A');
    });
});

// ─── getInsights ──────────────────────────────────────────────────────────────

describe('getInsights', () => {
    const good = (id: string, name: string, avg: number, cAvgs: Record<string, number>) => ({
        classId: id,
        className: name,
        average: avg,
        median: avg,
        highest: avg + 5,
        lowest: avg - 5,
        studentCount: 10,
        criterionAvgs: cAvgs,
    });

    it('flags struggling class when avg < 55', () => {
        const results = [good('a', 'Low Class', 40, { c1: 40, c2: 40 })];
        expect(getInsights(results, [c1, c2]).some((i) => i.kind === 'struggling')).toBe(true);
    });

    it('does not flag struggling when avg >= 55', () => {
        const results = [good('a', 'OK Class', 70, { c1: 70, c2: 70 })];
        expect(getInsights(results, [c1, c2]).some((i) => i.kind === 'struggling')).toBe(false);
    });

    it('struggling insight names the class', () => {
        const results = [good('a', 'Year 3 VMBO', 40, { c1: 40, c2: 40 })];
        const insight = getInsights(results, [c1, c2]).find((i) => i.kind === 'struggling');
        expect(insight?.messageKey).toBe('statistics.insights.struggling');
        expect(insight?.messageParams.className).toBe('Year 3 VMBO');
    });

    it('flags weak criterion when criterion gap >= 15 pp below class avg', () => {
        // avg=70, c2=50 → gap=20 ≥ 15 → flag
        const results = [good('a', 'Test', 70, { c1: 70, c2: 50 })];
        const insights = getInsights(results, [c1, c2]);
        expect(insights.some((i) => i.kind === 'weak_criterion' && i.messageParams.criterion === 'Grammar')).toBe(true);
    });

    it('does not flag weak criterion when gap < 15 pp', () => {
        // avg=70, c2=60 → gap=10 < 15 → no flag
        const results = [good('a', 'Test', 70, { c1: 70, c2: 60 })];
        expect(getInsights(results, [c1, c2]).some((i) => i.kind === 'weak_criterion')).toBe(false);
    });

    it('flags weak criterion at exactly 15 pp gap', () => {
        const results = [good('a', 'Test', 70, { c1: 70, c2: 55 })];
        expect(getInsights(results, [c1, c2]).some((i) => i.kind === 'weak_criterion')).toBe(true);
    });

    it('weak criterion insight names the criterion and class', () => {
        const results = [good('a', 'Class X', 70, { c1: 70, c2: 50 })];
        const insight = getInsights(results, [c1, c2]).find((i) => i.kind === 'weak_criterion');
        expect(insight?.messageKey).toBe('statistics.insights.weak_criterion');
        expect(insight?.messageParams.criterion).toBe('Grammar');
        expect(insight?.messageParams.className).toBe('Class X');
    });

    it('flags divergence when inter-class criterion gap >= 20 pp', () => {
        // c1 gap: 90 - 65 = 25 ≥ 20 → flag
        const results = [good('a', 'High', 80, { c1: 90, c2: 80 }), good('b', 'Low', 50, { c1: 65, c2: 55 })];
        expect(getInsights(results, [c1, c2]).some((i) => i.kind === 'divergence')).toBe(true);
    });

    it('does not flag divergence when max gap < 20 pp', () => {
        // max gap c1: 75-60=15 < 20 → no flag
        const results = [good('a', 'A', 70, { c1: 75, c2: 70 }), good('b', 'B', 65, { c1: 60, c2: 65 })];
        expect(getInsights(results, [c1, c2]).some((i) => i.kind === 'divergence')).toBe(false);
    });

    it('flags divergence at exactly 20 pp', () => {
        // c1: 80 - 60 = 20 → flag
        const results = [good('a', 'A', 70, { c1: 80, c2: 70 }), good('b', 'B', 60, { c1: 60, c2: 65 })];
        expect(getInsights(results, [c1, c2]).some((i) => i.kind === 'divergence')).toBe(true);
    });

    it('divergence insight names both classes and the criterion', () => {
        const results = [good('a', 'Alpha', 80, { c1: 90, c2: 80 }), good('b', 'Beta', 50, { c1: 60, c2: 55 })];
        const insight = getInsights(results, [c1, c2]).find((i) => i.kind === 'divergence');
        expect(insight?.messageKey).toBe('statistics.insights.divergence');
        expect(insight?.messageParams.highClass).toBe('Alpha');
        expect(insight?.messageParams.lowClass).toBe('Beta');
    });

    it('does not flag divergence with only one class', () => {
        const results = [good('a', 'Solo', 80, { c1: 80, c2: 80 })];
        expect(getInsights(results, [c1, c2]).some((i) => i.kind === 'divergence')).toBe(false);
    });

    it('returns empty when all classes perform well without gaps', () => {
        const results = [good('a', 'A', 80, { c1: 80, c2: 75 }), good('b', 'B', 78, { c1: 72, c2: 76 })];
        expect(getInsights(results, [c1, c2])).toHaveLength(0);
    });

    it('can return multiple insights simultaneously', () => {
        // struggling (avg 40<55), weak c2 (gap 25), divergence (c1: 90 vs 40 = 50pp)
        const results = [good('a', 'Weak A', 40, { c1: 40, c2: 15 }), good('b', 'Strong B', 80, { c1: 90, c2: 75 })];
        expect(getInsights(results, [c1, c2]).length).toBeGreaterThanOrEqual(3);
    });

    it('does not flag struggling or weak_criterion for class with studentCount 0', () => {
        const results = [
            {
                classId: 'empty',
                className: 'Empty',
                average: 0,
                median: 0,
                highest: 0,
                lowest: 0,
                studentCount: 0,
                criterionAvgs: {},
            },
            good('b', 'Full', 80, { c1: 80, c2: 80 }),
        ];
        const insights = getInsights(results, [c1, c2]);
        expect(insights.filter((i) => i.kind === 'struggling').some((i) => i.messageParams.className === 'Empty')).toBe(
            false
        );
        expect(
            insights.filter((i) => i.kind === 'weak_criterion').some((i) => i.messageParams.className === 'Empty')
        ).toBe(false);
    });

    it('produces exactly one divergence insight (worst-case criterion only)', () => {
        const results = [good('a', 'A', 80, { c1: 90, c2: 90 }), good('b', 'B', 50, { c1: 60, c2: 60 })];
        // c1 and c2 both have 30pp gap; only one divergence insight should be emitted
        expect(getInsights(results, [c1, c2]).filter((i) => i.kind === 'divergence')).toHaveLength(1);
    });
});

// ─── Stress tests ─────────────────────────────────────────────────────────────

describe('stress test — large dataset', () => {
    const CRITERIA = Array.from({ length: 8 }, (_, i) => mkCriterion(`cr${i}`, `Criterion ${i}`, 10));
    const RUBRICS = Array.from({ length: 6 }, (_, i) => mkRubric(`rb${i}`, CRITERIA, `2024-0${i + 1}-15`));
    const CLASSES: Class[] = [
        { id: 'ca', name: 'Alpha', voTrack: 'havo', year: '3' },
        { id: 'cb', name: 'Beta', voTrack: 'vwo', year: '3' },
        { id: 'cc', name: 'Gamma', voTrack: 'vmbo-tl', year: '2' },
        { id: 'cd', name: 'Delta', voTrack: 'havo', year: '4' },
    ];
    const STUDENTS = CLASSES.flatMap((cls) =>
        Array.from({ length: 40 }, (_, i) => mkStudent(`${cls.id}_s${i}`, cls.id))
    );
    // Each student gets a different score pattern (10%–100% rotating) to create natural variance
    const STUDENT_RUBRICS = RUBRICS.flatMap((rb) =>
        STUDENTS.map((s, idx) => {
            const pct = ((idx % 10) + 1) / 10;
            const scores = Object.fromEntries(CRITERIA.map((c) => [c.id, pct * 10]));
            return mkSR(`sr_${rb.id}_${s.id}`, rb.id, s.id, scores);
        })
    );

    it('handles 160 students × 4 classes without throwing', () => {
        expect(() =>
            compareClasses(['ca', 'cb', 'cc', 'cd'], 'rb0', STUDENT_RUBRICS, STUDENTS, CLASSES, RUBRICS[0], null)
        ).not.toThrow();
    });

    it('returns 4 results with correct studentCount (40 each)', () => {
        const results = compareClasses(
            ['ca', 'cb', 'cc', 'cd'],
            'rb0',
            STUDENT_RUBRICS,
            STUDENTS,
            CLASSES,
            RUBRICS[0],
            null
        );
        expect(results).toHaveLength(4);
        results.forEach((r) => expect(r.studentCount).toBe(40));
    });

    it('all averages are between 0 and 100', () => {
        const results = compareClasses(
            ['ca', 'cb', 'cc', 'cd'],
            'rb0',
            STUDENT_RUBRICS,
            STUDENTS,
            CLASSES,
            RUBRICS[0],
            null
        );
        results.forEach((r) => {
            expect(r.average).toBeGreaterThanOrEqual(0);
            expect(r.average).toBeLessThanOrEqual(100);
        });
    });

    it('all classes get all 8 criterion avg keys', () => {
        const results = compareClasses(['ca', 'cb'], 'rb0', STUDENT_RUBRICS, STUDENTS, CLASSES, RUBRICS[0], null);
        results.forEach((r) => {
            expect(Object.keys(r.criterionAvgs)).toHaveLength(8);
        });
    });

    it('trend over 6 rubrics returns 6 sorted points for two classes', () => {
        const trend = buildMultiClassTrend(['ca', 'cb'], CLASSES, STUDENT_RUBRICS, STUDENTS, RUBRICS, []);
        expect(trend).toHaveLength(6);
        const dates = trend.map((p) => p.date as string);
        expect(dates).toEqual([...dates].sort());
        trend.forEach((pt) => {
            expect(typeof pt['ca']).toBe('number');
            expect(typeof pt['cb']).toBe('number');
        });
    });

    it('getInsights runs without error on 4-class result', () => {
        const results = compareClasses(
            ['ca', 'cb', 'cc', 'cd'],
            'rb0',
            STUDENT_RUBRICS,
            STUDENTS,
            CLASSES,
            RUBRICS[0],
            null
        );
        expect(() => getInsights(results, CRITERIA)).not.toThrow();
    });

    it('all classes with identical scores produce no divergence insight', () => {
        // Every student gets exactly 5/10 on every criterion → identical class distributions
        const uniformSRs = RUBRICS.slice(0, 1).flatMap((rb) =>
            STUDENTS.map((s) =>
                mkSR(`u_${rb.id}_${s.id}`, rb.id, s.id, Object.fromEntries(CRITERIA.map((c) => [c.id, 5])))
            )
        );
        const results = compareClasses(
            ['ca', 'cb', 'cc', 'cd'],
            'rb0',
            uniformSRs,
            STUDENTS,
            CLASSES,
            RUBRICS[0],
            null
        );
        const insights = getInsights(results, CRITERIA);
        expect(insights.some((i) => i.kind === 'divergence')).toBe(false);
    });
});
