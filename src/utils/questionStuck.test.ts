import { describe, expect, it } from 'vitest';
import { stuckQuestions } from './questionStuck';

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
