import { describe, expect, it } from 'vitest';
import { pickedOptionFeedback } from './optionFeedback';

const options = [
    { id: 'a', text: 'Paris', isCorrect: true, feedback: 'Capital of France.' },
    { id: 'b', text: 'Lyon', isCorrect: false, feedback: '  Big, but not the capital. ' },
    { id: 'c', text: 'Nice', isCorrect: false },
];

describe('pickedOptionFeedback', () => {
    it('returns the feedback of the single picked option', () => {
        expect(pickedOptionFeedback({ type: 'multiple-choice', options }, 'b')).toEqual([
            { text: 'Lyon', feedback: 'Big, but not the capital.' },
        ]);
    });

    it('skips picked options without feedback and unanswered questions', () => {
        expect(pickedOptionFeedback({ type: 'multiple-choice', options }, 'c')).toEqual([]);
        expect(pickedOptionFeedback({ type: 'multiple-choice', options }, '')).toEqual([]);
    });

    it('collects feedback for every picked option of a multiple-response question', () => {
        expect(pickedOptionFeedback({ type: 'multiple-response', options }, '["a","b","c"]')).toHaveLength(2);
    });

    it('survives malformed responses and other question types', () => {
        expect(pickedOptionFeedback({ type: 'multiple-response', options }, 'not json')).toEqual([]);
        expect(pickedOptionFeedback({ type: 'multiple-response', options }, '{"a":1}')).toEqual([]);
        expect(pickedOptionFeedback({ type: 'short-answer', options }, 'a')).toEqual([]);
    });
});
