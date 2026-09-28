import { describe, it, expect } from 'vitest';
import type { Test, TestQuestion } from '../types';
import { examAnswerVocabulary } from './examScanVocabulary';

function q(overrides: Partial<TestQuestion> & Pick<TestQuestion, 'id' | 'type' | 'points' | 'prompt'>): TestQuestion {
    return { partialCredit: true, ...overrides };
}

function makeTest(overrides: Partial<Test> = {}): Test {
    return {
        id: 't1',
        name: 'Sample Test',
        questions: [],
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: new Date().toISOString(),
        ...overrides,
    };
}

describe('examAnswerVocabulary', () => {
    it('splits a short-answer expectedAnswer into individual words', () => {
        const test = makeTest({
            questions: [q({ id: 'a', type: 'short-answer', points: 1, prompt: 'P', expectedAnswer: 'photosynthesis' })],
        });
        expect(examAnswerVocabulary(test)).toEqual(['photosynthesis']);
    });

    it('prefers expectedAnswers over expectedAnswer and splits multi-word entries', () => {
        const test = makeTest({
            questions: [
                q({
                    id: 'a',
                    type: 'short-answer',
                    points: 1,
                    prompt: 'P',
                    expectedAnswer: 'ignored',
                    expectedAnswers: ['Isaac Newton', 'Newton'],
                }),
            ],
        });
        expect(examAnswerVocabulary(test)).toEqual(['Isaac', 'Newton', 'Newton']);
    });

    it('ignores question types with no fixed model answer to write out', () => {
        const test = makeTest({
            questions: [
                q({
                    id: 'a',
                    type: 'multiple-choice',
                    points: 1,
                    prompt: 'P',
                    options: [{ id: 'o1', text: 'Paris', isCorrect: true }],
                }),
                q({ id: 'b', type: 'open', points: 1, prompt: 'P' }),
                q({ id: 'c', type: 'numeric', points: 1, prompt: 'P', expectedNumericValue: 42 }),
            ],
        });
        expect(examAnswerVocabulary(test)).toEqual([]);
    });

    it('returns [] for a test with no questions', () => {
        expect(examAnswerVocabulary(makeTest())).toEqual([]);
    });

    it('drops empty tokens from blank or padded answers', () => {
        const test = makeTest({
            questions: [
                q({
                    id: 'a',
                    type: 'short-answer',
                    points: 1,
                    prompt: 'P',
                    expectedAnswers: ['   ', '  Newton  ', ''],
                }),
            ],
        });
        expect(examAnswerVocabulary(test)).toEqual(['Newton']);
    });
});
