import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ResponsesGrid from '../ResponsesGrid';
import LiveDraftPanel from '../LiveDraftPanel';
import type { Test } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) =>
            opts
                ? `${key} ${Object.entries(opts)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join(' ')}`
                : key,
        i18n: { language: 'en' },
    }),
}));

const makeTest = (count: number): Test => ({
    id: 't1',
    name: 'Quiz',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: Array.from({ length: count }, (_, i) => ({
        id: `q${i + 1}`,
        prompt: `p${i + 1}`,
        type: 'open' as const,
        points: 1,
    })),
});

const rows = [{ studentId: 's1', displayName: 'Alice', answers: [] }];

describe('ResponsesGrid milestones', () => {
    it('renders no markers by default', () => {
        render(<ResponsesGrid test={makeTest(4)} rows={rows} />);
        expect(screen.queryByTestId('milestone-halfway')).not.toBeInTheDocument();
        expect(screen.queryByTestId('milestone-final')).not.toBeInTheDocument();
    });

    it('marks the halfway and final questions in the header', () => {
        render(<ResponsesGrid test={makeTest(5)} rows={rows} showMilestones />);
        expect(
            screen.getByRole('button', {
                name: 'tests.monitor.grid.question_short index=3 (tests.monitor.grid.milestone_halfway): p3',
            })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'tests.monitor.grid.question_short index=5 (tests.monitor.grid.milestone_final): p5',
            })
        ).toBeInTheDocument();
        const halfwayHeader = screen.getByTestId('milestone-halfway').closest('th')!;
        expect(halfwayHeader.style.borderRight).toContain('dashed');
    });

    it('skips milestones on a single-question test', () => {
        render(<ResponsesGrid test={makeTest(1)} rows={rows} showMilestones />);
        expect(screen.queryByTestId('milestone-final')).not.toBeInTheDocument();
    });

    it('drops the halfway divider once columns are reordered', () => {
        const mixed = makeTest(4);
        mixed.questions[0] = { ...mixed.questions[0], type: 'short-answer' };
        render(<ResponsesGrid test={mixed} rows={rows} showMilestones sortRules={[{ key: 'type', dir: 'asc' }]} />);
        const halfwayHeader = screen.getByTestId('milestone-halfway').closest('th')!;
        expect(halfwayHeader.style.borderRight).toBe('');
    });

    it('shows a pace icon next to the student name', () => {
        render(<ResponsesGrid test={makeTest(2)} rows={[{ ...rows[0], pace: 'behind' }]} />);
        expect(screen.getByRole('img', { name: 'tests.monitor.pace.behind' })).toBeInTheDocument();
    });
});

describe('LiveDraftPanel writing pace', () => {
    const MIN = 60_000;
    const samples = [0, 1, 2, 3, 4, 5, 6].map((m) => ({ at: m * MIN, words: m * 10 }));

    it('stays hidden unless enabled', () => {
        render(
            <LiveDraftPanel
                displayName="Alice"
                presence="active"
                wordSamples={samples}
                lastChangeAt={6 * MIN}
                now={6 * MIN}
            />
        );
        expect(screen.queryByTestId('writing-pace')).not.toBeInTheDocument();
        expect(screen.queryByTestId('since-last-change')).not.toBeInTheDocument();
    });

    it('shows words per minute, trend and time since the last change', () => {
        render(
            <LiveDraftPanel
                displayName="Alice"
                presence="active"
                showWritingPace
                wordSamples={samples}
                lastChangeAt={6 * MIN - 20_000}
                now={6 * MIN}
            />
        );
        expect(screen.getByTestId('writing-pace')).toHaveTextContent('tests.monitor.draft.wpm count=10');
        expect(screen.getByTestId('writing-pace')).toHaveTextContent('tests.monitor.draft.trend.steady');
        expect(screen.getByTestId('since-last-change')).toHaveTextContent(
            'tests.monitor.draft.last_typed_seconds count=20'
        );
    });

    it('hides the pace once the essay is handed in', () => {
        render(
            <LiveDraftPanel
                displayName="Alice"
                presence="active"
                status="submitted"
                showWritingPace
                wordSamples={samples}
                lastChangeAt={6 * MIN}
                now={6 * MIN}
            />
        );
        expect(screen.queryByTestId('writing-pace')).not.toBeInTheDocument();
    });
});
