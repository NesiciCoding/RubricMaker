import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ProfileTimelineChart from '../ProfileTimelineChart';

// Tooltips only render on real pointer hover, which jsdom can't produce — invoke
// the formatter directly so the component's own formatting code is exercised.
vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
            React.cloneElement(children, { width: 600, height: 400 }),
        Tooltip: ({ formatter }: { formatter?: (v: unknown, n: unknown, p?: unknown) => unknown }) => (
            <div data-testid="tooltip">
                {formatter ? String(formatter(75, 'score', { payload: { rubric: { name: 'Essay 1' } } })) : ''}
                {formatter ? String(formatter('nope', 'score', { payload: { rubric: { name: 'Essay 1' } } })) : ''}
            </div>
        ),
    };
});

describe('ProfileTimelineChart', () => {
    it('renders the line chart when history is provided', () => {
        const history = [
            { dateStr: '2024-01-01', score: 70, rubric: { name: 'Essay 1' } },
            { dateStr: '2024-02-01', score: 85, rubric: { name: 'Essay 2' } },
        ];
        const { container } = render(<ProfileTimelineChart history={history} />);
        expect(container.querySelector('.recharts-wrapper') ?? container.firstChild).toBeTruthy();
    });

    it('formats tooltip values as percentages with the rubric name', () => {
        const history = [{ dateStr: '2024-01-01', score: 70, rubric: { name: 'Essay 1' } }];
        render(<ProfileTimelineChart history={history} />);
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('75%');
        expect(out).toContain('0%'); // non-number value → 0%
        expect(out).toContain('Essay 1');
    });
});
