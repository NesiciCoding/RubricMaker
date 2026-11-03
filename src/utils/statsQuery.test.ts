import { describe, it, expect } from 'vitest';
import {
    collectAssessmentRecords,
    computeMetric,
    DEFAULT_STATS_QUERY,
    EXAMPLE_QUERIES,
    filterRecords,
    runStatsQuery,
    type AssessmentRecord,
} from './statsQuery';
import type { Rubric, StudentRubric, StudentTest, Test, TestQuestion, StatsQuery } from '../types';

function rec(over: Partial<AssessmentRecord>): AssessmentRecord {
    return {
        studentId: 's1',
        studentName: 'Ann',
        classId: 'c1',
        className: '1A',
        kind: 'rubric',
        assessmentKey: 'rubric:r1',
        assessmentName: 'Essay',
        subject: 'English',
        date: '2024-01-10T00:00:00Z',
        score: 50,
        ...over,
    };
}

const q = (over: Partial<StatsQuery>): StatsQuery => ({ ...DEFAULT_STATS_QUERY, ...over });

const RECORDS: AssessmentRecord[] = [
    rec({ score: 40, date: '2024-01-10T00:00:00Z' }),
    rec({
        score: 70,
        kind: 'test',
        assessmentKey: 'test:t1',
        assessmentName: 'Quiz',
        subject: '',
        date: '2024-02-10T00:00:00Z',
    }),
    rec({ studentId: 's2', studentName: 'Bob', score: 90, date: '2024-01-20T00:00:00Z' }),
    rec({
        studentId: 's2',
        studentName: 'Bob',
        classId: 'c2',
        className: '1B',
        score: 60,
        kind: 'test',
        assessmentKey: 'test:t1',
        assessmentName: 'Quiz',
        subject: '',
        date: '2024-03-01T00:00:00Z',
    }),
];

describe('computeMetric', () => {
    const rs = [rec({ score: 40 }), rec({ score: 60, date: '2024-02-01' }), rec({ score: 80, date: '2023-12-01' })];
    it.each([
        ['avg', 60],
        ['median', 60],
        ['min', 40],
        ['max', 80],
        ['count', 3],
        ['passRate', 66.7],
        ['stdDev', 16.3],
        ['change', -20],
    ] as const)('%s', (metric, expected) => {
        expect(computeMetric(rs, metric)).toBe(expected);
    });

    it('takes the median of an even count and honours a custom pass mark', () => {
        expect(computeMetric([rec({ score: 40 }), rec({ score: 60 })], 'median')).toBe(50);
        expect(computeMetric(rs, 'passRate', 70)).toBe(33.3);
    });

    it('returns null for no records, and for change with a single record', () => {
        expect(computeMetric([], 'avg')).toBeNull();
        expect(computeMetric([rec({})], 'change')).toBeNull();
    });
});

describe('filterRecords', () => {
    it('filters by source, class, assessment, subject, date and score', () => {
        expect(filterRecords(RECORDS, q({ source: 'test' }))).toHaveLength(2);
        expect(filterRecords(RECORDS, q({ classIds: ['c2'] }))).toHaveLength(1);
        expect(filterRecords(RECORDS, q({ assessmentKeys: ['rubric:r1'] }))).toHaveLength(2);
        expect(filterRecords(RECORDS, q({ subject: 'English' }))).toHaveLength(2);
        expect(filterRecords(RECORDS, q({ dateFrom: '2024-01-20', dateTo: '2024-02-10' }))).toHaveLength(2);
        expect(filterRecords(RECORDS, q({ minScore: 60, maxScore: 80 }))).toHaveLength(2);
    });
});

describe('runStatsQuery', () => {
    it('groups by student and sorts by value', () => {
        const { rows, matchedRecords } = runStatsQuery(RECORDS, q({}));
        expect(matchedRecords).toBe(4);
        expect(rows.map((r) => [r.label, r.value, r.count])).toEqual([
            ['Bob', 75, 2],
            ['Ann', 55, 2],
        ]);
        expect(runStatsQuery(RECORDS, q({ sort: 'value_asc' })).rows[0].label).toBe('Ann');
        expect(runStatsQuery(RECORDS, q({ sort: 'label' })).rows[0].label).toBe('Ann');
    });

    it('breaks value ties alphabetically', () => {
        const tied = [rec({ studentId: 'b', studentName: 'Bea' }), rec({ studentId: 'a', studentName: 'Al' })];
        expect(runStatsQuery(tied, q({})).rows.map((r) => r.label)).toEqual(['Al', 'Bea']);
        expect(runStatsQuery(tied, q({ sort: 'value_asc' })).rows.map((r) => r.label)).toEqual(['Al', 'Bea']);
    });

    it('groups by every dimension', () => {
        expect(runStatsQuery(RECORDS, q({ groupBy: 'class' })).rows.map((r) => r.key)).toEqual(['c1', 'c2']);
        const byAssessment = runStatsQuery(RECORDS, q({ groupBy: 'assessment', sort: 'label' })).rows;
        expect(byAssessment.map((r) => [r.label, r.kind])).toEqual([
            ['Essay', 'rubric'],
            ['Quiz', 'test'],
        ]);
        expect(runStatsQuery(RECORDS, q({ groupBy: 'subject', sort: 'label' })).rows.map((r) => r.key)).toEqual([
            '',
            'English',
        ]);
        expect(runStatsQuery(RECORDS, q({ groupBy: 'month', sort: 'label' })).rows.map((r) => r.key)).toEqual([
            '2024-01',
            '2024-02',
            '2024-03',
        ]);
        expect(runStatsQuery(RECORDS, q({ groupBy: 'kind', sort: 'label' })).rows.map((r) => r.key)).toEqual([
            'rubric',
            'test',
        ]);
    });

    it('applies the condition, minimum count and limit', () => {
        expect(runStatsQuery(RECORDS, q({ condition: { op: 'lt', value: 60 } })).rows.map((r) => r.label)).toEqual([
            'Ann',
        ]);
        expect(runStatsQuery(RECORDS, q({ condition: { op: 'gt', value: 60 } })).rows.map((r) => r.label)).toEqual([
            'Bob',
        ]);
        expect(runStatsQuery(RECORDS, q({ groupBy: 'class', minCount: 2 })).rows.map((r) => r.key)).toEqual(['c1']);
        expect(runStatsQuery(RECORDS, q({ limit: 1 })).rows).toHaveLength(1);
    });

    it('finds declining students with the change metric and drops single-result groups', () => {
        const declining = EXAMPLE_QUERIES.find((e) => e.id === 'declining')!.query;
        const rows = runStatsQuery([...RECORDS, rec({ studentId: 's3', studentName: 'Cy' })], declining).rows;
        expect(rows.map((r) => [r.label, r.value])).toEqual([['Bob', -30]]);
    });
});

describe('collectAssessmentRecords', () => {
    const rubric: Rubric = {
        id: 'r1',
        name: 'Essay',
        subject: 'English',
        description: '',
        gradeScaleId: 'none',
        format: {} as never,
        attachmentIds: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        totalMaxPoints: 0,
        scoringMode: 'weighted-percentage',
        criteria: [
            {
                id: 'c',
                title: 'C',
                description: '',
                weight: 100,
                levels: [{ id: 'l', label: 'L', minPoints: 0, maxPoints: 10, description: '', subItems: [] }],
            },
        ],
    };
    const sr = (id: string, studentId: string, extra: Partial<StudentRubric> = {}): StudentRubric => ({
        id,
        rubricId: 'r1',
        studentId,
        overallComment: '',
        isPeerReview: false,
        entries: [{ criterionId: 'c', levelId: 'l', selectedPoints: 8, checkedSubItems: [], comment: '' }],
        ...extra,
    });
    const test: Test = {
        id: 't1',
        name: 'Quiz',
        questions: [{ id: 'q', points: 4 } as TestQuestion],
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: '2024-01-01',
    };
    const st: StudentTest = {
        id: 'st',
        testId: 't1',
        studentId: 's1',
        answers: [],
        status: 'graded',
        startedAt: '2024-02-01T00:00:00Z',
        rawTotalPoints: 3,
    };

    it('flattens rubric grades and test results, skipping unknown students and rubrics', () => {
        const records = collectAssessmentRecords({
            students: [
                { id: 's1', name: 'Ann', classId: 'c1' },
                { id: 's2', name: 'Bob', classId: 'gone' },
            ],
            classes: [{ id: 'c1', name: '1A' }],
            rubrics: [rubric],
            studentRubrics: [
                sr('a', 's1', { gradedAt: '2024-03-01T00:00:00Z' }),
                sr('b', 's2'),
                sr('c', 'stranger'),
                { ...sr('d', 's1'), rubricId: 'missing' },
            ],
            gradeScales: [],
            tests: [test],
            studentTests: [st, { ...st, id: 'st2', studentId: 'stranger' }],
        });
        expect(records.map((r) => [r.kind, r.studentName, r.className, r.score, r.date.slice(0, 10)])).toEqual([
            ['rubric', 'Ann', '1A', 80, '2024-03-01'],
            ['rubric', 'Bob', '', 80, '2024-01-01'],
            ['test', 'Ann', '1A', 75, '2024-02-01'],
        ]);
        expect(records[0]).toMatchObject({ assessmentKey: 'rubric:r1', subject: 'English' });
        expect(records[2]).toMatchObject({ assessmentKey: 'test:t1', assessmentName: 'Quiz', subject: '' });
    });

    it('can leave out work that was not handed in', () => {
        const records = collectAssessmentRecords({
            students: [{ id: 's1', name: 'Ann', classId: 'c1' }],
            classes: [],
            rubrics: [rubric],
            studentRubrics: [sr('a', 's1', { notHandedIn: true })],
            gradeScales: [],
            tests: [],
            studentTests: [],
            excludeNotHandedIn: true,
        });
        expect(records).toEqual([]);
    });
});
