import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ItemAnalysisPanel from '../ItemAnalysisPanel';
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
});
