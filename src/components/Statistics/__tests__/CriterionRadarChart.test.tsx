import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import CriterionRadarChart from '../CriterionRadarChart';

const threePoint = [
    { name: 'Writing', avg: 70 },
    { name: 'Grammar', avg: 55 },
    { name: 'Vocabulary', avg: 80 },
];

const twoPoint = [
    { name: 'Writing', avg: 70 },
    { name: 'Grammar', avg: 55 },
];

describe('CriterionRadarChart', () => {
    it('renders a fallback message when data has fewer than 3 entries', () => {
        render(<CriterionRadarChart data={twoPoint} accentColor="#3b82f6" />);
        expect(screen.getByText(/at least 3 criteria/i)).toBeTruthy();
    });

    it('renders a fallback message when data is empty', () => {
        render(<CriterionRadarChart data={[]} accentColor="#3b82f6" />);
        expect(screen.getByText(/at least 3 criteria/i)).toBeTruthy();
    });

    it('renders an SVG chart (not a fallback) when data has 3+ entries', () => {
        const { container } = render(<CriterionRadarChart data={threePoint} accentColor="#3b82f6" />);
        expect(container.querySelector('svg')).toBeTruthy();
        expect(screen.queryByText(/at least 3 criteria/i)).toBeNull();
    });

    it('does not render a Legend when no selectedStudents are provided', () => {
        const { container } = render(<CriterionRadarChart data={threePoint} accentColor="#3b82f6" />);
        // Recharts Legend renders a <ul> inside the chart
        expect(container.querySelector('.recharts-legend-wrapper')).toBeNull();
    });

    it('renders a Legend when selectedStudents are provided', () => {
        const { container } = render(
            <CriterionRadarChart
                data={threePoint.map(d => ({ ...d, s1: 60 }))}
                accentColor="#3b82f6"
                selectedStudents={[{ id: 's1', name: 'Alice', color: 'var(--purple)' }]}
            />
        );
        expect(container.querySelector('.recharts-legend-wrapper')).toBeTruthy();
    });

    it('does not crash when all students have identical scores (overlapping polygons)', () => {
        const data = threePoint.map(d => ({ ...d, s1: d.avg }));
        expect(() =>
            render(
                <CriterionRadarChart
                    data={data}
                    accentColor="#3b82f6"
                    selectedStudents={[{ id: 's1', name: 'Alice', color: 'var(--purple)' }]}
                />
            )
        ).not.toThrow();
    });

    it('renders without crashing when accentColor is a CSS var string', () => {
        expect(() =>
            render(<CriterionRadarChart data={threePoint} accentColor="var(--accent)" />)
        ).not.toThrow();
    });
});
