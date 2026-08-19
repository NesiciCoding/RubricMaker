import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ClassTrendChart, { TrendPoint } from '../ClassTrendChart';

// Tooltips only render on real pointer hover, which jsdom can't produce — invoke
// the formatters directly so the component's own formatting code is exercised.
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
            formatter?: (v: unknown, n: unknown) => unknown;
            labelFormatter?: (label: unknown, payload?: unknown[]) => unknown;
        }) => (
            <div data-testid="tooltip">
                {formatter ? String(formatter(75, 'avg')) : ''}
                {formatter ? String(formatter(null, 'avg')) : ''}
                {labelFormatter ? String(labelFormatter('L', [{ payload: { date: '2024-01-02' } }])) : ''}
                {labelFormatter ? String(labelFormatter('L', [])) : ''}
                {labelFormatter ? String(labelFormatter('L')) : ''}
            </div>
        ),
    };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

const makePoint = (name: string, avg: number): TrendPoint => ({
    rubricName: name,
    date: '2024-01-01',
    avg,
    median: avg - 2,
});

describe('ClassTrendChart', () => {
    it('renders nothing when fewer than 2 data points', () => {
        const { container } = render(<ClassTrendChart data={[makePoint('R1', 75)]} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when data is empty', () => {
        const { container } = render(<ClassTrendChart data={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders chart with 2+ data points', () => {
        const data = [makePoint('R1', 75), makePoint('R2', 80)];
        const { container } = render(<ClassTrendChart data={data} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('renders chart with multiple data points', () => {
        const data = [makePoint('R1', 70), makePoint('R2', 75), makePoint('R3', 80)];
        const { container } = render(<ClassTrendChart data={data} />);
        expect(container.querySelector('.recharts-wrapper') ?? container.firstChild).toBeTruthy();
    });

    it('formats tooltip values and dates through the component formatters', () => {
        const { getByTestId } = render(<ClassTrendChart data={[makePoint('R1', 75), makePoint('R2', 80)]} />);
        const out = getByTestId('tooltip').textContent ?? '';
        // value ?? 0 → both a real value and null fall through
        expect(out).toContain('75%');
        expect(out).toContain('0%');
        // labelFormatter: payload date present → formatted, missing → raw label
        expect(out).toContain('L ·');
        expect(out).toContain('L');
    });
});
