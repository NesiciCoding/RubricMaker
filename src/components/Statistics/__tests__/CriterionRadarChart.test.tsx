import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import CriterionRadarChart from '../CriterionRadarChart';

// ResponsiveContainer uses ResizeObserver and reports 0-size in jsdom; mock it
// to render children directly with a fixed size so Recharts renders the SVG.
vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
            React.cloneElement(children, { width: 600, height: 400 }),
        Tooltip: ({ formatter }: { formatter?: (v: unknown) => unknown }) => (
            <div data-testid="tooltip">
                {formatter ? String(formatter(75)) : ''}
                {formatter ? String(formatter(null)) : ''}
            </div>
        ),
    };
});

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
        expect(screen.getByText('statistics.radar_min_criteria')).toBeTruthy();
    });

    it('renders a fallback message when data is empty', () => {
        render(<CriterionRadarChart data={[]} accentColor="#3b82f6" />);
        expect(screen.getByText('statistics.radar_min_criteria')).toBeTruthy();
    });

    it('renders an SVG chart (not a fallback) when data has 3+ entries', () => {
        const { container } = render(<CriterionRadarChart data={threePoint} accentColor="#3b82f6" />);
        expect(container.querySelector('svg')).toBeTruthy();
        expect(screen.queryByText('statistics.radar_min_criteria')).toBeNull();
    });

    it('does not render a Legend when no selectedStudents are provided', () => {
        const { container } = render(<CriterionRadarChart data={threePoint} accentColor="#3b82f6" />);
        // Recharts Legend renders a <ul> inside the chart
        expect(container.querySelector('.recharts-legend-wrapper')).toBeNull();
    });

    it('renders a Legend when selectedStudents are provided', () => {
        const { container } = render(
            <CriterionRadarChart
                data={threePoint.map((d) => ({ ...d, s1: 60 }))}
                accentColor="#3b82f6"
                selectedStudents={[{ id: 's1', name: 'Alice', color: 'var(--purple)' }]}
            />
        );
        expect(container.querySelector('.recharts-legend-wrapper')).toBeTruthy();
    });

    it('does not crash when all students have identical scores (overlapping polygons)', () => {
        const data = threePoint.map((d) => ({ ...d, s1: d.avg }));
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
        expect(() => render(<CriterionRadarChart data={threePoint} accentColor="var(--accent)" />)).not.toThrow();
    });

    it('formats the tooltip value with a percent sign, localized to one decimal', () => {
        render(<CriterionRadarChart data={threePoint} accentColor="#3b82f6" />);
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('75.0%');
        expect(out).toContain(''); // null → ''
    });

    it('formats percentages with the viewer locale decimal separator', async () => {
        vi.resetModules();
        vi.doMock('react-i18next', () => ({
            useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'nl' } }),
        }));
        const { default: LocalizedRadarChart } = await import('../CriterionRadarChart');
        render(<LocalizedRadarChart data={threePoint} accentColor="#3b82f6" />);
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('75,0%');
        vi.doUnmock('react-i18next');
        vi.resetModules();
    });

    it('exposes a visually-hidden data table as a text alternative to the chart', () => {
        const { container } = render(<CriterionRadarChart data={threePoint} accentColor="#3b82f6" />);
        expect(container.querySelector('div[role="img"]')).toBeTruthy();
        const table = container.querySelector('table.sr-only');
        expect(table).toBeTruthy();
        expect(table?.textContent).toContain('Writing');
        expect(table?.textContent).toContain('70.0%');
    });

    it('wraps a long criterion name onto two lines instead of letting it run off the axis', () => {
        const { container } = render(
            <CriterionRadarChart
                data={[
                    { name: 'Coherence & Cohesion', avg: 70 },
                    { name: 'Grammar', avg: 55 },
                    { name: 'Vocabulary', avg: 80 },
                ]}
                accentColor="#3b82f6"
            />
        );
        const tick = Array.from(container.querySelectorAll('tspan')).find((el) =>
            (el.textContent ?? '').startsWith('Coherence')
        );
        expect(tick).toBeTruthy();
        expect(tick?.textContent).not.toBe('Coherence & Cohesion');
    });
});
