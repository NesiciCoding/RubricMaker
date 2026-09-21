import { describe, it, expect } from 'vitest';
import {
    placementLevelDistribution,
    placementItemAnalysis,
    placementSummaryRows,
    placementSummaryCsv,
} from './placementAnalysis';
import type { Test, StudentTest } from '../types';

const test = {
    id: 't1',
    name: 'Placement A',
    mode: 'placement',
    placementEngine: 'staircase',
    questions: [],
    sections: [],
} as unknown as Test;

function run(studentId: string, submittedAt: string, correctSecond: boolean): StudentTest {
    return {
        id: `run-${studentId}`,
        testId: 't1',
        studentId,
        status: 'submitted',
        startedAt: '2026-01-01T00:00:00Z',
        submittedAt,
        answers: [],
        levelPath: [
            { sectionId: 'A2', level: 'A2', questionId: 'qx', correct: true },
            { sectionId: 'B1', level: 'B1', questionId: 'qy', correct: correctSecond },
        ],
    } as StudentTest;
}

const nameById = new Map([
    ['stuA', 'Bob'],
    ['stuB', 'Ann'],
]);

describe('placementAnalysis', () => {
    const runs = [run('stuA', '2026-01-02T00:00:00Z', true), run('stuB', '2026-01-02T00:00:00Z', false)];

    it('distributes every placed student across exactly one CEFR bucket', () => {
        const dist = placementLevelDistribution(test, runs, nameById);
        expect(dist.assessed).toBe(2);
        expect(dist.unplaced).toBe(0);
        expect(dist.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(2);
    });

    it('keeps only the latest attempt per student', () => {
        const withRetake = [...runs, run('stuA', '2026-01-05T00:00:00Z', false)];
        expect(placementLevelDistribution(test, withRetake, nameById).assessed).toBe(2);
    });

    it('aggregates per-item correctness, hardest first', () => {
        const items = placementItemAnalysis(test, runs);
        const qy = items.find((i) => i.questionId === 'qy')!;
        expect(qy.asked).toBe(2);
        expect(qy.correct).toBe(1);
        expect(qy.pct).toBe(50);
        // qy (50%) is harder than qx (100%), so it sorts first.
        expect(items[0].questionId).toBe('qy');
    });

    it('builds summary rows sorted by name and a valid CSV', () => {
        const rows = placementSummaryRows(test, runs, nameById);
        expect(rows.map((r) => r.studentName)).toEqual(['Ann', 'Bob']);
        const csv = placementSummaryCsv(rows, ['Student', 'Level', 'Questions', 'Assessed']);
        expect(csv.split('\n')).toHaveLength(3);
        expect(csv.split('\n')[0]).toBe('Student,Level,Questions,Assessed');
    });
});
