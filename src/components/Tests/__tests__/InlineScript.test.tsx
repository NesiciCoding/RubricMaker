import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import type { TestQuestion } from '../../../types';
import { formatCorrectAnswer, formatGivenAnswer } from '../../../utils/testAnswerText';
import StudentAnswerSurface from '../StudentAnswerSurface';

const mc: TestQuestion = {
    id: 'q',
    type: 'multiple-choice',
    prompt: 'p',
    points: 1,
    options: [
        { id: 'a', text: 'H_{2}O', isCorrect: true },
        { id: 'b', text: 'snake_case', isCorrect: false },
    ],
};

describe('sub- and superscript in option text', () => {
    it('shows real subscript to students and leaves ordinary text alone', () => {
        const { container } = render(<StudentAnswerSurface question={mc} value="" onChange={vi.fn()} code="c" />);
        expect(container.querySelector('sub')?.textContent).toBe('2');
        expect(screen.getByText('snake_case')).toBeInTheDocument();
    });

    it('uses Unicode scripts in the given and correct answer text', () => {
        expect(formatCorrectAnswer(mc)).toBe('H₂O');
        expect(formatGivenAnswer(mc, { questionId: 'q', response: 'a' })).toBe('H₂O');
    });

    it('keeps matching dropdown choices readable as plain text', () => {
        const matching: TestQuestion = {
            id: 'm',
            type: 'matching',
            prompt: 'p',
            points: 1,
            matchingPairs: [{ id: 'p1', left: 'Water', right: 'H_{2}O' }],
        };
        render(<StudentAnswerSurface question={matching} value="" onChange={vi.fn()} code="c" />);
        expect(screen.getByRole('option', { name: 'H₂O' })).toBeInTheDocument();
    });
});
