import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TouchStepper from '../TouchStepper';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

function renderStepper(overrides: Partial<Parameters<typeof TouchStepper>[0]> = {}) {
    const onChange = vi.fn();
    render(
        <TouchStepper
            value={3}
            min={0}
            max={10}
            step={1}
            accentColor="#3b82f6"
            onChange={onChange}
            label="score"
            {...overrides}
        />
    );
    return onChange;
}

describe('TouchStepper', () => {
    it('renders the value and both buttons', () => {
        renderStepper();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'gradeStudent.stepper_decrease' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'gradeStudent.stepper_increase' })).toBeInTheDocument();
    });

    it('increments on the plus button', () => {
        const onChange = renderStepper();
        fireEvent.click(screen.getByRole('button', { name: 'gradeStudent.stepper_increase' }));
        expect(onChange).toHaveBeenCalledWith(4);
    });

    it('decrements on the minus button', () => {
        const onChange = renderStepper();
        fireEvent.click(screen.getByRole('button', { name: 'gradeStudent.stepper_decrease' }));
        expect(onChange).toHaveBeenCalledWith(2);
    });

    it('disables and ignores clicks at the minimum', () => {
        const onChange = renderStepper({ value: 0 });
        const decrease = screen.getByRole('button', { name: 'gradeStudent.stepper_decrease' });
        expect(decrease).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(decrease);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('disables and ignores clicks at the maximum', () => {
        const onChange = renderStepper({ value: 10 });
        const increase = screen.getByRole('button', { name: 'gradeStudent.stepper_increase' });
        expect(increase).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(increase);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('clamps and snaps to the step', () => {
        const onChange = renderStepper({ value: 2, step: 5 });
        fireEvent.click(screen.getByRole('button', { name: 'gradeStudent.stepper_increase' }));
        expect(onChange).toHaveBeenCalledWith(5);
    });
});
