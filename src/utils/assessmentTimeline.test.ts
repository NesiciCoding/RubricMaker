import { describe, it, expect } from 'vitest';
import {
    buildAssessmentTrend,
    buildStudentTimeline,
    countsTowardsProgress,
    scaleForRubric,
    scoredTestResults,
    testResultDate,
} from './assessmentTimeline';
import type { GradeScale, Rubric, RubricCriterion, StudentRubric, StudentTest, Test, TestQuestion } from '../types';

const criterion: RubricCriterion = {
    id: 'c1',
    title: 'C1',
    description: '',
    weight: 100,
    levels: [{ id: 'c1_lvl', label: 'L', minPoints: 0, maxPoints: 10, description: '', subItems: [] }],
};

function mkRubric(id: string, createdAt: string, gradeScaleId = 'none'): Rubric {
    return {
        id,
        name: `Rubric ${id}`,
        subject: '',
        description: '',
        gradeScaleId,
        format: {} as never,
        attachmentIds: [],
        createdAt,
        updatedAt: createdAt,
        totalMaxPoints: 0,
        scoringMode: 'weighted-percentage',
        criteria: [criterion],
    };
}

function mkSR(id: string, rubricId: string, studentId: string, points: number, gradedAt?: string): StudentRubric {
    return {
        id,
        rubricId,
        studentId,
        overallComment: '',
        isPeerReview: false,
        gradedAt,
        entries: [{ criterionId: 'c1', levelId: 'c1_lvl', selectedPoints: points, checkedSubItems: [], comment: '' }],
    };
}

function mkTest(id: string, createdAt: string, extra: Partial<Test> = {}): Test {
    return {
        id,
        name: `Test ${id}`,
        questions: [{ id: 'q1', points: 10 } as TestQuestion],
        requireSEB: false,
        shuffleQuestions: false,
        createdAt,
        ...extra,
    };
}

function mkST(
    id: string,
    testId: string,
    studentId: string,
    raw: number,
    extra: Partial<StudentTest> = {}
): StudentTest {
    return {
        id,
        testId,
        studentId,
        answers: [],
        status: 'graded',
        startedAt: '2024-01-01T09:00:00Z',
        gradedAt: '2024-01-02T09:00:00Z',
        rawTotalPoints: raw,
        ...extra,
    };
}

describe('countsTowardsProgress', () => {
    it('counts assessment tests, including legacy tests without a mode', () => {
        expect(countsTowardsProgress(mkTest('t', '2024'))).toBe(true);
        expect(countsTowardsProgress(mkTest('t', '2024', { mode: 'assessment' }))).toBe(true);
    });

    it('leaves out practice and placement tests', () => {
        expect(countsTowardsProgress(mkTest('t', '2024', { mode: 'practice' }))).toBe(false);
        expect(countsTowardsProgress(mkTest('t', '2024', { mode: 'placement' }))).toBe(false);
    });
});

describe('testResultDate', () => {
    it('prefers graded, then submitted, then started', () => {
        const st = mkST('a', 't', 's', 0, { gradedAt: 'G', submittedAt: 'S', startedAt: 'B' });
        expect(testResultDate(st)).toBe('G');
        expect(testResultDate({ ...st, gradedAt: undefined })).toBe('S');
        expect(testResultDate({ ...st, gradedAt: undefined, submittedAt: undefined })).toBe('B');
    });
});

describe('scoredTestResults', () => {
    const tests = [
        mkTest('t1', '2024-01-01'),
        mkTest('practice', '2024-01-01', { mode: 'practice' }),
        mkTest('empty', '2024-01-01', { questions: [] }),
    ];

    it('scores submitted and graded results, including the class adjustment', () => {
        const results = scoredTestResults(
            [mkST('a', 't1', 's1', 6), mkST('b', 't1', 's2', 5, { status: 'submitted', adjustmentPoints: 2 })],
            tests
        );
        expect(results.map((r) => r.percentage)).toEqual([60, 70]);
        expect(results[1].totalPoints).toBe(7);
        expect(results[1].maxPoints).toBe(10);
    });

    it('skips in-progress, absent, practice, point-less and orphaned results', () => {
        const results = scoredTestResults(
            [
                mkST('a', 't1', 's1', 6, { status: 'in_progress' }),
                mkST('b', 't1', 's1', 6, { absent: true }),
                mkST('c', 'practice', 's1', 6),
                mkST('d', 'empty', 's1', 6),
                mkST('e', 'missing', 's1', 6),
            ],
            tests
        );
        expect(results).toEqual([]);
    });
});

describe('scaleForRubric', () => {
    const scale: GradeScale = { id: 'g1', name: 'G', type: 'letter', ranges: [] };
    it('returns null for an unscaled rubric and falls back to the first scale', () => {
        expect(scaleForRubric(mkRubric('r', '2024'), [scale])).toBeNull();
        expect(scaleForRubric(mkRubric('r', '2024', 'missing'), [scale])).toBe(scale);
        expect(scaleForRubric(mkRubric('r', '2024', 'g1'), [scale])).toBe(scale);
    });
});

describe('buildAssessmentTrend', () => {
    it('merges rubrics and tests in creation order with average and median', () => {
        const trend = buildAssessmentTrend((id) => id !== 'outsider', {
            rubrics: [mkRubric('r1', '2024-01-01'), mkRubric('r2', '2024-03-01'), mkRubric('unused', '2024-04-01')],
            studentRubrics: [
                mkSR('a', 'r1', 's1', 4),
                mkSR('b', 'r1', 's2', 8),
                mkSR('c', 'r2', 's1', 10),
                mkSR('d', 'r2', 'outsider', 0),
            ],
            gradeScales: [],
            tests: [mkTest('t1', '2024-02-01'), mkTest('t2', '2024-05-01')],
            studentTests: [
                mkST('x', 't1', 's1', 2),
                mkST('y', 't1', 's2', 4),
                mkST('z', 't1', 's3', 9),
                mkST('o', 't2', 'outsider', 9),
            ],
        });
        expect(trend.map((p) => [p.kind, p.id])).toEqual([
            ['rubric', 'r1'],
            ['test', 't1'],
            ['rubric', 'r2'],
        ]);
        expect(trend[0]).toMatchObject({ name: 'Rubric r1', avg: 60, median: 60 });
        expect(trend[1]).toMatchObject({ name: 'Test t1', avg: 50, median: 40 });
        expect(trend[2]).toMatchObject({ avg: 100, median: 100 });
    });
});

describe('buildAssessmentTrend with rubric snapshots', () => {
    it('scores a grade against the rubric it was graded with, not the edited live rubric', () => {
        const live = { ...mkRubric('r1', '2024-01-01'), criteria: [{ ...criterion, id: 'renamed' }] };
        const sr = { ...mkSR('a', 'r1', 's1', 8), rubricSnapshot: mkRubric('r1', '2024-01-01') };
        const trend = buildAssessmentTrend(() => true, {
            rubrics: [live],
            studentRubrics: [sr],
            gradeScales: [],
            tests: [],
            studentTests: [],
        });
        expect(trend[0].avg).toBe(80);
    });
});

describe('buildStudentTimeline', () => {
    it('interleaves rubric grades and test results by date', () => {
        const timeline = buildStudentTimeline(
            [
                { id: 'sr1', name: 'Essay', date: '2024-01-01T00:00:00Z', score: 80 },
                { id: 'sr2', name: 'Speech', date: '2024-03-01T00:00:00Z', score: 70 },
            ],
            scoredTestResults(
                [mkST('st1', 't1', 's1', 4.44, { gradedAt: '2024-02-01T00:00:00Z' })],
                [mkTest('t1', '2024-01-01')]
            )
        );
        expect(timeline.map((e) => [e.kind, e.name, e.score])).toEqual([
            ['rubric', 'Essay', 80],
            ['test', 'Test t1', 44.4],
            ['rubric', 'Speech', 70],
        ]);
    });
});
