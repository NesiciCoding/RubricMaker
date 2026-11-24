import { describe, expect, it } from 'vitest';
import type { TestAnswer, TestQuestion } from '../types';
import { answeredQuestionIds, stuckQuestions } from './questionStuck';

const QUESTIONS = ['q1', 'q2', 'q3', 'q4'];

function answers(...ids: string[]): Set<string> {
    return new Set(ids);
}

describe('stuckQuestions', () => {
    it('counts a question the class reached but left blank', () => {
        const byStudent = new Map([
            ['s1', answers('q1', 'q3', 'q4')],
            ['s2', answers('q1', 'q3', 'q4')],
            ['s3', answers('q1', 'q3', 'q4')],
            ['s4', answers('q1', 'q2', 'q3', 'q4')],
        ]);

        expect(stuckQuestions(QUESTIONS, byStudent)).toEqual([{ questionId: 'q2', index: 2, reached: 3, asked: 4 }]);
    });

    it('does not count a question nobody got past', () => {
        const byStudent = new Map([
            ['s1', answers('q1')],
            ['s2', answers('q1')],
            ['s3', answers('q1')],
        ]);

        expect(stuckQuestions(QUESTIONS, byStudent)).toEqual([]);
    });

    it('stays quiet while the cohort is too small for a pattern', () => {
        const byStudent = new Map([
            ['s1', answers('q1', 'q4')],
            ['s2', answers('q1', 'q4')],
        ]);

        expect(stuckQuestions(QUESTIONS, byStudent)).toEqual([]);
    });

    it('ignores a single skip in a large class (share threshold)', () => {
        const byStudent = new Map(
            Array.from(
                { length: 20 },
                (_, i) => [`s${i}`, i === 0 ? answers('q1', 'q3', 'q4') : answers('q1', 'q2', 'q3', 'q4')] as const
            )
        );

        expect(stuckQuestions(QUESTIONS, byStudent)).toEqual([]);
    });

    it('orders the worst question first and ignores blank students', () => {
        const byStudent = new Map([
            ['s1', answers('q4')],
            ['s2', answers('q3', 'q4')],
            ['s3', answers('q2', 'q3', 'q4')],
            ['s4', answers('q3', 'q4')],
            ['s5', answers()],
        ]);

        expect(
            stuckQuestions(QUESTIONS, byStudent, { minReached: 1, minShare: 0 }).map((q) => [q.index, q.reached])
        ).toEqual([
            [1, 4],
            [2, 3],
            [3, 1],
        ]);
    });

    it('reports the cohort it measured so the caller can say "of 30"', () => {
        const byStudent = new Map([
            ['s1', answers('q1', 'q4')],
            ['s2', answers('q1', 'q4')],
            ['s3', answers('q1', 'q4')],
        ]);

        expect(stuckQuestions(QUESTIONS, byStudent, { minShare: 0 })[0].asked).toBe(3);
    });
});

describe('answeredQuestionIds', () => {
    const question = (id: string) => ({ id, type: 'short_answer', points: 1 }) as unknown as TestQuestion;
    const answer = (questionId: string, response: string) => ({ questionId, response }) as unknown as TestAnswer;

    it('does not count a kept snapshot key whose response was cleared', () => {
        const answered = answeredQuestionIds(
            [question('q1'), question('q2'), question('q3')],
            [answer('q1', 'yes'), answer('q2', ''), answer('q3', 'no'), answer('gone', 'x')]
        );

        expect([...answered].sort()).toEqual(['q1', 'q3']);
    });

    it('lets a cleared answer surface the question as stuck', () => {
        const questions = [question('q1'), question('q2'), question('q3')];
        const student = () => answeredQuestionIds(questions, [answer('q1', 'a'), answer('q2', ''), answer('q3', 'c')]);
        const byStudent = new Map([
            ['s1', student()],
            ['s2', student()],
            ['s3', student()],
        ]);

        expect(stuckQuestions(['q1', 'q2', 'q3'], byStudent).map((q) => q.questionId)).toEqual(['q2']);
    });
});
