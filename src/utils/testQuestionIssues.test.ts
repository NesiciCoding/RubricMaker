import { describe, it, expect } from 'vitest';
import { testQuestionIssues, testIssues, testAssignBlockers } from './testQuestionIssues';
import type { TestQuestion } from '../types';

const q = (patch: Partial<TestQuestion>): TestQuestion => ({
    id: 'q',
    prompt: 'Pick one',
    type: 'multiple-choice',
    points: 1,
    ...patch,
});
const opt = (text: string, isCorrect = false) => ({ id: text || Math.random().toString(), text, isCorrect });

describe('testQuestionIssues (#702)', () => {
    it('flags the default new multiple-choice question: empty prompt and empty options', () => {
        const issues = testQuestionIssues(q({ prompt: '<p></p>', options: [opt('', true), opt('')] }));
        expect(issues).toEqual(['empty_prompt', 'too_few_options', 'empty_option']);
    });

    it('accepts a complete multiple-choice question and an image-only option', () => {
        const options = [opt('Yes', true), { ...opt(''), imageUrl: 'data:image/png;base64,x' }];
        expect(testQuestionIssues(q({ options }))).toEqual([]);
    });

    it('requires a correct option for multiple response', () => {
        expect(testQuestionIssues(q({ type: 'multiple-response', options: [opt('a'), opt('b')] }))).toEqual([
            'no_correct_option',
        ]);
    });

    it('requires gaps with answers in cloze questions, without needing other prompt text', () => {
        expect(testQuestionIssues(q({ type: 'cloze', prompt: 'No gaps here' }))).toEqual(['no_gaps']);
        expect(testQuestionIssues(q({ type: 'cloze-dropdown', prompt: 'A {{}} gap' }))).toEqual(['empty_gap']);
        expect(testQuestionIssues(q({ type: 'cloze-bank', prompt: '{{cat|dog}}' }))).toEqual([]);
    });

    it('checks matrix statements and columns', () => {
        const columns = [
            { id: 't', text: 'True' },
            { id: 'f', text: 'False' },
        ];
        expect(testQuestionIssues(q({ type: 'matrix', matrixColumns: columns, matrixRows: [] }))).toEqual([
            'no_statements',
        ]);
        expect(
            testQuestionIssues(
                q({
                    type: 'matrix',
                    matrixColumns: [columns[0]],
                    matrixRows: [{ id: 'r', text: '', correctColumnId: 't' }],
                })
            )
        ).toEqual(['empty_statement', 'too_few_columns']);
    });

    it('needs a marked error in error correction and a correct fragment in hot text', () => {
        expect(testQuestionIssues(q({ type: 'error-correction', errorPassage: 'All [[fine]] here' }))).toEqual([
            'no_errors',
        ]);
        expect(testQuestionIssues(q({ type: 'error-correction', errorPassage: 'He [[go|goes]] home' }))).toEqual([]);
        expect(testQuestionIssues(q({ type: 'hot-text', hotTextPassage: 'plain' }))).toEqual(['no_fragments']);
        expect(
            testQuestionIssues(q({ type: 'hot-text', hotTextPassage: '[[a]] [[b]]', hotTextCorrectIndices: [5] }))
        ).toEqual(['no_correct_fragment']);
    });

    it('checks the answer data of the remaining scored types', () => {
        expect(testQuestionIssues(q({ type: 'sentence-builder', sentenceTargets: ['Hello'] }))).toEqual([
            'no_target_sentence',
        ]);
        expect(testQuestionIssues(q({ type: 'key-word-transformation' }))).toEqual(['no_key_word', 'no_model_answer']);
        expect(testQuestionIssues(q({ type: 'dictation', prompt: '' }))).toEqual(['no_model_answer']);
        expect(testQuestionIssues(q({ type: 'matching', matchingPairs: [{ id: 'p', left: 'a', right: '' }] }))).toEqual(
            ['too_few_pairs', 'empty_pair']
        );
        expect(testQuestionIssues(q({ type: 'ordering', orderItems: [{ id: 'o', text: 'x' }] }))).toEqual([
            'too_few_items',
        ]);
        expect(
            testQuestionIssues(
                q({
                    type: 'categorize',
                    categories: [
                        { id: 'a', label: 'A' },
                        { id: 'b', label: 'B' },
                    ],
                    categorizeItems: [{ id: 'i', text: 'x', categoryId: 'gone' }],
                })
            )
        ).toEqual(['empty_item']);
        expect(testQuestionIssues(q({ type: 'numeric' }))).toEqual(['no_numeric_answer']);
        expect(testQuestionIssues(q({ type: 'numeric', expectedNumericValue: 0 }))).toEqual([]);
    });

    it('only needs a prompt for teacher-scored types', () => {
        expect(testQuestionIssues(q({ type: 'open' }))).toEqual([]);
        expect(testQuestionIssues(q({ type: 'short-answer', prompt: ' ' }))).toEqual(['empty_prompt']);
    });
});

describe('testIssues / testAssignBlockers (#702)', () => {
    const good = q({ id: 'good', options: [opt('a', true), opt('b')] });
    const bad = q({ id: 'bad', type: 'numeric' });

    it('numbers incomplete questions in order', () => {
        expect(testIssues([good, bad])).toEqual([{ number: 2, questionId: 'bad', issues: ['no_numeric_answer'] }]);
    });

    it('blocks an empty test but not a placement generator, which draws from the bank', () => {
        expect(testAssignBlockers({ questions: [], mode: 'assessment' })).toEqual({ noQuestions: true, entries: [] });
        expect(testAssignBlockers({ questions: [bad], mode: 'placement', placementEngine: 'generator' })).toEqual({
            noQuestions: false,
            entries: [],
        });
    });
});
