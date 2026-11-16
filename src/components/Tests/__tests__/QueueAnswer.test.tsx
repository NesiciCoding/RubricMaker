import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import QueueAnswer from '../QueueAnswer';
import type { TestQuestion } from '../../../types';

const cloze: TestQuestion = {
    id: 'cloze',
    type: 'cloze',
    prompt: 'She {{has been}} waiting for {{two}} hours.',
    points: 2,
};

const builder: TestQuestion = {
    id: 'builder',
    type: 'sentence-builder',
    prompt: 'Put the words in order.',
    points: 2,
    sentenceTargets: ['She [has been] waiting.'],
};

function pills(container: HTMLElement): (string | null)[] {
    return [...container.querySelectorAll('div > span')].map((el) => el.textContent);
}

describe('QueueAnswer', () => {
    it('fills cloze gaps with the student answers instead of the stored JSON', () => {
        const { container } = render(
            <QueueAnswer question={cloze} response={JSON.stringify({ 0: 'has been', 1: 'two' })} />
        );
        expect(container.textContent).toBe('She has been waiting for two hours.');
        expect(container.textContent).not.toContain('{');
    });

    it('shows a blank pill for an unanswered cloze gap', () => {
        const { container } = render(<QueueAnswer question={cloze} response={JSON.stringify({ 0: 'has been' })} />);
        expect(container.textContent).toBe('She has been waiting for ___ hours.');
    });

    it('shows the cloze alternatives as the model answer', () => {
        const { container } = render(<QueueAnswer question={cloze} />);
        expect(container.textContent).toBe('She has been waiting for two hours.');
    });

    it('renders sentence-builder tiles as pills instead of the stored JSON array', () => {
        const { container } = render(
            <QueueAnswer question={builder} response={JSON.stringify(['waiting.', 'She', 'has been'])} />
        );
        expect(pills(container)).toEqual(['waiting.', 'She', 'has been']);
        expect(container.textContent).not.toContain('[');
    });

    it('renders the target sentence as the model answer', () => {
        const { container } = render(<QueueAnswer question={builder} />);
        expect(pills(container)).toEqual(['She', 'has been', 'waiting.']);
    });

    it('shows a blank pill when the sentence builder response holds no tiles', () => {
        const { container } = render(<QueueAnswer question={builder} response="" />);
        expect(pills(container)).toEqual(['___']);
    });

    it('shows a teacher-written model answer for a type without a formatted correction', () => {
        const openQuestion: TestQuestion = {
            id: 'open',
            type: 'open',
            prompt: 'Explain why.',
            points: 5,
            expectedAnswer: '<p>Because it rained.</p>',
        };
        const { container } = render(<QueueAnswer question={openQuestion} />);
        expect(container.textContent).toBe('Because it rained.');
    });

    it('falls back to the shared formatters for the other question types', () => {
        const shortAnswer: TestQuestion = {
            id: 'sa',
            type: 'short-answer',
            prompt: 'Capital of France?',
            points: 1,
            expectedAnswers: ['Paris', 'paris'],
        };
        const { container, unmount } = render(<QueueAnswer question={shortAnswer} response="Paris" />);
        expect(container.textContent).toBe('Paris');
        unmount();
        const { container: model } = render(<QueueAnswer question={shortAnswer} />);
        expect(model.textContent).toBe('Paris / paris');
    });
});
