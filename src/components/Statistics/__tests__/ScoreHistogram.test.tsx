import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ScoreHistogram, { buildHistogramData } from '../ScoreHistogram';

describe('buildHistogramData', () => {
    it('returns 10 buckets for any non-empty input', () => {
        const data = buildHistogramData([10, 55, 90]);
        expect(data).toHaveLength(10);
    });

    it('returns 10 buckets for an empty input', () => {
        const data = buildHistogramData([]);
        expect(data).toHaveLength(10);
        expect(data.every(b => b.count === 0)).toBe(true);
    });

    it('places score 55 into the 50–60 bucket (index 5)', () => {
        const data = buildHistogramData([55]);
        expect(data[5].range).toBe('50–60');
        expect(data[5].count).toBe(1);
        expect(data.filter(b => b.count > 0)).toHaveLength(1);
    });

    it('places score 0 into the 0–10 bucket', () => {
        const data = buildHistogramData([0]);
        expect(data[0].count).toBe(1);
    });

    it('places score 100 into the 90–100 bucket (clamped to index 9)', () => {
        const data = buildHistogramData([100]);
        expect(data[9].count).toBe(1);
    });

    it('places score 90 into the 90–100 bucket', () => {
        const data = buildHistogramData([90]);
        expect(data[9].count).toBe(1);
    });

    it('correctly counts multiple scores across different buckets', () => {
        const data = buildHistogramData([5, 15, 25, 35, 45, 55, 65, 75, 85, 95]);
        expect(data.every(b => b.count === 1)).toBe(true);
    });

    it('correctly counts multiple scores in the same bucket', () => {
        const data = buildHistogramData([70, 72, 78, 79]);
        expect(data[7].count).toBe(4);
    });
});

describe('ScoreHistogram component', () => {
    it('renders a "No scores" message when scores array is empty', () => {
        render(<ScoreHistogram scores={[]} />);
        expect(screen.getByText(/no scores/i)).toBeTruthy();
    });

    it('renders without crashing when given valid scores', () => {
        const { container } = render(<ScoreHistogram scores={[20, 55, 80, 90]} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('renders a chart container (recharts svg) when scores are present', () => {
        const { container } = render(<ScoreHistogram scores={[30, 60, 90]} />);
        // Recharts renders an SVG
        expect(container.querySelector('svg')).toBeTruthy();
    });
});
