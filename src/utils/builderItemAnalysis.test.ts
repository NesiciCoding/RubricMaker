import { describe, expect, it } from 'vitest';
import { builderItemInsights, INSIGHT_TOO_EASY, INSIGHT_WEAK_DISCRIMINATION } from './builderItemAnalysis';
import { MIN_STUDENTS_FOR_CORRELATION } from './testQualityMetrics';
import type { StudentTest, Test } from '../types';

const test: Test = {
    id: 't1',
    name: 'Unit',
    questions: [
        {
            id: 'q1',
            prompt: 'Pick A',
            type: 'multiple-choice',
            points: 1,
            options: [
                { id: 'a', text: 'A', isCorrect: true },
                { id: 'b', text: 'B', isCorrect: false },
            ],
        },
        {
            id: 'q2',
            prompt: 'Also A',
            type: 'multiple-choice',
            points: 1,
            options: [
                { id: 'a', text: 'A', isCorrect: true },
                { id: 'b', text: 'B', isCorrect: false },
            ],
        },
        {
            id: 'q3',
            prompt: 'Nobody answered this yet',
            type: 'multiple-choice',
            points: 1,
            options: [
                { id: 'a', text: 'A', isCorrect: true },
                { id: 'b', text: 'B', isCorrect: false },
            ],
        },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00Z',
};

function sitting(studentId: string, q1: string, q2: string): StudentTest {
    return {
        id: `st-${studentId}`,
        testId: test.id,
        studentId,
        answers: [
            { questionId: 'q1', response: q1 },
            { questionId: 'q2', response: q2 },
        ],
        status: 'graded',
        startedAt: '2026-01-02T00:00:00Z',
    };
}

const students = Array.from({ length: 10 }, (_, i) => ({
    id: `s${i + 1}`,
    classId: i < 5 ? 'c1' : 'c2',
}));

const classes = [
    { id: 'c1', name: '3A' },
    { id: 'c2', name: '3B' },
];

const tenSittings = students.map((s) => sitting(s.id, 'a', 'a'));

describe('builderItemInsights', () => {
    it('reports nothing when the test has no sittings', () => {
        const insights = builderItemInsights({ test, studentTests: [], students, classes });
        expect(insights.hasData).toBe(false);
        expect(insights.byQuestion.size).toBe(0);
        expect(insights.classes).toEqual([]);
    });

    it('stays silent below the minimum complete-sitting count', () => {
        const studentTests = [sitting('s1', 'a', 'a'), sitting('s2', 'a', 'a'), sitting('s3', 'b', 'a')];
        const insights = builderItemInsights({ test, studentTests, students, classes });
        expect(insights.sample).toBe(3);
        expect(insights.sample).toBeLessThan(MIN_STUDENTS_FOR_CORRELATION);
        expect(insights.hasData).toBe(false);
        expect(insights.byQuestion.size).toBe(0);
    });

    it('flags an item everyone got right as too easy and weakly discriminating', () => {
        const insights = builderItemInsights({ test, studentTests: tenSittings, students, classes });
        expect(insights.hasData).toBe(true);
        const q2 = insights.byQuestion.get('q2');
        expect(q2?.pValue).toBe(1);
        expect(q2?.pValue).toBeGreaterThan(INSIGHT_TOO_EASY);
        expect(q2?.readings).toContain('too_easy');
        expect(q2?.discrimination).toBe(0);
        expect(q2?.discrimination).toBeLessThan(INSIGHT_WEAK_DISCRIMINATION);
        expect(q2?.readings).toContain('weak_discrimination');
        expect(insights.needsReviewIds.has('q2')).toBe(true);
        expect(insights.classes).toEqual(['3A', '3B']);
    });

    it('leaves an on-target item unflagged', () => {
        const studentTests = [
            sitting('s1', 'a', 'a'),
            sitting('s2', 'a', 'a'),
            sitting('s3', 'b', 'a'),
            sitting('s4', 'a', 'a'),
            sitting('s5', 'b', 'a'),
            sitting('s6', 'b', 'a'),
        ];
        const insights = builderItemInsights({ test, studentTests, students, classes });
        const q1 = insights.byQuestion.get('q1');
        expect(q1?.pValue).toBeCloseTo(0.5);
        expect(insights.needsReviewIds.has('q1')).toBe(false);
        expect(q1?.readings).toEqual([]);
        expect(insights.classes).toEqual(['3A', '3B']);
        expect(insights.sample).toBe(6);
        expect(insights.minSample).toBe(MIN_STUDENTS_FOR_CORRELATION);
    });

    it('never attaches numbers to a question that was not answered', () => {
        const insights = builderItemInsights({ test, studentTests: tenSittings, students, classes });
        expect(insights.byQuestion.has('q3')).toBe(false);
        expect(insights.byQuestion.has('q1')).toBe(true);
    });

    it('ignores absentees and other tests', () => {
        const studentTests: StudentTest[] = [
            ...tenSittings.slice(0, 6),
            { ...sitting('s7', 'b', 'b'), absent: true } as StudentTest,
            { ...sitting('s8', 'b', 'b'), id: 'other', testId: 't2' } as StudentTest,
        ];
        const insights = builderItemInsights({ test, studentTests, students, classes });
        expect(insights.sample).toBe(6);
        expect(insights.classes).toEqual(['3A', '3B']);
        expect(insights.byQuestion.get('q1')?.pValue).toBe(1);
    });
});
