import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_RECORDING_SECONDS, questionDefaultsFor } from './questionTypeDefaults';
import { newQuestion } from './testQuestionClone';

describe('questionDefaultsFor', () => {
    it('gives option-based types two empty options with one marked correct', () => {
        for (const type of ['multiple-choice', 'multiple-response'] as const) {
            const { options } = questionDefaultsFor(type);
            expect(options).toHaveLength(2);
            expect(options?.filter((o) => o.isCorrect)).toHaveLength(1);
            expect(options?.[0].id).not.toBe(options?.[1].id);
        }
    });

    it('seeds the lists the type-specific editors read from', () => {
        expect(questionDefaultsFor('true-false')).toEqual({ correctBoolean: true });
        expect(questionDefaultsFor('matching').matchingPairs).toHaveLength(2);
        expect(questionDefaultsFor('ordering').orderItems).toHaveLength(2);
        expect(questionDefaultsFor('hot-text')).toEqual({ hotTextPassage: '', hotTextCorrectIndices: [] });
        expect(questionDefaultsFor('audio-response')).toEqual({ maxRecordingSeconds: DEFAULT_MAX_RECORDING_SECONDS });

        const matrix = questionDefaultsFor('matrix');
        expect(matrix.matrixColumns).toHaveLength(2);
        expect(matrix.matrixRows).toHaveLength(2);
        // Rows must point at a column that exists in the same patch, or the editor renders a
        // statement with no selected column.
        expect(matrix.matrixRows?.every((r) => r.correctColumnId === matrix.matrixColumns?.[0].id)).toBe(true);

        const categorize = questionDefaultsFor('categorize');
        expect(categorize.categories).toHaveLength(2);
        expect(categorize.categorizeItems?.every((i) => i.categoryId === categorize.categories?.[0].id)).toBe(true);
    });

    it('leaves types that need no starter list empty', () => {
        expect(questionDefaultsFor('open')).toEqual({});
        expect(questionDefaultsFor('cloze-bank')).toEqual({});
        expect(questionDefaultsFor('numeric')).toEqual({});
    });

    it('creates a question of the chosen type in the chosen section', () => {
        const question = newQuestion('sec-1', 'matching');
        expect(question.type).toBe('matching');
        expect(question.sectionId).toBe('sec-1');
        expect(question.prompt).toBe('');
        expect(question.points).toBe(1);
        expect(question.matchingPairs).toHaveLength(2);
        // The multiple-choice starter options must not leak into a type that has no options.
        expect(question.options).toBeUndefined();
    });

    it('keeps the old multiple-choice default when no type is passed', () => {
        const question = newQuestion();
        expect(question.type).toBe('multiple-choice');
        expect(question.sectionId).toBeUndefined();
        expect(question.options).toHaveLength(2);
    });
});
