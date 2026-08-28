import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ItemAnalysisPanel, { discriminationColor } from '../ItemAnalysisPanel';
import type { Test as RmTest, StudentTest } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    }),
}));

const mcQuestion = {
    id: 'q1',
    prompt: 'Pick one',
    type: 'multiple-choice' as const,
    points: 4,
    options: [
        { id: 'a', text: 'Distractor A', isCorrect: false },
        { id: 'b', text: 'Right', isCorrect: true },
    ],
};

const test: RmTest = {
    id: 't1',
    name: 'Test',
    questions: [mcQuestion],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
};

function submission(id: string, response: string): StudentTest {
    return {
        id: `st-${id}`,
        testId: 't1',
        studentId: id,
        answers: [{ questionId: 'q1', response }],
        status: 'submitted',
        startedAt: '2026-01-01T09:00:00.000Z',
    };
}

describe('discriminationColor', () => {
    it('maps each discrimination band to its color', () => {
        expect(discriminationColor(null)).toBe('var(--text-muted)');
        expect(discriminationColor(0)).toBe('var(--red)');
        expect(discriminationColor(0.05)).toBe('var(--red)');
        expect(discriminationColor(0.15)).toBe('var(--yellow)');
        expect(discriminationColor(0.29)).toBe('var(--yellow)');
        expect(discriminationColor(0.3)).toBe('var(--green)');
        expect(discriminationColor(0.8)).toBe('var(--green)');
    });
});

describe('ItemAnalysisPanel', () => {
    it('shows a no-submissions message when nobody has answered', () => {
        render(<ItemAnalysisPanel test={test} studentTests={[]} />);
        expect(screen.getByText('tests.results.adjuster_no_submissions')).toBeInTheDocument();
    });

    it('renders the top distractor for a question with wrong answers', () => {
        const studentTests = [submission('s1', 'a'), submission('s2', 'a'), submission('s3', 'b')];
        render(<ItemAnalysisPanel test={test} studentTests={studentTests} />);
        expect(screen.getByText(/Distractor A/)).toBeInTheDocument();
    });

    it('shows insufficient-data for discrimination with too few submissions', () => {
        const studentTests = [submission('s1', 'a'), submission('s2', 'b')];
        render(<ItemAnalysisPanel test={test} studentTests={studentTests} />);
        expect(screen.getByText('tests.results.item_analysis_insufficient_data')).toBeInTheDocument();
    });

    it('shows a zero discrimination with the plus sign when everyone answers correctly', () => {
        const studentTests = Array.from({ length: 8 }, (_, i) => submission(`s${i}`, 'b'));
        render(<ItemAnalysisPanel test={test} studentTests={studentTests} />);
        expect(screen.getByText('+0.00')).toBeInTheDocument();
    });

    it('shows a positive discrimination for questions that separate high from low scorers', () => {
        const studentTests = [
            ...Array.from({ length: 4 }, (_, i) => submission(`hi${i}`, 'b')),
            ...Array.from({ length: 4 }, (_, i) => submission(`lo${i}`, 'a')),
        ];
        render(<ItemAnalysisPanel test={test} studentTests={studentTests} />);
        expect(screen.getByText('+1.00')).toBeInTheDocument();
        expect(screen.getByText(/item_analysis_distractor_value/)).toBeInTheDocument();
    });

    it('shows a negative discrimination without a plus sign and an em dash when there is no distractor', () => {
        const openTest: RmTest = {
            ...test,
            questions: [
                { id: 'q9', prompt: 'Explain', type: 'open' as const, points: 6 },
                { id: 'q10', prompt: 'Another', type: 'open' as const, points: 10 },
            ],
        };
        // High totals answer q9 poorly and q10 well; low totals answer q9 well.
        const answersByStudent: Array<[number, number]> = [
            [1, 10],
            [1, 10],
            [2, 8],
            [2, 8],
            [6, 0],
            [6, 0],
            [6, 0],
            [6, 0],
        ];
        const studentTests = answersByStudent.map(([q9, q10], i) => ({
            ...submission(`s${i}`, `answer-${i}`),
            answers: [
                { questionId: 'q9', response: 'text', pointsEarned: q9 },
                { questionId: 'q10', response: 'text', pointsEarned: q10 },
            ],
        }));
        render(<ItemAnalysisPanel test={openTest} studentTests={studentTests} />);
        expect(screen.getByText('-0.83')).toBeInTheDocument();
        expect(screen.getByText('+1.00')).toBeInTheDocument();
        expect(screen.getAllByText('—')).toHaveLength(2);
    });
});
