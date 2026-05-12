import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ClassTrendChart, { TrendPoint } from '../ClassTrendChart';

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
});
