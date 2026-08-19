import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MultiClassTrendChart from '../MultiClassTrendChart';
import type { MultiTrendPoint } from '../../../utils/classComparisonAggregator';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

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
                {formatter ? String(formatter(75, 'cls-a')) : ''}
                {formatter ? String(formatter(null, 'unknown-cls')) : ''}
                {labelFormatter ? String(labelFormatter('R1', [{ payload: { date: '2024-01-02' } }])) : ''}
                {labelFormatter ? String(labelFormatter('R1', [])) : ''}
                {labelFormatter ? String(labelFormatter('R1')) : ''}
            </div>
        ),
        Legend: ({ formatter }: { formatter?: (value: string) => unknown }) => (
            <div data-testid="legend">
                {formatter ? String(formatter('cls-a')) : ''}
                {formatter ? String(formatter('cls-missing')) : ''}
            </div>
        ),
        YAxis: ({ tickFormatter }: { tickFormatter?: (v: number) => unknown }) => (
            <div data-testid="yaxis">{tickFormatter ? String(tickFormatter(85)) : ''}</div>
        ),
    };
});

const makePoint = (rubricName: string, clsA: number | null, clsB: number | null): MultiTrendPoint =>
    // nulls model "no data for this class yet"; the index signature is number|string, so cast
    ({ rubricName, date: '2024-01-01', clsA, clsB }) as MultiTrendPoint;

describe('MultiClassTrendChart', () => {
    it('renders nothing with fewer than 2 data points', () => {
        const { container } = render(
            <MultiClassTrendChart
                data={[makePoint('R1', 70, 60)]}
                classIds={['cls-a', 'cls-b']}
                classNames={{ 'cls-a': 'Class A', 'cls-b': 'Class B' }}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders a chart with 2+ data points', () => {
        const { container } = render(
            <MultiClassTrendChart
                data={[makePoint('R1', 70, 60), makePoint('R2', 80, 75)]}
                classIds={['cls-a', 'cls-b']}
                classNames={{ 'cls-a': 'Class A', 'cls-b': 'Class B' }}
            />
        );
        expect(container.querySelector('.recharts-wrapper') ?? container.firstChild).toBeTruthy();
    });

    it('formats tooltip values with percent and resolves class names', () => {
        render(
            <MultiClassTrendChart
                data={[makePoint('R1', 70, 60), makePoint('R2', 80, 75)]}
                classIds={['cls-a', 'cls-b']}
                classNames={{ 'cls-a': 'Class A' }}
            />
        );
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('75%');
        expect(out).toContain('0%');
        expect(out).toContain('Class A'); // classNames[cls-a]
        expect(out).toContain('unknown-cls'); // fallback to raw name
    });

    it('formats the label with the date when present', () => {
        render(
            <MultiClassTrendChart
                data={[makePoint('R1', 70, 60), makePoint('R2', 80, 75)]}
                classIds={['cls-a', 'cls-b']}
                classNames={{ 'cls-a': 'Class A', 'cls-b': 'Class B' }}
            />
        );
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('R1 ·');
        expect(out).toContain('R1');
    });

    it('resolves legend labels through classNames', () => {
        render(
            <MultiClassTrendChart
                data={[makePoint('R1', 70, 60), makePoint('R2', 80, 75)]}
                classIds={['cls-a', 'cls-b']}
                classNames={{ 'cls-a': 'Class A', 'cls-b': 'Class B' }}
            />
        );
        const out = screen.getByTestId('legend').textContent ?? '';
        expect(out).toContain('Class A');
        expect(out).toContain('cls-missing'); // fallback when classNames has no entry
    });

    it('formats Y-axis ticks as percentages', () => {
        render(
            <MultiClassTrendChart
                data={[makePoint('R1', 70, 60), makePoint('R2', 80, 75)]}
                classIds={['cls-a', 'cls-b']}
                classNames={{ 'cls-a': 'Class A', 'cls-b': 'Class B' }}
            />
        );
        expect(screen.getByTestId('yaxis')).toHaveTextContent('85%');
    });
});
