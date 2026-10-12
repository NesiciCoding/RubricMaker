import { describe, expect, it } from 'vitest';
import { findPendingGrading } from './pendingGrading';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const base = {
    students: [{ id: 's1' }, { id: 's2' }, { id: 's3', archivedAt: daysAgo(1) }],
    tests: [{ id: 't1', name: 'Unit 3 test' }],
    studentTests: [],
    essayAssignments: [{ teacherKey: 'k1', title: 'Persuasive essay' }],
    essaySubmissions: [],
    studentRubrics: [],
    thresholdDays: 7,
    now: NOW,
};

describe('findPendingGrading (#665)', () => {
    it('ignores graded, in-progress and recent tests, and archived students', () => {
        const groups = findPendingGrading({
            ...base,
            studentTests: [
                { id: 'a', testId: 't1', studentId: 's1', status: 'graded', submittedAt: daysAgo(20) },
                { id: 'b', testId: 't1', studentId: 's1', status: 'in_progress' },
                { id: 'c', testId: 't1', studentId: 's2', status: 'submitted', submittedAt: daysAgo(3) },
                { id: 'd', testId: 't1', studentId: 's3', status: 'submitted', submittedAt: daysAgo(20) },
            ],
        });
        expect(groups).toEqual([]);
    });

    it('groups waiting test submissions per test and links to the oldest', () => {
        const [group] = findPendingGrading({
            ...base,
            studentTests: [
                { id: 'newer', testId: 't1', studentId: 's1', status: 'submitted', submittedAt: daysAgo(8) },
                { id: 'older', testId: 't1', studentId: 's2', status: 'submitted', submittedAt: daysAgo(12) },
            ],
        });
        expect(group).toMatchObject({
            key: 'test:t1',
            kind: 'test',
            title: 'Unit 3 test',
            studentIds: ['s1', 's2'],
            oldestSubmittedAt: daysAgo(12),
            newestSubmittedAt: daysAgo(8),
            daysWaiting: 12,
            path: '/tests/t1/results/older',
        });
    });

    it('treats an essay as graded only by a live, non-peer grade given after it was handed in', () => {
        const submission = {
            teacherKey: 'k1',
            assignmentStudentId: 's1',
            assignmentRubricId: 'r1',
            submittedAt: daysAgo(10),
        };
        const pending = (studentRubrics: Parameters<typeof findPendingGrading>[0]['studentRubrics']) =>
            findPendingGrading({ ...base, essaySubmissions: [submission], studentRubrics });

        expect(pending([])).toMatchObject([{ key: 'essay:k1', title: 'Persuasive essay', path: '/essays/k1' }]);
        expect(pending([{ studentId: 's1', rubricId: 'r1', gradedAt: daysAgo(11), isPeerReview: false }])).toHaveLength(
            1
        );
        expect(pending([{ studentId: 's1', rubricId: 'r1', gradedAt: daysAgo(2), isPeerReview: true }])).toHaveLength(
            1
        );
        expect(
            pending([
                { studentId: 's1', rubricId: 'r1', gradedAt: daysAgo(2), isPeerReview: false, deletedAt: daysAgo(1) },
            ])
        ).toHaveLength(1);
        expect(pending([{ studentId: 's1', rubricId: 'r1', gradedAt: daysAgo(2), isPeerReview: false }])).toEqual([]);
    });

    it('sorts the longest-waiting group first', () => {
        const groups = findPendingGrading({
            ...base,
            studentTests: [{ id: 'x', testId: 't1', studentId: 's1', status: 'submitted', submittedAt: daysAgo(8) }],
            essaySubmissions: [
                { teacherKey: 'k1', assignmentStudentId: 's2', assignmentRubricId: 'r1', submittedAt: daysAgo(15) },
            ],
        });
        expect(groups.map((g) => g.key)).toEqual(['essay:k1', 'test:t1']);
    });
});
