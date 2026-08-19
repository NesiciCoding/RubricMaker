import { describe, it, expect } from 'vitest';
import { buildTestResultsCsv } from './testExportPresets';
import type { Student, StudentTest, Test } from '../types';

const test: Test = {
    id: 'test1',
    name: 'Grammar Quiz',
    questions: [
        {
            id: 'q1',
            prompt: 'She ___ to school.',
            type: 'multiple-choice',
            points: 1,
            options: [
                { id: 'o1', text: 'go', isCorrect: false },
                { id: 'o2', text: 'goes', isCorrect: true },
            ],
            linkedCefrDescriptors: [
                {
                    descriptorId: 'd1',
                    level: 'A1',
                    skill: 'reading',
                    descriptionEn: 'Present simple',
                    descriptionNl: 'Tegenwoordige tijd',
                },
            ],
        },
        { id: 'q2', prompt: 'Open question', type: 'open', points: 1 },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-01T00:00:00.000Z',
};

const students: Student[] = [
    { id: 's1', name: 'Jane Doe', studentNumber: '1234' } as Student,
    { id: 's2', name: 'John Roe', studentNumber: '5678' } as Student,
    { id: 's3', name: 'Mia Lee', studentNumber: '9999' } as Student,
];

const multiAttemptStudentTests: StudentTest[] = [
    {
        id: 'st4-attempt1',
        testId: 'test1',
        studentId: 's3',
        attemptNumber: 1,
        answers: [{ questionId: 'q1', response: 'o1' }], // wrong, no q2 answer → 0%
        status: 'graded',
        startedAt: '2024-01-03T00:00:00.000Z',
        submittedAt: '2024-01-03T00:00:00.000Z',
    },
    {
        id: 'st4-attempt2',
        testId: 'test1',
        studentId: 's3',
        attemptNumber: 2,
        answers: [
            { questionId: 'q1', response: 'o2' }, // correct
            { questionId: 'q2', response: 'anything', pointsEarned: 1 },
        ], // 100%
        status: 'graded',
        startedAt: '2024-01-04T00:00:00.000Z',
        submittedAt: '2024-01-04T00:00:00.000Z',
    },
];

const studentTests: StudentTest[] = [
    {
        id: 'st1',
        testId: 'test1',
        studentId: 's1',
        answers: [
            { questionId: 'q1', response: 'o2' },
            { questionId: 'q2', response: 'anything', pointsEarned: 0 },
        ],
        status: 'graded',
        startedAt: '2024-01-02T00:00:00.000Z',
    },
    {
        id: 'st2',
        testId: 'test1',
        studentId: 's2',
        answers: [{ questionId: 'q1', response: 'o1' }],
        status: 'graded',
        startedAt: '2024-01-02T00:00:00.000Z',
    },
    // A submission for a different test must not appear in the CSV.
    {
        id: 'st3',
        testId: 'other-test',
        studentId: 's1',
        answers: [],
        status: 'graded',
        startedAt: '2024-01-02T00:00:00.000Z',
    },
];

describe('buildTestResultsCsv', () => {
    it('includes one row per student submission for the given test, not other tests', () => {
        const csv = buildTestResultsCsv(test, studentTests, students);
        const lines = csv.trim().split('\n');
        expect(lines).toHaveLength(3); // header + 2 students
    });

    it('has student, score, per-question, and per-skill columns', () => {
        const csv = buildTestResultsCsv(test, studentTests, students);
        const header = csv.trim().split('\n')[0];
        expect(header).toContain('Student Name');
        expect(header).toContain('Student Number');
        expect(header).toContain('Score %');
        expect(header).toContain('Q1 Accuracy %');
        expect(header).toContain('Q2 Accuracy %');
        expect(header).toContain('Present simple %');
    });

    it('computes the correct overall score for a fully-correct submission', () => {
        const csv = buildTestResultsCsv(test, studentTests, students);
        expect(csv).toContain('Jane Doe,1234,50.0');
    });

    it('computes 0% for a student who answered the scored question incorrectly', () => {
        const csv = buildTestResultsCsv(test, studentTests, students);
        expect(csv).toContain('John Roe,5678,0.0');
    });

    it('collapses multiple practice attempts by the same student into a single row, scored from the latest attempt', () => {
        const csv = buildTestResultsCsv(test, [...studentTests, ...multiAttemptStudentTests], students);
        const lines = csv.trim().split('\n');
        expect(lines).toHaveLength(4); // header + s1 + s2 + s3 (not 5 — s3's two attempts collapse to one row)

        const miaRows = lines.filter((line) => line.startsWith('Mia Lee,'));
        expect(miaRows).toHaveLength(1);
        // Score %, Q1/Q2 accuracy, and the "Present simple" skill accuracy must all come from
        // attempt 2 alone (100% across the board) — not blended with attempt 1's wrong answer
        // (which would drag Q1/skill accuracy down to 50% while Score % stayed at 100%).
        expect(miaRows[0]).toBe('Mia Lee,9999,100.0,100,100,100');
    });

    it('tie-breaks submissions with the same attemptNumber by submission time, newest wins', () => {
        const sameNumber: StudentTest[] = [
            {
                id: 'st-tie-old',
                testId: 'test1',
                studentId: 's1',
                attemptNumber: 1,
                answers: [{ questionId: 'q1', response: 'o1' }],
                status: 'graded',
                startedAt: '2024-01-05T00:00:00.000Z',
                submittedAt: '2024-01-05T00:00:00.000Z',
            },
            {
                id: 'st-tie-new',
                testId: 'test1',
                studentId: 's1',
                attemptNumber: 1,
                answers: [
                    { questionId: 'q1', response: 'o2' },
                    { questionId: 'q2', response: 'anything', pointsEarned: 1 },
                ],
                status: 'graded',
                startedAt: '2024-01-06T00:00:00.000Z',
                submittedAt: '2024-01-06T00:00:00.000Z',
            },
        ];
        const csv = buildTestResultsCsv(test, sameNumber, students);
        expect(csv).toContain('Jane Doe,1234,100.0');
    });

    it('keeps the higher attemptNumber when a lower-numbered attempt appears later in the list', () => {
        // The attempts are listed out of order — a higher-numbered attempt first, a lower one second.
        const outOfOrder: StudentTest[] = [
            {
                id: 'st-oo-2',
                testId: 'test1',
                studentId: 's1',
                attemptNumber: 2,
                answers: [
                    { questionId: 'q1', response: 'o2' },
                    { questionId: 'q2', response: 'anything', pointsEarned: 1 },
                ],
                status: 'graded',
                startedAt: '2024-01-06T00:00:00.000Z',
                submittedAt: '2024-01-06T00:00:00.000Z',
            },
            {
                id: 'st-oo-1',
                testId: 'test1',
                studentId: 's1',
                attemptNumber: 1,
                answers: [{ questionId: 'q1', response: 'o1' }],
                status: 'graded',
                startedAt: '2024-01-05T00:00:00.000Z',
                submittedAt: '2024-01-05T00:00:00.000Z',
            },
        ];
        const csv = buildTestResultsCsv(test, outOfOrder, students);
        expect(csv).toContain('Jane Doe,1234,100.0');
    });

    it('keeps the already-latest submission when the candidate is older', () => {
        const sameNumber: StudentTest[] = [
            {
                id: 'st-tie-new',
                testId: 'test1',
                studentId: 's1',
                attemptNumber: 1,
                answers: [
                    { questionId: 'q1', response: 'o2' },
                    { questionId: 'q2', response: 'anything', pointsEarned: 1 },
                ],
                status: 'graded',
                startedAt: '2024-01-06T00:00:00.000Z',
                submittedAt: '2024-01-06T00:00:00.000Z',
            },
            {
                id: 'st-tie-old',
                testId: 'test1',
                studentId: 's1',
                attemptNumber: 1,
                answers: [{ questionId: 'q1', response: 'o1' }],
                status: 'graded',
                startedAt: '2024-01-05T00:00:00.000Z',
                submittedAt: '2024-01-05T00:00:00.000Z',
            },
        ];
        const csv = buildTestResultsCsv(test, sameNumber, students);
        expect(csv).toContain('Jane Doe,1234,100.0');
    });

    it('treats missing attemptNumber as 1 and falls back to startedAt when submittedAt is absent', () => {
        const noTimestamps: StudentTest[] = [
            {
                id: 'st-nn-old',
                testId: 'test1',
                studentId: 's1',
                answers: [{ questionId: 'q1', response: 'o1' }],
                status: 'graded',
                startedAt: '2024-01-05T00:00:00.000Z',
            },
            {
                id: 'st-nn-new',
                testId: 'test1',
                studentId: 's1',
                answers: [
                    { questionId: 'q1', response: 'o2' },
                    { questionId: 'q2', response: 'anything', pointsEarned: 1 },
                ],
                status: 'graded',
                startedAt: '2024-01-06T00:00:00.000Z',
            },
        ];
        const csv = buildTestResultsCsv(test, noTimestamps, students);
        expect(csv).toContain('Jane Doe,1234,100.0');
    });

    it('emits empty student columns when the submission references an unknown student', () => {
        const ghost: StudentTest[] = [
            {
                id: 'st-ghost',
                testId: 'test1',
                studentId: 'nobody',
                answers: [],
                status: 'graded',
                startedAt: '2024-01-02T00:00:00.000Z',
            },
        ];
        const csv = buildTestResultsCsv(test, ghost, students);
        expect(csv).toContain(',,0.0');
    });
});
