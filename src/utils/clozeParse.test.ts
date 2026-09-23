import { describe, it, expect } from 'vitest';
import { renderClozeSegments, plainQuestionPromptText } from './clozeParse';

describe('renderClozeSegments', () => {
    it('returns a single text segment for plain text', () => {
        const result = renderClozeSegments('Hello world');
        expect(result).toEqual([{ type: 'text', text: 'Hello world' }]);
    });

    it('parses a single cloze gap', () => {
        const result = renderClozeSegments('The capital of France is {{Paris}}.');
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ type: 'text', text: 'The capital of France is ' });
        expect(result[1]).toEqual({ type: 'gap', gap: { index: 0, alternatives: ['Paris'] } });
        expect(result[2]).toEqual({ type: 'text', text: '.' });
    });

    it('parses multiple gaps with alternatives', () => {
        const result = renderClozeSegments('{{Paris|Lyon}} and {{Berlin|Munich}}');
        expect(result).toHaveLength(3);
        const gap1 = result[0] as Extract<(typeof result)[0], { type: 'gap' }>;
        const gap2 = result[2] as Extract<(typeof result)[0], { type: 'gap' }>;
        expect(gap1.gap.alternatives).toEqual(['Paris', 'Lyon']);
        expect(gap2.gap.index).toBe(1);
        expect(gap2.gap.alternatives).toEqual(['Berlin', 'Munich']);
    });

    it('returns empty array for empty string', () => {
        const result = renderClozeSegments('');
        expect(result).toEqual([]);
    });

    it('handles a gap at the start with trailing text', () => {
        const result = renderClozeSegments('{{Yes}} or no');
        expect(result[0]).toEqual({ type: 'gap', gap: { index: 0, alternatives: ['Yes'] } });
        expect(result[1]).toEqual({ type: 'text', text: ' or no' });
    });
});

describe('plainQuestionPromptText', () => {
    it('flattens cloze gaps to their correct answer', () => {
        expect(plainQuestionPromptText({ type: 'cloze', prompt: 'The {{cat|dog}} sat on the {{mat}}.' })).toBe(
            'The cat sat on the mat.'
        );
    });

    it('flattens cloze-dropdown gaps the same way as cloze', () => {
        expect(plainQuestionPromptText({ type: 'cloze-dropdown', prompt: 'Pick {{correct|wrong}}.' })).toBe(
            'Pick correct.'
        );
    });

    it('leaves a hot-text prompt untouched — its [[...]] syntax lives in hotTextPassage, not prompt', () => {
        expect(plainQuestionPromptText({ type: 'hot-text', prompt: 'Select the verbs' })).toBe('Select the verbs');
    });

    it('returns the prompt untouched for every other question type', () => {
        expect(plainQuestionPromptText({ type: 'multiple-choice', prompt: '<p>Pick one</p>' })).toBe('<p>Pick one</p>');
    });
});
