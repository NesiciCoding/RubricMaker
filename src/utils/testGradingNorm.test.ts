import { describe, expect, it } from 'vitest';
import type { Test, TestNormTier } from '../types';
import {
    buildNormPreview,
    caesuraGrade,
    defaultNorm,
    labelDistribution,
    labelPassed,
    labelRank,
    normTierLabel,
    ntermGrade,
    parseGradeCell,
    resolveNormTier,
    resolveTestGrade,
    resolveTestScale,
    tableGrade,
    tierLabels,
    withLabelPassDefaults,
} from './testGradingNorm';

const scale = {
    id: 's',
    name: 'Letters',
    type: 'letter' as const,
    ranges: [
        { min: 0, max: 54, label: 'F', color: '#f00' },
        { min: 55, max: 100, label: 'P', color: '#0f0' },
    ],
};

describe('ntermGrade', () => {
    it('is 9·S/L + N in the middle for N = 1', () => {
        expect(ntermGrade(20, 40, 1)).toBeCloseTo(5.5);
        expect(ntermGrade(0, 40, 1)).toBe(1);
        expect(ntermGrade(40, 40, 1)).toBe(10);
    });

    it('caps a high N near both ends (CvTE rules for N > 1)', () => {
        expect(ntermGrade(0, 40, 2)).toBe(1);
        expect(ntermGrade(40, 40, 2)).toBe(10);
        expect(ntermGrade(4, 40, 2)).toBeCloseTo(1 + 4 * (9 / 40) * 2);
        expect(ntermGrade(20, 40, 2)).toBeCloseTo(6.5);
        expect(ntermGrade(38, 40, 2)).toBeCloseTo(10 - 2 * (9 / 40) * 0.5);
    });

    it('lifts a low N near both ends (CvTE rules for N < 1)', () => {
        expect(ntermGrade(0, 40, 0.5)).toBe(1);
        expect(ntermGrade(40, 40, 0.5)).toBe(10);
        expect(ntermGrade(4, 40, 0.5)).toBeCloseTo(1 + 4 * (9 / 40) * 0.5);
        expect(ntermGrade(20, 40, 0.5)).toBeCloseTo(5);
        expect(ntermGrade(39, 40, 0.5)).toBeCloseTo(10 - 1 * (9 / 40) * 2);
    });

    it('treats an empty test as a 1', () => {
        expect(ntermGrade(3, 0, 1)).toBe(1);
    });
});

describe('caesuraGrade', () => {
    it('passes exactly at the pass mark and is linear on both sides', () => {
        expect(caesuraGrade(0, 30, 20, 5.5)).toBe(1);
        expect(caesuraGrade(20, 30, 20, 5.5)).toBe(5.5);
        expect(caesuraGrade(10, 30, 20, 5.5)).toBeCloseTo(3.25);
        expect(caesuraGrade(25, 30, 20, 5.5)).toBeCloseTo(7.75);
        expect(caesuraGrade(30, 30, 20, 5.5)).toBe(10);
    });

    it('handles a pass mark at either end', () => {
        expect(caesuraGrade(30, 30, 30, 5.5)).toBe(5.5);
        expect(caesuraGrade(0, 30, 0, 5.5)).toBe(5.5);
        expect(caesuraGrade(30, 30, 0, 5.5)).toBe(10);
        expect(caesuraGrade(5, 0, 3, 5.5)).toBe(1);
    });
});

describe('table norms', () => {
    const havo: TestNormTier = { id: 'h', year: 'jaar-2', track: 'havo' };
    const mavo: TestNormTier = { id: 'm', year: 'jaar-2', track: 'vmbo-tl' };
    const jaar3: TestNormTier = { id: 'j3', year: 'jaar-3' };
    const rows = [
        { minPoints: 0, grades: { h: 1, m: 1, j3: 1 } },
        { minPoints: 10, grades: { h: 5, m: 6, j3: 4 } },
        { minPoints: 20, grades: { h: 10, m: 10, j3: 10 } },
    ];

    it('looks up the highest row at or below the score', () => {
        expect(tableGrade(rows, 'h', 15)).toBe(5);
        expect(tableGrade(rows, 'm', 15)).toBe(6);
        expect(tableGrade(rows, 'h', 20)).toBe(10);
        expect(tableGrade([{ minPoints: 5, grades: { h: 3 } }], 'h', 2)).toBeNull();
    });

    it('resolves year + track first, then year only, then the catch-all column', () => {
        const tiers = [havo, mavo, jaar3, { id: 'all' }];
        expect(resolveNormTier(tiers, { voTrack: 'havo' }, { year: 'jaar-2' })?.id).toBe('h');
        expect(resolveNormTier(tiers, {}, { year: 'jaar-2', voTrack: 'vmbo-tl' })?.id).toBe('m');
        expect(resolveNormTier(tiers, { schoolYear: 'jaar-3' }, { year: 'jaar-2', voTrack: 'havo' })?.id).toBe('j3');
        expect(resolveNormTier(tiers, {}, { year: 'jaar-1' })?.id).toBe('all');
        expect(resolveNormTier([havo, mavo], {}, undefined)).toBeUndefined();
        expect(resolveNormTier([{ id: 'vwo', track: 'vwo' }], { voTrack: 'vwo' })?.id).toBe('vwo');
    });

    it('always resolves a single catch-all column', () => {
        expect(resolveNormTier([{ id: 'only' }])?.id).toBe('only');
    });

    it('returns every column when the student cannot be placed', () => {
        const test: Pick<Test, 'gradingNorm'> = { gradingNorm: { type: 'table', tiers: [havo, mavo], rows } };
        const result = resolveTestGrade(test, { points: 12, maxPoints: 20, percentage: 60, scale: null });
        expect(result.numeric).toBeNull();
        expect(result.alternatives).toEqual([
            { tier: havo, grade: 5 },
            { tier: mavo, grade: 6 },
        ]);
    });

    it('grades from the resolved column', () => {
        const test: Pick<Test, 'gradingNorm'> = { gradingNorm: { type: 'table', tiers: [havo, mavo], rows } };
        const result = resolveTestGrade(test, {
            points: 12,
            maxPoints: 20,
            percentage: 60,
            scale: null,
            student: { voTrack: 'vmbo-tl' },
            cls: { year: 'jaar-2' },
        });
        expect(result).toMatchObject({ numeric: 6, label: '6.0', passed: true, tier: mavo });
    });

    it('shows a dash when the column has no row for the score', () => {
        const test: Pick<Test, 'gradingNorm'> = {
            gradingNorm: { type: 'table', tiers: [{ id: 'x' }], rows: [{ minPoints: 5, grades: { x: 4 } }] },
        };
        expect(resolveTestGrade(test, { points: 1, maxPoints: 10, percentage: 10, scale: null }).label).toBe('—');
    });

    it('labels columns', () => {
        expect(normTierLabel(havo, 'All')).toBe('Jaar 2 · HAVO');
        expect(normTierLabel(jaar3, 'All')).toBe('Jaar 3');
        expect(normTierLabel({ id: 'a' }, 'All')).toBe('All');
        expect(normTierLabel({ id: 'a', track: 'vwo' }, 'All')).toBe('VWO');
        expect(normTierLabel({ id: 'a', label: ' Mavo ' }, 'All')).toBe('Mavo');
    });
});

describe('resolveTestGrade', () => {
    it('uses the grade scale by default', () => {
        expect(resolveTestGrade({}, { points: 6, maxPoints: 10, percentage: 60, scale })).toMatchObject({
            label: 'P',
            numeric: null,
            color: '#0f0',
        });
        expect(resolveTestGrade({}, { points: 6, maxPoints: 10, percentage: 60, scale: null }).label).toBe('—');
    });

    it('rounds numeric grades and judges them against the pass grade', () => {
        const test: Pick<Test, 'gradingNorm' | 'gradeDecimals' | 'passGrade'> = {
            gradingNorm: { type: 'nterm', n: 1 },
            gradeDecimals: 0,
            passGrade: 6,
        };
        const result = resolveTestGrade(test, { points: 20, maxPoints: 40, percentage: 50, scale });
        expect(result).toMatchObject({ numeric: 6, label: '6', passed: true });
        const caesura = resolveTestGrade(
            { gradingNorm: { type: 'caesura', passPoints: 30 } },
            { points: 10, maxPoints: 40, percentage: 25, scale }
        );
        expect(caesura).toMatchObject({ numeric: 2.5, passed: false });
    });
});

describe('resolveTestScale', () => {
    it("follows the test's scale, the default, and 'none'", () => {
        const other = { ...scale, id: 'o' };
        expect(resolveTestScale({ gradeScaleId: 'o' }, [scale, other], 's')).toBe(other);
        expect(resolveTestScale({}, [scale, other], 'o')).toBe(other);
        expect(resolveTestScale({}, [scale], 'missing')).toBe(scale);
        expect(resolveTestScale({ gradeScaleId: 'none' }, [scale], 's')).toBeNull();
        expect(resolveTestScale({}, [], undefined)).toBeNull();
    });
});

describe('buildNormPreview', () => {
    it('lists every whole point plus a fractional maximum', () => {
        const preview = buildNormPreview({ gradingNorm: { type: 'nterm', n: 1 } }, 2.5);
        expect(preview.map((r) => r.points)).toEqual([0, 1, 2, 2.5]);
        expect(preview[3].grades).toEqual([10]);
    });

    it('has one grade per column for tables and nothing for scales', () => {
        const norm = defaultNorm('table', 10);
        const preview = buildNormPreview({ gradingNorm: norm }, 10);
        expect(preview[10].grades).toEqual([10]);
        expect(preview[0].grades).toEqual([1]);
        expect(buildNormPreview({}, 10)).toEqual([]);
        expect(buildNormPreview({ gradingNorm: defaultNorm('caesura', 20) }, 20)[11].grades).toEqual([5.5]);
        expect(
            buildNormPreview(
                { gradingNorm: { type: 'table', tiers: [{ id: 'x' }], rows: [{ minPoints: 3, grades: { x: 4 } }] } },
                3
            )[0].grades
        ).toEqual([null]);
    });

    it('creates sensible defaults', () => {
        expect(defaultNorm('nterm', 10)).toEqual({ type: 'nterm', n: 1 });
        expect(defaultNorm('caesura', 20)).toEqual({ type: 'caesura', passPoints: 11 });
        expect(defaultNorm('scale', 20)).toEqual({ type: 'scale' });
    });
});

describe('label grades', () => {
    const lower: TestNormTier = { id: 'j1', year: 'jaar-1', passFrom: 'B' };
    const upper: TestNormTier = { id: 'j3', year: 'jaar-3' };
    const rows = [
        { minPoints: 0, grades: { j1: 'IO', j3: 1 } },
        { minPoints: 10, grades: { j1: 'B', j3: 5.5 } },
        { minPoints: 16, grades: { j1: 'E', j3: 8 } },
    ];
    const test: Pick<Test, 'gradingNorm'> = { gradingNorm: { type: 'table', tiers: [lower, upper], rows } };
    const ctx = (points: number, year: 'jaar-1' | 'jaar-3') => ({
        points,
        maxPoints: 20,
        percentage: points * 5,
        scale: null,
        cls: { year },
    });

    it('parses cells as numbers or labels', () => {
        expect(parseGradeCell('6,5')).toBe(6.5);
        expect(parseGradeCell(' 7 ')).toBe(7);
        expect(parseGradeCell('7.')).toBe(7);
        expect(parseGradeCell('.5')).toBe(0.5);
        expect(parseGradeCell(',5')).toBe(0.5);
        expect(parseGradeCell(' IO ')).toBe('IO');
        expect(parseGradeCell('')).toBeNull();
        expect(parseGradeCell('a very long label text')).toBe('a very long ');
    });

    it('orders labels by the points they start at', () => {
        expect(tierLabels(rows, 'j1')).toEqual(['IO', 'B', 'E']);
        expect(tierLabels(rows, 'j3')).toEqual([]);
        expect(labelRank(rows, 'j1', 'E')).toBe(16);
        expect(labelRank(rows, 'j1', 'X')).toBeNull();
    });

    it('grades lower years with labels judged against the pass-from label', () => {
        expect(resolveTestGrade(test, ctx(12, 'jaar-1'))).toMatchObject({ label: 'B', numeric: null, passed: true });
        expect(resolveTestGrade(test, ctx(17, 'jaar-1'))).toMatchObject({ label: 'E', passed: true });
        expect(resolveTestGrade(test, ctx(3, 'jaar-1'))).toMatchObject({ label: 'IO', passed: false });
        expect(resolveTestGrade(test, ctx(12, 'jaar-3'))).toMatchObject({ label: '5.5', numeric: 5.5, passed: true });
    });

    it('leaves labels unjudged without a pass mark', () => {
        const noPass = { gradingNorm: { type: 'table' as const, tiers: [{ ...lower, passFrom: '' }], rows } };
        expect(resolveTestGrade(noPass, ctx(12, 'jaar-1'))).toMatchObject({ label: 'B', passed: null });
        expect(labelPassed(rows, { id: 'j1', passFrom: 'Z' }, 'B')).toBeNull();
    });

    it('shows labels among unresolved alternatives and in the preview', () => {
        const result = resolveTestGrade(test, { points: 12, maxPoints: 20, percentage: 60, scale: null });
        expect(result.alternatives?.map((a) => a.grade)).toEqual(['B', 5.5]);
        expect(buildNormPreview(test, 20)[16].grades).toEqual(['E', 8]);
    });

    it('defaults the pass-from label to the second label and keeps an explicit none', () => {
        const [fresh] = withLabelPassDefaults([{ id: 'j1' }], rows);
        expect(fresh.passFrom).toBe('B');
        expect(withLabelPassDefaults([{ id: 'j1', passFrom: '' }], rows)[0].passFrom).toBe('');
        expect(withLabelPassDefaults([{ id: 'j1', passFrom: 'Gone' }], rows)[0].passFrom).toBe('B');
        expect(
            withLabelPassDefaults([{ id: 'j1', passFrom: 'Gone' }], [{ minPoints: 0, grades: { j1: 'IO' } }])[0]
                .passFrom
        ).toBeUndefined();
        expect(withLabelPassDefaults([{ id: 'j3' }], rows)[0].passFrom).toBeUndefined();
    });

    it('counts labels for the analysis, lowest first', () => {
        const results = [17, 12, 3, 13].map((p) => resolveTestGrade(test, ctx(p, 'jaar-1')));
        results.push(resolveTestGrade(test, ctx(12, 'jaar-3')));
        expect(labelDistribution(test, results)).toEqual([
            { label: 'IO', count: 1, passed: false },
            { label: 'B', count: 2, passed: true },
            { label: 'E', count: 1, passed: true },
        ]);
        expect(labelDistribution({}, results)).toEqual([]);
    });

    it('keeps a label apart when it passes in one column and fails in another', () => {
        const strict: TestNormTier = { id: 'j2', year: 'jaar-2', passFrom: 'E' };
        const twoTiers: Pick<Test, 'gradingNorm'> = {
            gradingNorm: {
                type: 'table',
                tiers: [lower, strict],
                rows: rows.map((r) => ({ ...r, grades: { ...r.grades, j2: r.grades.j1 } })),
            },
        };
        const results = [
            resolveTestGrade(twoTiers, ctx(12, 'jaar-1')),
            resolveTestGrade(twoTiers, { ...ctx(12, 'jaar-1'), cls: { year: 'jaar-2' } }),
        ];
        expect(labelDistribution(twoTiers, results)).toEqual([
            { label: 'B', count: 1, passed: true },
            { label: 'B', count: 1, passed: false },
        ]);
    });
});
