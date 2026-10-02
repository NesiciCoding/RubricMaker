import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import type { Test } from '../../../types';
import TestA4Preview from '../TestA4Preview';

const test: Test = {
    id: 't1',
    name: 'Unit quiz',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [
        {
            id: 'q1',
            type: 'multiple-choice',
            points: 2,
            prompt: 'Capital of France?',
            partialCredit: true,
            options: [
                { id: 'o1', text: 'Paris', isCorrect: true },
                { id: 'o2', text: 'Berlin', isCorrect: false },
            ],
        },
    ],
};

describe('TestA4Preview', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('renders an A4 page with the questions after the debounce', () => {
        render(<TestA4Preview test={test} onChange={vi.fn()} />);
        act(() => {
            vi.advanceTimersByTime(300);
        });
        const page = screen.getByTestId('a4-page');
        expect(page).toHaveTextContent('Unit quiz');
        expect(page).toHaveTextContent('Capital of France?');
    });

    it('toggles the answer key and the point values', () => {
        render(<TestA4Preview test={test} onChange={vi.fn()} />);
        const page = screen.getByTestId('a4-page');
        expect(page).toHaveTextContent('2 pts');
        fireEvent.click(screen.getByLabelText('Points'));
        expect(page).not.toHaveTextContent('2 pts');
        expect(page.innerHTML).not.toContain('#16a34a');
        fireEvent.click(screen.getByLabelText('Answer key'));
        expect(page.innerHTML).toContain('#16a34a');
    });

    it('offers editable header, instructions and footer on the page', () => {
        render(<TestA4Preview test={{ ...test, printIntro: '<p>Read well</p>' }} onChange={vi.fn()} />);
        expect(screen.getByTestId('a4-printHeader')).toBeInTheDocument();
        expect(screen.getByTestId('a4-printIntro')).toHaveTextContent('Read well');
        expect(screen.getByTestId('a4-printFooter')).toBeInTheDocument();
    });
});
