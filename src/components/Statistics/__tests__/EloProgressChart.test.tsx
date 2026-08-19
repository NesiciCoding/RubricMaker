import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EloProgressChart from '../EloProgressChart';
import type { EloProgressPoint } from '../../../utils/eloProgressAggregator';

vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
            React.cloneElement(children, { width: 600, height: 400 }),
        Tooltip: ({
            formatter,
            labelFormatter,
        }: {
            formatter?: (v: unknown, n: unknown, item?: unknown) => unknown;
            labelFormatter?: (label: unknown) => unknown;
        }) => (
            <div data-testid="tooltip">
                {formatter
                    ? String(
                          formatter(900, 'eloValue', {
                              payload: { level: 'A2', date: '2024-01-01T10:00:00Z', testName: 'Placement Test' },
                          })
                      )
                    : ''}
                {formatter ? String(formatter(900, 'eloValue', {})) : ''}
                {labelFormatter ? String(labelFormatter(2)) : ''}
            </div>
        ),
    };
});

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

    it('formats the tooltip with the level, date, and test name', () => {
        render(<EloProgressChart points={[makePoint()]} />);
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('A2 ·');
        expect(out).toContain('Placement Test');
    });

    it('returns empty strings when the tooltip has no payload', () => {
        render(<EloProgressChart points={[makePoint()]} />);
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain(','); // the ['', ''] pair serialized
    });

    it('formats the tooltip label with the attempt index', () => {
        render(<EloProgressChart points={[makePoint()]} />);
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('statistics.elo_chart_tooltip_attempt');
        expect(out).toContain('2');
    });
});
