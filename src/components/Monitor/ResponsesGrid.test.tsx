import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ResponsesGrid from './ResponsesGrid';
import type { Test } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (opts && 'index' in opts) return `${key} ${opts.index}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

const mockTest: Test = {
    id: 'test-1',
    name: 'Quiz',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [
        {
            id: 'q1',
            prompt: 'Pick the capital of France',
            type: 'multiple-choice',
            points: 1,
            options: [
                { id: 'a', text: 'Paris', isCorrect: true },
                { id: 'b', text: 'Lyon', isCorrect: false },
            ],
        },
        {
            id: 'q2',
            prompt: 'What is 2+2?',
            type: 'short-answer',
            points: 1,
            expectedAnswer: '4',
        },
        {
            id: 'q3',
            prompt: 'Explain your reasoning',
            type: 'open',
            points: 2,
        },
    ],
};

describe('ResponsesGrid', () => {
    it('renders a row per student and a column per question', () => {
        render(
            <ResponsesGrid
                test={mockTest}
                rows={[
                    { studentId: 's1', displayName: 'Alice', answers: [] },
                    { studentId: 's2', displayName: 'Bob', answers: [] },
                ]}
            />
        );

        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('tests.monitor.grid.question_short 1')).toBeInTheDocument();
        expect(screen.getByText('tests.monitor.grid.question_short 2')).toBeInTheDocument();
    });

    it('marks a correct multiple-choice answer and an incorrect short-answer answer', () => {
        render(
            <ResponsesGrid
                test={mockTest}
                rows={[
                    {
                        studentId: 's1',
                        displayName: 'Alice',
                        answers: [
                            { questionId: 'q1', response: 'a' }, // correct option
                            { questionId: 'q2', response: '5' }, // wrong vs expectedAnswer '4'
                        ],
                    },
                ]}
            />
        );

        expect(screen.getByTitle('tests.monitor.grid.state.correct')).toBeInTheDocument();
        expect(screen.getByTitle('tests.monitor.grid.state.incorrect')).toBeInTheDocument();
    });

    it('marks an empty answer as empty and an answered open question as ungraded (pending manual scoring)', () => {
        render(
            <ResponsesGrid
                test={mockTest}
                rows={[
                    {
                        studentId: 's1',
                        displayName: 'Alice',
                        answers: [
                            { questionId: 'q1', response: '' },
                            { questionId: 'q3', response: 'Because Paris is the capital.' },
                        ],
                    },
                ]}
            />
        );

        expect(screen.getAllByTitle('tests.monitor.grid.state.empty').length).toBeGreaterThan(0);
        expect(screen.getByTitle('tests.monitor.grid.state.ungraded')).toBeInTheDocument();
    });

    it('opens a gallery modal with every student answer when a question header is clicked', () => {
        render(
            <ResponsesGrid
                test={mockTest}
                rows={[
                    {
                        studentId: 's1',
                        displayName: 'Alice',
                        answers: [{ questionId: 'q1', response: 'a' }],
                    },
                    {
                        studentId: 's2',
                        displayName: 'Bob',
                        answers: [{ questionId: 'q1', response: 'b' }],
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByText('tests.monitor.grid.question_short 1'));

        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        // Multiple-choice answers are shown by their option text, not the raw option id.
        expect(screen.getByText('Paris')).toBeInTheDocument();
        expect(screen.getByText('Lyon')).toBeInTheDocument();
    });

    it('shows the no-answer placeholder in the gallery for a student without a response', () => {
        render(<ResponsesGrid test={mockTest} rows={[{ studentId: 's1', displayName: 'Alice', answers: [] }]} />);

        fireEvent.click(screen.getByText('tests.monitor.grid.question_short 1'));

        expect(screen.getByText('tests.monitor.grid.no_answer')).toBeInTheDocument();
    });
});
