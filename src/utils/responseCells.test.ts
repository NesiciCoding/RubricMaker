import { describe, it, expect } from 'vitest';
import { cellState, isAnswered, isPresented, studentCompletion } from './responseCells';
import type { TestQuestion } from '../types';

const mc = (id: string, sectionId?: string): TestQuestion => ({
    id,
    type: 'multiple-choice',
    points: 1,
    prompt: id,
    sectionId,
    options: [
        { id: 'a', text: 'Wrong', isCorrect: false },
        { id: 'b', text: 'Right', isCorrect: true },
    ],
});

describe('responseCells', () => {
    it('classifies multiple-choice cells', () => {
        expect(cellState(mc('q'), undefined)).toBe('empty');
        expect(cellState(mc('q'), { questionId: 'q', response: 'b' })).toBe('correct');
        expect(cellState(mc('q'), { questionId: 'q', response: 'a' })).toBe('incorrect');
    });

    it('ignores pointsEarned when judging whether a structured answer is empty', () => {
        const matching: TestQuestion = { id: 'm', type: 'matching', points: 2, prompt: 'Match' };
        expect(isAnswered(matching, { questionId: 'm', response: '{}', pointsEarned: 0 })).toBe(false);
    });

    it('only presents questions on the routed section path', () => {
        expect(isPresented(mc('q', 's1'), undefined)).toBe(true);
        expect(isPresented(mc('q', 's1'), ['s1'])).toBe(true);
        expect(isPresented(mc('q', 's2'), ['s1'])).toBe(false);
        expect(isPresented(mc('q'), ['s1'])).toBe(true);
    });

    it('summarises answered count and correctness over presented questions', () => {
        const test = { questions: [mc('q1', 's1'), mc('q2', 's1'), mc('q3', 's1'), mc('q4', 's2')] };
        const c = studentCompletion(
            test,
            [
                { questionId: 'q1', response: 'b' },
                { questionId: 'q2', response: 'a' },
                { questionId: 'q4', response: 'b' },
            ],
            ['s1']
        );
        expect(c).toEqual({ answered: 2, total: 3, correctPct: 50 });
    });

    it('leaves correctness undefined when nothing is answered', () => {
        expect(studentCompletion({ questions: [mc('q1')] }, [])).toEqual({
            answered: 0,
            total: 1,
            correctPct: undefined,
        });
    });
});
