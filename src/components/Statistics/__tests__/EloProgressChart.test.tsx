import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EloProgressChart from '../EloProgressChart';
import type { EloProgressPoint } from '../../../utils/eloProgressAggregator';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
    }),
}));

const makePoint = (overrides: Partial<EloProgressPoint> = {}): EloProgressPoint => ({
    studentTestId: 'st1',
    testName: 'Placement Test',
    date: '2024-01-01T10:00:00Z',
    attemptIndex: 1,
    level: 'A2',
    eloValue: 900,
    ...overrides,
});

describe('EloProgressChart', () => {
    it('shows an empty-state message when there are no points', () => {
        render(<EloProgressChart points={[]} />);
        expect(screen.getByText('statistics.elo_chart_empty')).toBeInTheDocument();
    });

    it('renders the chart title and a chart when points are provided', () => {
        const { container } = render(<EloProgressChart points={[makePoint()]} />);
        expect(screen.getByText('statistics.elo_chart_title')).toBeInTheDocument();
        expect(container.querySelector('.recharts-wrapper') ?? container.firstChild).toBeTruthy();
    });

    it('renders an accessible data row per point in the sr-only table', () => {
        const points = [
            makePoint({ studentTestId: 'st1', attemptIndex: 1, level: 'A2' }),
            makePoint({ studentTestId: 'st2', attemptIndex: 2, level: 'B1', eloValue: 1200 }),
        ];
        render(<EloProgressChart points={points} />);
        const table = screen.getByRole('table', { hidden: true });
        expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
        expect(table.textContent).toContain('A2');
        expect(table.textContent).toContain('B1');
    });
});
