import { describe, it, expect } from 'vitest';
import type { Test } from '../types';
import { cloneTestForCopy } from './testClone';

const source: Test = {
    id: 't1',
    name: 'Quiz',
    questions: [
        {
            id: 'q1',
            type: 'multiple-choice',
            prompt: 'Pick',
            points: 1,
            options: [{ id: 'o1', text: 'A', isCorrect: true }],
        } as Test['questions'][number],
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    displayOrder: 2,
    folderId: 'f1',
    sharing: { visibility: 'school', access: 'edit' },
};

describe('cloneTestForCopy', () => {
    const copy = cloneTestForCopy(source, { name: 'Quiz (copy)' });

    it('drops identity, list position and sharing, and applies overrides', () => {
        expect(copy).not.toHaveProperty('id');
        expect(copy).not.toHaveProperty('createdAt');
        expect(copy).not.toHaveProperty('updatedAt');
        expect(copy).not.toHaveProperty('displayOrder');
        expect(copy).not.toHaveProperty('sharing');
        expect(copy.name).toBe('Quiz (copy)');
        expect(copy.folderId).toBe('f1');
    });

    it('gives questions and options fresh ids', () => {
        expect(copy.questions[0].id).not.toBe('q1');
        expect(copy.questions[0].options?.[0].id).not.toBe('o1');
        expect(copy.questions[0].options?.[0].text).toBe('A');
    });
});
