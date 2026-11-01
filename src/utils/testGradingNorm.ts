import type {
    Class,
    GradeScale,
    SchoolYear,
    Student,
    Test,
    TestGradingNorm,
    TestNormTableRow,
    TestNormTier,
    VoTrack,
} from '../types';
import { SCHOOL_YEAR_LABELS, getEffectiveSchoolYear } from '../data/schoolYears';
import { VO_TRACK_LABELS, getEffectiveVoTrack } from '../data/voTracks';
import { calcGradeColor, calcLetterGrade } from './gradeCalc';
import { clamp } from './clamp';
import { nanoid } from './nanoid';

export const DEFAULT_PASS_GRADE = 5.5;
export const DEFAULT_GRADE_DECIMALS = 1;
const MIN_GRADE = 1;
const MAX_GRADE = 10;
const PASS_COLOR = 'var(--green-text)';
const FAIL_COLOR = 'var(--red-text)';
const NEUTRAL_COLOR = '#6b7280';

export function testNorm(test: Pick<Test, 'gradingNorm'>): TestGradingNorm {
    return test.gradingNorm ?? { type: 'scale' };
}

export function isNumericNorm(norm: TestGradingNorm): boolean {
    return norm.type !== 'scale';
}

export function roundGrade(grade: number, decimals: number = DEFAULT_GRADE_DECIMALS): number {
    const factor = 10 ** decimals;
    return Math.round(grade * factor) / factor;
}

/**
 * Dutch CvTE N-term conversion: 9·S/L + N, curbed near the ends so a high N can't lift a
 * near-zero score far above 1 (and a low N can't drop a near-perfect score far below 10).
 */
export function ntermGrade(points: number, maxPoints: number, n: number): number {
    if (maxPoints <= 0) return MIN_GRADE;
    const s = clamp(points, 0, maxPoints);
    const step = 9 / maxPoints;
    const base = step * s + n;
    let grade = base;
    if (n > 1) {
        grade = Math.min(base, 1 + s * step * 2, 10 - (maxPoints - s) * step * 0.5);
    } else if (n < 1) {
        grade = Math.max(base, 1 + s * step * 0.5, 10 - (maxPoints - s) * step * 2);
    }
    return clamp(grade, MIN_GRADE, MAX_GRADE);
}

/** Linear 1 → passGrade at passPoints → 10 at full marks. */
export function caesuraGrade(points: number, maxPoints: number, passPoints: number, passGrade: number): number {
    if (maxPoints <= 0) return MIN_GRADE;
    const s = clamp(points, 0, maxPoints);
    const p = clamp(passPoints, 0, maxPoints);
    if (p <= 0) return s >= maxPoints ? MAX_GRADE : passGrade + ((MAX_GRADE - passGrade) * s) / maxPoints;
    if (s <= p) return MIN_GRADE + ((passGrade - MIN_GRADE) * s) / p;
    if (p >= maxPoints) return MAX_GRADE;
    return passGrade + ((MAX_GRADE - passGrade) * (s - p)) / (maxPoints - p);
}

/** The grade the highest row at or below `points` gives this tier; null when no row covers the score. */
export function tableGrade(rows: TestNormTableRow[], tierId: string, points: number): number | string | null {
    let best: TestNormTableRow | undefined;
    for (const row of rows) {
        if (row.minPoints <= points && row.grades[tierId] !== undefined && (!best || row.minPoints > best.minPoints)) {
            best = row;
        }
    }
    return best ? best.grades[tierId] : null;
}

/** The lowest points a label is given from in a column — its position in the IO < B < E order. */
export function labelRank(rows: TestNormTableRow[], tierId: string, label: string): number | null {
    let rank: number | null = null;
    for (const row of rows) {
        if (row.grades[tierId] === label && (rank === null || row.minPoints < rank)) rank = row.minPoints;
    }
    return rank;
}

/** The distinct labels used in a column, lowest first. */
export function tierLabels(rows: TestNormTableRow[], tierId: string): string[] {
    const labels = new Set<string>();
    for (const row of rows) {
        const g = row.grades[tierId];
        if (typeof g === 'string') labels.add(g);
    }
    return [...labels].sort((a, b) => labelRank(rows, tierId, a)! - labelRank(rows, tierId, b)!);
}

const MAX_LABEL_LENGTH = 12;

/** A norm-table cell as typed: a number ("6,5") is a grade, other text ("IO") a label, blank clears it. */
export function parseGradeCell(raw: string): number | string | null {
    const text = raw.trim();
    if (text === '') return null;
    const asNumber = text.replace(',', '.');
    if (/^\d+(\.\d+)?$/.test(asNumber)) return Number(asNumber);
    return text.slice(0, MAX_LABEL_LENGTH);
}

/**
 * Gives label columns a 'sufficient from' default (their second label, so B in IO/B/E) the first time
 * they have labels. An explicit '' means the teacher chose no pass mark and is kept.
 */
export function withLabelPassDefaults(tiers: TestNormTier[], rows: TestNormTableRow[]): TestNormTier[] {
    return tiers.map((tier) => {
        const labels = tierLabels(rows, tier.id);
        if (tier.passFrom === undefined && labels.length >= 2) return { ...tier, passFrom: labels[1] };
        if (tier.passFrom && !labels.includes(tier.passFrom)) return { ...tier, passFrom: undefined };
        return tier;
    });
}

/** Whether a label reaches the column's 'sufficient from' label; null when the column has no pass mark. */
export function labelPassed(rows: TestNormTableRow[], tier: TestNormTier, label: string): boolean | null {
    if (!tier.passFrom) return null;
    const passRank = labelRank(rows, tier.id, tier.passFrom);
    const rank = labelRank(rows, tier.id, label);
    if (passRank === null || rank === null) return null;
    return rank >= passRank;
}

export function normTierLabel(tier: TestNormTier, allLabel: string): string {
    if (tier.label?.trim()) return tier.label.trim();
    if (!tier.year) return tier.track ? VO_TRACK_LABELS[tier.track] : allLabel;
    const year = SCHOOL_YEAR_LABELS[tier.year];
    return tier.track ? `${year} · ${VO_TRACK_LABELS[tier.track]}` : year;
}

/**
 * The norm-table column a student is graded with: their year + track, then their year alone, then
 * their track alone, then a column that applies to everyone. Undefined when nothing fits, so the
 * sheet can show every column instead of silently picking one with different cut-offs.
 */
export function resolveNormTier(
    tiers: TestNormTier[],
    student?: { voTrack?: VoTrack; schoolYear?: SchoolYear },
    cls?: Pick<Class, 'year' | 'years' | 'voTrack' | 'voTracks'>
): TestNormTier | undefined {
    if (tiers.length === 1 && !tiers[0].year && !tiers[0].track) return tiers[0];
    const year = getEffectiveSchoolYear(student, cls);
    const track = getEffectiveVoTrack(student, cls);
    return (
        (year && track ? tiers.find((t) => t.year === year && t.track === track) : undefined) ??
        (year ? tiers.find((t) => t.year === year && !t.track) : undefined) ??
        (track ? tiers.find((t) => !t.year && t.track === track) : undefined) ??
        tiers.find((t) => !t.year && !t.track)
    );
}

export interface TestGradeAlternative {
    tier: TestNormTier;
    grade: number | string | null;
}

export interface TestGradeResult {
    /** What to display: a scale label ("B"), a formatted number ("7.4"), or '—'. */
    label: string;
    /** The 1–10 grade for numeric norms; null for scale grades or an unresolved table tier. */
    numeric: number | null;
    color: string;
    passed: boolean | null;
    /** The norm-table column used, when one was resolved. */
    tier?: TestNormTier;
    /** Every column's grade, when the student's column couldn't be resolved. */
    alternatives?: TestGradeAlternative[];
}

export interface TestGradeContext {
    points: number;
    maxPoints: number;
    percentage: number;
    scale: GradeScale | null;
    student?: Pick<Student, 'voTrack' | 'schoolYear'>;
    cls?: Pick<Class, 'year' | 'years' | 'voTrack' | 'voTracks'>;
}

export function formatGrade(grade: number, decimals: number): string {
    return roundGrade(grade, decimals).toFixed(decimals);
}

function numericResult(grade: number, test: Pick<Test, 'gradeDecimals' | 'passGrade'>): TestGradeResult {
    const decimals = test.gradeDecimals ?? DEFAULT_GRADE_DECIMALS;
    const rounded = roundGrade(grade, decimals);
    const passed = rounded >= (test.passGrade ?? DEFAULT_PASS_GRADE);
    return { label: rounded.toFixed(decimals), numeric: rounded, color: passed ? PASS_COLOR : FAIL_COLOR, passed };
}

/** Points → grade for a test, under the norm the teacher picked for it. The single place grades are derived. */
export function resolveTestGrade(
    test: Pick<Test, 'gradingNorm' | 'gradeDecimals' | 'passGrade'>,
    ctx: TestGradeContext
): TestGradeResult {
    const norm = testNorm(test);
    const passGrade = test.passGrade ?? DEFAULT_PASS_GRADE;
    switch (norm.type) {
        case 'nterm':
            return numericResult(ntermGrade(ctx.points, ctx.maxPoints, norm.n), test);
        case 'caesura':
            return numericResult(caesuraGrade(ctx.points, ctx.maxPoints, norm.passPoints, passGrade), test);
        case 'table': {
            const tier = resolveNormTier(norm.tiers, ctx.student, ctx.cls);
            if (tier) {
                const grade = tableGrade(norm.rows, tier.id, ctx.points);
                if (grade === null) return { label: '—', numeric: null, color: NEUTRAL_COLOR, passed: null, tier };
                if (typeof grade === 'string') {
                    const passed = labelPassed(norm.rows, tier, grade);
                    const color = passed === null ? NEUTRAL_COLOR : passed ? PASS_COLOR : FAIL_COLOR;
                    return { label: grade, numeric: null, color, passed, tier };
                }
                return { ...numericResult(grade, test), tier };
            }
            return {
                label: '—',
                numeric: null,
                color: NEUTRAL_COLOR,
                passed: null,
                alternatives: norm.tiers.map((t) => ({ tier: t, grade: tableGrade(norm.rows, t.id, ctx.points) })),
            };
        }
        default:
            return ctx.scale
                ? {
                      label: calcLetterGrade(ctx.percentage, ctx.scale),
                      numeric: null,
                      color: calcGradeColor(ctx.percentage, ctx.scale),
                      passed: null,
                  }
                : { label: '—', numeric: null, color: NEUTRAL_COLOR, passed: null };
    }
}

/** The grade scale a test's 'scale' norm uses — same resolution TestResultsPage has always used. */
export function resolveTestScale(
    test: Pick<Test, 'gradeScaleId'>,
    gradeScales: GradeScale[],
    defaultGradeScaleId: string | undefined
): GradeScale | null {
    const scaleId = test.gradeScaleId ?? defaultGradeScaleId;
    return scaleId === 'none' ? null : (gradeScales.find((g) => g.id === scaleId) ?? gradeScales[0] ?? null);
}

export interface NormTablePreviewRow {
    points: number;
    /** One grade per tier for a table norm; a single entry otherwise. */
    grades: (number | string | null)[];
}

/** Whole-point preview of the norm (0…max) for the teacher to sanity-check cut-offs. */
export function buildNormPreview(
    test: Pick<Test, 'gradingNorm' | 'gradeDecimals' | 'passGrade'>,
    maxPoints: number
): NormTablePreviewRow[] {
    const norm = testNorm(test);
    if (norm.type === 'scale' || maxPoints <= 0) return [];
    const decimals = test.gradeDecimals ?? DEFAULT_GRADE_DECIMALS;
    const passGrade = test.passGrade ?? DEFAULT_PASS_GRADE;
    const steps = Math.floor(maxPoints);
    const points = Array.from({ length: steps + 1 }, (_, i) => i);
    if (steps !== maxPoints) points.push(maxPoints);
    return points.map((p) => {
        if (norm.type === 'table') {
            return {
                points: p,
                grades: norm.tiers.map((tier) => {
                    const g = tableGrade(norm.rows, tier.id, p);
                    return typeof g === 'number' ? roundGrade(g, decimals) : g;
                }),
            };
        }
        const grade =
            norm.type === 'nterm'
                ? ntermGrade(p, maxPoints, norm.n)
                : caesuraGrade(p, maxPoints, norm.passPoints, passGrade);
        return { points: p, grades: [roundGrade(grade, decimals)] };
    });
}

export function defaultNorm(type: TestGradingNorm['type'], maxPoints: number): TestGradingNorm {
    switch (type) {
        case 'nterm':
            return { type: 'nterm', n: 1 };
        case 'caesura':
            return { type: 'caesura', passPoints: Math.round(maxPoints * 0.55 * 2) / 2 };
        case 'table': {
            const tier: TestNormTier = { id: nanoid() };
            return {
                type: 'table',
                tiers: [tier],
                rows: [
                    { minPoints: 0, grades: { [tier.id]: 1 } },
                    { minPoints: Math.round(maxPoints * 0.55), grades: { [tier.id]: 5.5 } },
                    { minPoints: maxPoints, grades: { [tier.id]: 10 } },
                ],
            };
        }
        default:
            return { type: 'scale' };
    }
}

export interface LabelCount {
    label: string;
    count: number;
    passed: boolean | null;
}

/** How many students got each table label (IO, B, E…), lowest label first, for the analysis chart. */
export function labelDistribution(
    test: Pick<Test, 'gradingNorm'>,
    results: Pick<TestGradeResult, 'label' | 'numeric' | 'passed' | 'tier'>[]
): LabelCount[] {
    const norm = testNorm(test);
    if (norm.type !== 'table') return [];
    const byLabel = new Map<string, LabelCount & { rank: number }>();
    for (const r of results) {
        if (r.numeric !== null || !r.tier) continue;
        const rank = labelRank(norm.rows, r.tier.id, r.label);
        if (rank === null) continue;
        const entry = byLabel.get(r.label) ?? { label: r.label, count: 0, passed: r.passed, rank };
        entry.count++;
        entry.rank = Math.min(entry.rank, rank);
        byLabel.set(r.label, entry);
    }
    return [...byLabel.values()]
        .sort((a, b) => a.rank - b.rank)
        .map(({ label, count, passed }) => ({ label, count, passed }));
}
