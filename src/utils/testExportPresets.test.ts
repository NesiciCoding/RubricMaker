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
});
