import { describe, expect, it } from 'vitest';
import type { StudentTest, Test } from '../types';
import { alphaBand, calcTestQuality, cronbachAlpha, median, pearson, variance } from './testQualityMetrics';

function makeTest(points: number[]): Test {
    return {
        id: 't',
        name: 'T',
        questions: points.map((p, i) => ({ id: `q${i}`, prompt: `${i + 1}`, type: 'open', points: p })),
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: '2026-01-01',
    };
}

function sheet(test: Test, scores: (number | null)[][], extra: Partial<StudentTest>[] = []): StudentTest[] {
    return scores.map((row, i) => ({
        id: `st${i}`,
        testId: test.id,
        studentId: `s${i}`,
        status: 'graded',
        startedAt: '2026-01-01',
        answers: row.flatMap((v, j) => (v === null ? [] : [{ questionId: `q${j}`, response: '', pointsEarned: v }])),
        ...extra[i],
    }));
}

describe('statistics helpers', () => {
    it('computes sample variance, median and correlation', () => {
        expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(32 / 7);
        expect(variance([1])).toBeNull();
        expect(median([3, 1, 2])).toBe(2);
        expect(median([4, 1, 2, 3])).toBe(2.5);
        expect(median([])).toBeNull();
        expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
        expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
        expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
        expect(pearson([1], [1])).toBeNull();
    });

    it("computes Cronbach's α (KR-20 for 0/1 items)", () => {
        // Hand-computed: item variances 0.3, 0.3, 0.3, total variance 2.3 → α = 1.5·(1 − 0.9/2.3)
        const matrix = [
            [1, 1, 1],
            [1, 1, 0],
            [1, 0, 0],
            [0, 0, 0],
            [0, 1, 1],
        ];
        const itemVar = 0.3;
        const totals = [3, 2, 1, 0, 2];
        const totalVar = variance(totals)!;
        expect(cronbachAlpha(matrix)).toBeCloseTo(1.5 * (1 - (3 * itemVar) / totalVar));
        expect(cronbachAlpha([[1], [0]])).toBeNull();
        expect(
            cronbachAlpha([
                [1, 1],
                [1, 1],
            ])
        ).toBeNull();
    });

    it('bands α', () => {
        expect(alphaBand(null)).toBe('unknown');
        expect(alphaBand(0.5)).toBe('low');
        expect(alphaBand(0.7)).toBe('acceptable');
        expect(alphaBand(0.85)).toBe('good');
    });
});

describe('calcTestQuality', () => {
    const test = makeTest([2, 2, 4]);
    const scores = [
        [2, 2, 4],
        [2, 1, 3],
        [1, 2, 2],
        [1, 0, 1],
        [0, 1, 0],
        [0, 0, 1],
    ];

    it('summarises totals and per-item difficulty and correlations', () => {
        const report = calcTestQuality(test, sheet(test, scores));
        expect(report.summary.n).toBe(6);
        expect(report.summary.maxPoints).toBe(8);
        expect(report.summary.mean).toBeCloseTo(23 / 6);
        expect(report.summary.min).toBe(1);
        expect(report.summary.max).toBe(8);
        expect(report.summary.alpha).not.toBeNull();
        expect(report.summary.sem).toBeGreaterThan(0);
        const [q0, , q2] = report.items;
        expect(q0.pValue).toBeCloseTo(0.5);
        expect(q2.pValue).toBeCloseTo(11 / 24);
        const totals = scores.map((r) => r[0] + r[1] + r[2]);
        expect(q0.rit).toBeCloseTo(
            pearson(
                scores.map((r) => r[0]),
                totals
            )!
        );
        expect(q0.rir).toBeCloseTo(
            pearson(
                scores.map((r) => r[0]),
                scores.map((r) => r[1] + r[2])
            )!
        );
        expect(q0.alphaIfDeleted).not.toBeNull();
        expect(report.totals).toHaveLength(6);
    });

    it('leaves absent and incomplete students out of α but keeps their answered items in P', () => {
        const rows = [...scores, [2, null, 4], [0, 0, 0]];
        const extra: Partial<StudentTest>[] = [];
        extra[7] = { absent: true };
        const report = calcTestQuality(test, sheet(test, rows, extra));
        expect(report.summary.n).toBe(6);
        expect(report.items[0].sampleSize).toBe(7);
        expect(report.items[1].sampleSize).toBe(6);
    });

    it('keeps only the latest attempt per student', () => {
        const sts = sheet(test, [
            [0, 0, 0],
            [2, 2, 4],
        ]);
        sts[1] = { ...sts[1], studentId: 's0', attemptNumber: 2 };
        const report = calcTestQuality(test, sts);
        expect(report.totals).toEqual([{ studentId: 's0', points: 8 }]);
    });

    it('drops a student whose latest attempt is marked absent', () => {
        const sts = sheet(test, [[2, 2, 4], []]);
        sts[1] = { ...sts[1], studentId: 's0', attemptNumber: 2, absent: true };
        expect(calcTestQuality(test, sts).totals).toEqual([]);
    });

    it('returns nulls for tiny classes', () => {
        const report = calcTestQuality(test, sheet(test, scores.slice(0, 2)));
        expect(report.summary.alpha).toBeNull();
        expect(report.items[0].rit).toBeNull();
        expect(calcTestQuality(test, []).summary).toMatchObject({ n: 0, mean: null, min: null, sd: null });
    });

    it('flags easy, hard and non-discriminating items', () => {
        const flagged = makeTest([1, 1, 1, 1]);
        const rows = [
            [1, 0, 1, 0],
            [1, 0, 1, 1],
            [1, 0, 0, 1],
            [1, 0, 1, 0],
            [1, 1, 0, 1],
            [1, 0, 0, 0],
        ];
        const items = calcTestQuality(flagged, sheet(flagged, rows)).items;
        expect(items[0].flags).toContain('too_easy');
        expect(items[1].flags).toContain('too_hard');
        expect(items.some((i) => i.flags.includes('negative_rir') || i.flags.includes('weak_rir'))).toBe(true);
    });
});
