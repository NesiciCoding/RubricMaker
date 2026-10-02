import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TestQuestion } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    }),
}));

import ErrorCorrectionFields from '../ErrorCorrectionFields';

const base = {
    id: 'q1',
    prompt: '',
    type: 'error-correction',
    points: 2,
    errorPassage: 'He [[go|goes]] to school [[every]] day.',
} as TestQuestion;

const setup = (question: Partial<TestQuestion> = {}) => {
    const update = vi.fn();
    render(<ErrorCorrectionFields question={{ ...base, ...question }} update={update} partialCreditToggle={null} />);
    return update;
};

describe('ErrorCorrectionFields', () => {
    it('shows the passage as coloured fragments with the accepted correction', () => {
        setup();
        const pills = document.querySelectorAll('.error-fragment-pill');
        expect(pills).toHaveLength(2);
        expect(pills[0]).toHaveClass('error');
        expect(pills[0]).toHaveTextContent('go→ goes');
        expect(pills[1]).toHaveClass('fine');
        expect(screen.getByText(/tests.error_passage_summary.*"errors":1/)).toBeInTheDocument();
    });

    it('keeps the raw [[wrong|right]] textarea behind the text toggle', () => {
        const update = setup();
        fireEvent.click(screen.getByRole('button', { name: 'tests.edit_as_text' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'She [[go|goes]] home.' } });
        expect(update).toHaveBeenLastCalledWith({ errorPassage: 'She [[go|goes]] home.' });
    });

    it('saves corrections edited in the pill popover', () => {
        const update = setup();
        fireEvent.click(document.querySelector('.error-fragment-pill.error') as HTMLElement);
        const popover = document.querySelector('.error-fragment-popover') as HTMLElement;
        const inputs = popover.querySelectorAll<HTMLInputElement>('.error-fragment-popover-row input');
        fireEvent.change(inputs[0], { target: { value: 'went' } });
        fireEvent.click(popover.querySelector('.error-fragment-popover-save') as HTMLElement);
        expect(update).toHaveBeenLastCalledWith({ errorPassage: 'He [[go|went]] to school [[every]] day.' });
    });
});
