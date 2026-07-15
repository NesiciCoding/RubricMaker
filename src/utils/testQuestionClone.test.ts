import { describe, it, expect } from 'vitest';
import { cloneQuestionWithFreshIds } from './testQuestionClone';
import type { TestQuestion } from '../types';

describe('cloneQuestionWithFreshIds', () => {
    const base: TestQuestion = {
        id: 'q1',
        prompt: 'Pick one',
        type: 'multiple-choice',
        points: 1,
        sectionId: 's1',
        options: [
            { id: 'o1', text: 'A', isCorrect: true },
            { id: 'o2', text: 'B', isCorrect: false },
        ],
    };

    it('regenerates the question id and strips sectionId', () => {
        const clone = cloneQuestionWithFreshIds(base);
        expect(clone.id).not.toBe(base.id);
        expect(clone.sectionId).toBeUndefined();
    });

    it('regenerates option ids without changing their content', () => {
        const clone = cloneQuestionWithFreshIds(base);
        expect(clone.options).toHaveLength(2);
        expect(clone.options![0].id).not.toBe('o1');
        expect(clone.options![0].text).toBe('A');
        expect(clone.options![0].isCorrect).toBe(true);
        // Two clones of the same bank item must not collide with each other.
        const clone2 = cloneQuestionWithFreshIds(base);
        expect(clone.options![0].id).not.toBe(clone2.options![0].id);
    });

    it('remaps categorize item categoryId references to the new category ids', () => {
        const categorize: TestQuestion = {
            id: 'q2',
            prompt: 'Sort these',
            type: 'categorize',
            points: 2,
            categories: [
                { id: 'catA', label: 'Animals' },
                { id: 'catB', label: 'Plants' },
            ],
            categorizeItems: [
                { id: 'i1', text: 'Dog', categoryId: 'catA' },
                { id: 'i2', text: 'Tree', categoryId: 'catB' },
            ],
        };
        const clone = cloneQuestionWithFreshIds(categorize);
        const newCatAId = clone.categories![0].id;
        const newCatBId = clone.categories![1].id;
        expect(newCatAId).not.toBe('catA');
        expect(clone.categorizeItems![0].categoryId).toBe(newCatAId);
        expect(clone.categorizeItems![1].categoryId).toBe(newCatBId);
    });
});
