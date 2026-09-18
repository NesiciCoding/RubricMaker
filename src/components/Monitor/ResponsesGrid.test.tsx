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

    it('scores a true-false question correctly', () => {
        const tfTest: Test = {
            ...mockTest,
            questions: [
                {
                    id: 'q-tf',
                    prompt: 'The sky is blue',
                    type: 'true-false',
                    points: 1,
                    expectedAnswer: 'true',
                },
            ],
        };
        render(
            <ResponsesGrid
                test={tfTest}
                rows={[
                    { studentId: 's1', displayName: 'Alice', answers: [{ questionId: 'q-tf', response: 'true' }] },
                    { studentId: 's2', displayName: 'Bob', answers: [{ questionId: 'q-tf', response: 'false' }] },
                ]}
            />
        );
        expect(screen.getByTitle('tests.monitor.grid.state.correct')).toBeInTheDocument();
        expect(screen.getByTitle('tests.monitor.grid.state.incorrect')).toBeInTheDocument();
    });

    it('closes the gallery by clicking the close button', () => {
        render(<ResponsesGrid test={mockTest} rows={[{ studentId: 's1', displayName: 'Alice', answers: [] }]} />);
        fireEvent.click(screen.getByText('tests.monitor.grid.question_short 1'));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('stops propagation when clicking inside the gallery dialog content', () => {
        render(<ResponsesGrid test={mockTest} rows={[{ studentId: 's1', displayName: 'Alice', answers: [] }]} />);
        fireEvent.click(screen.getByText('tests.monitor.grid.question_short 1'));
        const dialog = screen.getByRole('dialog');
        // Clicking inside the content area should NOT close the dialog.
        fireEvent.click(dialog.querySelector('div')!);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('shows a totals column and a class-average row', () => {
        render(
            <ResponsesGrid
                test={{ ...mockTest, questions: mockTest.questions.slice(0, 2) }}
                rows={[
                    {
                        studentId: 's1',
                        displayName: 'Alice',
                        answers: [
                            { questionId: 'q1', response: 'a' }, // correct
                            { questionId: 'q2', response: '4' }, // correct
                        ],
                    },
                ]}
            />
        );
        expect(screen.getByText('tests.monitor.grid.totals')).toBeInTheDocument();
        expect(screen.getByText('tests.monitor.grid.average')).toBeInTheDocument();
        // The student's own total cell and the class-average row's total cell must each read 100%,
        // not just the per-question averages.
        const studentTotalCell = screen.getByText('Alice').closest('tr')!.querySelectorAll('td')[1];
        expect(studentTotalCell).toHaveTextContent('100%');
        const avgTotalCell = screen.getByText('tests.monitor.grid.average').closest('tr')!.querySelectorAll('td')[1];
        expect(avgTotalCell).toHaveTextContent('100%');
    });

    it('groups students by class id under a collapsible header and hides rows when collapsed', () => {
        render(
            <ResponsesGrid
                test={mockTest}
                rows={[
                    { studentId: 's1', displayName: 'Alice', classId: 'c1', className: '2C', answers: [] },
                    { studentId: 's2', displayName: 'Bob', classId: 'c1', className: '2C', answers: [] },
                ]}
            />
        );
        expect(screen.getByText('2C')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
        fireEvent.click(screen.getByText('2C'));
        expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    });

    it('keeps two same-named classes separate by class id', () => {
        render(
            <ResponsesGrid
                test={mockTest}
                rows={[
                    { studentId: 's1', displayName: 'Alice', classId: 'c1', className: '2C', answers: [] },
                    { studentId: 's2', displayName: 'Bob', classId: 'c2', className: '2C', answers: [] },
                ]}
            />
        );
        // Two distinct groups → two "2C" header buttons; collapsing one hides only its student.
        const headers = screen.getAllByText('2C');
        expect(headers.length).toBe(2);
        fireEvent.click(headers[0]);
        expect(screen.queryByText('Alice')).not.toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('greys out a question a placement student never routed to', () => {
        const routedTest: Test = {
            ...mockTest,
            sections: [
                { id: 'secA', title: 'A' },
                { id: 'secB', title: 'B' },
            ],
            questions: [
                { id: 'q1', prompt: 'p1', type: 'open', points: 1, sectionId: 'secA' },
                { id: 'q2', prompt: 'p2', type: 'open', points: 1, sectionId: 'secB' },
            ],
        };
        render(
            <ResponsesGrid
                test={routedTest}
                rows={[{ studentId: 's1', displayName: 'Alice', sectionPath: ['secA'], answers: [] }]}
            />
        );
        // secB was never presented → one "absent" cell.
        expect(screen.getByTitle('tests.monitor.grid.state.absent')).toBeInTheDocument();
    });
});
