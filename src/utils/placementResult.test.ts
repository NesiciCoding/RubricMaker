import { describe, it, expect } from 'vitest';
import { estimatePlacement } from './placementResult';
import type { Test, StudentTest, TestQuestion } from '../types';

const mcQuestion = (id: string, sectionId: string): TestQuestion => ({
    id,
    prompt: `Question ${id}`,
    type: 'multiple-choice',
    points: 10,
    sectionId,
    options: [
        { id: 'wrong', text: 'Wrong', isCorrect: false },
        { id: 'right', text: 'Right', isCorrect: true },
    ],
});

const makeTest = (overrides: Partial<Test> = {}): Test => ({
    id: 't1',
    name: 'Placement test',
    questions: [mcQuestion('q-routing', 'routing'), mcQuestion('q-easy', 'easy'), mcQuestion('q-hard', 'hard')],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    mode: 'placement',
    sections: [
        {
            id: 'routing',
            title: 'Routing',
            cefrLevel: 'A2',
            routing: { thresholdPct: 60, passSectionId: 'hard', failSectionId: 'easy' },
        },
        { id: 'easy', title: 'Easy', cefrLevel: 'A1' },
        { id: 'hard', title: 'Hard', cefrLevel: 'B1' },
    ],
    ...overrides,
});

const makeStudentTest = (overrides: Partial<StudentTest> = {}): StudentTest => ({
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [],
    status: 'submitted',
    startedAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
});

describe('estimatePlacement', () => {
    it('returns null when there is no section path', () => {
        expect(estimatePlacement(makeTest(), makeStudentTest())).toBeNull();
    });

    it('returns null when no section on the path is CEFR-tagged', () => {
        const test = makeTest({ sections: [{ id: 'routing', title: 'Routing' }] });
        const st = makeStudentTest({ sectionPath: ['routing'] });
        expect(estimatePlacement(test, st)).toBeNull();
    });

    it('picks the highest passed tagged section on the path (routing -> hard, passed)', () => {
        const st = makeStudentTest({
            sectionPath: ['routing', 'hard'],
            answers: [
                { questionId: 'q-routing', response: 'right' },
                { questionId: 'q-hard', response: 'right' },
            ],
        });
        const result = estimatePlacement(makeTest(), st);
        expect(result?.level).toBe('B1');
        expect(result?.provisional).toBe(true);
        expect(result?.path.map((s) => s.sectionId)).toEqual(['routing', 'hard']);
    });

    it('routes to easy on a failed routing section and estimates its level when passed', () => {
        const st = makeStudentTest({
            sectionPath: ['routing', 'easy'],
            answers: [
                { questionId: 'q-routing', response: 'wrong' },
                { questionId: 'q-easy', response: 'right' },
            ],
        });
        const result = estimatePlacement(makeTest(), st);
        expect(result?.level).toBe('A1');
    });

    it('falls back to the lowest tagged level when nothing on the path was passed', () => {
        const st = makeStudentTest({
            sectionPath: ['routing', 'easy'],
            answers: [
                { questionId: 'q-routing', response: 'wrong' },
                { questionId: 'q-easy', response: 'wrong' },
            ],
        });
        const result = estimatePlacement(makeTest(), st);
        // routing (A2, failed) and easy (A1, failed via 60% default) -> lowest tagged = A1
        expect(result?.level).toBe('A1');
    });

    it('uses a 60% default threshold for a terminal section with no routing', () => {
        const test = makeTest();
        const passing = makeStudentTest({
            sectionPath: ['routing', 'hard'],
            answers: [
                { questionId: 'q-routing', response: 'right' },
                { questionId: 'q-hard', response: 'right' },
            ],
        });
        expect(estimatePlacement(test, passing)?.level).toBe('B1');

        const failingTerminal = makeStudentTest({
            sectionPath: ['routing', 'hard'],
            answers: [
                { questionId: 'q-routing', response: 'right' },
                { questionId: 'q-hard', response: 'wrong' },
            ],
        });
        // hard (B1) failed its 60% default -> only passed tagged step is routing (A2)
        expect(estimatePlacement(test, failingTerminal)?.level).toBe('A2');
    });

    it('includes untagged sections in the path but ignores them for the estimate', () => {
        const test = makeTest({
            sections: [
                {
                    id: 'routing',
                    title: 'Routing',
                    routing: { thresholdPct: 60, passSectionId: 'hard', failSectionId: 'easy' },
                },
                { id: 'easy', title: 'Easy', cefrLevel: 'A1' },
                { id: 'hard', title: 'Hard', cefrLevel: 'B1' },
            ],
        });
        const st = makeStudentTest({
            sectionPath: ['routing', 'easy'],
            answers: [
                { questionId: 'q-routing', response: 'right' },
                { questionId: 'q-easy', response: 'right' },
            ],
        });
        const result = estimatePlacement(test, st);
        expect(result?.level).toBe('A1');
        expect(result?.path.find((s) => s.sectionId === 'routing')?.level).toBeUndefined();
    });
});

describe('estimatePlacement — staircase engine', () => {
    const makeStaircaseTest = (): Test => ({
        id: 't-staircase',
        name: 'Staircase test',
        questions: [],
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        mode: 'placement',
        placementEngine: 'staircase',
        sections: [
            { id: 'sec-A2', title: 'A2 pool', cefrLevel: 'A2' },
            { id: 'sec-B1', title: 'B1 pool', cefrLevel: 'B1' },
        ],
    });

    it('returns null when there is no level path', () => {
        expect(estimatePlacement(makeStaircaseTest(), makeStudentTest())).toBeNull();
    });

    it('estimates the level the run ended on, not a highest-passed rule', () => {
        const st = makeStudentTest({
            levelPath: [
                { sectionId: 'sec-A2', level: 'A2', questionId: 'q1', correct: true },
                { sectionId: 'sec-A2', level: 'A2', questionId: 'q2', correct: true },
                { sectionId: 'sec-B1', level: 'B1', questionId: 'q3', correct: false },
            ],
        });
        const result = estimatePlacement(makeStaircaseTest(), st);
        expect(result?.level).toBe('A2');
        expect(result?.provisional).toBe(true);
        expect(result?.path).toHaveLength(3);
        expect(result?.path[2]).toEqual({ sectionId: 'sec-B1', title: 'B1 pool', level: 'B1', scorePct: 0 });
    });

    it('scores a correct step as 100% and an incorrect one as 0%', () => {
        const st = makeStudentTest({
            levelPath: [{ sectionId: 'sec-A2', level: 'A2', questionId: 'q1', correct: true }],
        });
        const result = estimatePlacement(makeStaircaseTest(), st);
        expect(result?.path[0].scorePct).toBe(100);
    });
});
