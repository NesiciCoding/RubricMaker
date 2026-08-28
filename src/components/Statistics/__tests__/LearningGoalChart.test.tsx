import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LearningGoalChart, { barColor } from '../LearningGoalChart';
import type { LearningGoalAggregate } from '../../../utils/learningGoalsAggregator';

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
            formatter?: (v: unknown, n: unknown, item?: unknown) => unknown;
            labelFormatter?: (label: unknown, payload?: unknown[]) => unknown;
        }) => (
            <div data-testid="tooltip">
                {formatter ? String(formatter(80, 'pct', { payload: { label: 'L', earned: 8, max: 10 } })) : ''}
                {formatter ? String(formatter(undefined, 'pct', { payload: { label: 'L' } })) : ''}
                {labelFormatter ? String(labelFormatter('L', [{ payload: { date: '2024-01-02' } }])) : ''}
                {labelFormatter ? String(labelFormatter('L', [])) : ''}
            </div>
        ),
    };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            switch (key) {
                case 'statistics.lg_empty':
                    return 'No recorded learning goals.';
                case 'statistics.lg_pts_short':
                    return 'Pts';
                case 'statistics.lg_average':
                    return `Average: ${opts?.pct}% (${opts?.earned} / ${opts?.max} pts)`;
                case 'statistics.lg_option_suffix':
                    return `(${opts?.earned}/${opts?.max} pts)`;
                case 'statistics.lg_target':
                    return `Target ${opts?.pct}%`;
                default:
                    return key;
            }
        },
        i18n: { language: 'en' },
    }),
}));

const makeGoal = (guid: string, title = 'Goal A'): LearningGoalAggregate => ({
    guid,
    title,
    description: 'A test goal',
    totalEarned: 80,
    totalMax: 100,
    averagePercentage: 80,
    history: [
        {
            studentId: 's1',
            rubricId: 'r1',
            guid: 'g1',
            title: 'Goal A',
            description: 'desc',
            gradedAt: '2024-01-01T00:00:00Z',
            rubricName: 'Rubric 1',
            percentage: 80,
            earnedPoints: 80,
            maxPoints: 100,
        },
        {
            studentId: 's1',
            rubricId: 'r1',
            guid: 'g1',
            title: 'Goal A',
            description: 'desc',
            gradedAt: '2024-02-01T00:00:00Z',
            rubricName: 'Rubric 2',
            percentage: 85,
            earnedPoints: 85,
            maxPoints: 100,
        },
    ],
});

describe('LearningGoalChart', () => {
    it('shows empty-state message when no goals', () => {
        render(<LearningGoalChart goals={[]} />);
        expect(screen.getByText('No recorded learning goals.')).toBeInTheDocument();
    });

    it('renders chart when goals are provided', () => {
        const goals = [makeGoal('g1')];
        const { container } = render(<LearningGoalChart goals={goals} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('shows goal title in select', () => {
        render(<LearningGoalChart goals={[makeGoal('g1', 'My Goal')]} />);
        expect(screen.getByRole('option', { name: /My Goal/ })).toBeInTheDocument();
    });

    it('shows goal description', () => {
        render(<LearningGoalChart goals={[makeGoal('g1')]} />);
        expect(screen.getByText('A test goal')).toBeInTheDocument();
    });

    it('shows average percentage', () => {
        render(<LearningGoalChart goals={[makeGoal('g1')]} />);
        expect(screen.getByText(/80\.0%/)).toBeInTheDocument();
    });

    it('switches to cumulative view on Pts button click', () => {
        render(<LearningGoalChart goals={[makeGoal('g1')]} />);
        fireEvent.click(screen.getByText('Pts'));
        expect(screen.getByText('Pts').className).toMatch(/btn-primary/);
    });

    it('switches back to percentage view', () => {
        render(<LearningGoalChart goals={[makeGoal('g1')]} />);
        fireEvent.click(screen.getByText('Pts'));
        fireEvent.click(screen.getByText('%'));
        expect(screen.getByText('%').className).toMatch(/btn-primary/);
    });

    it('shows select with multiple goals', () => {
        const goals = [makeGoal('g1', 'First'), makeGoal('g2', 'Second')];
        render(<LearningGoalChart goals={goals} />);
        expect(screen.getByRole('option', { name: /First/ })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /Second/ })).toBeInTheDocument();
    });

    it('resets selection to the first goal when the selected goal disappears', () => {
        const goals = [makeGoal('g1', 'First'), makeGoal('g2', 'Second')];
        const { rerender, getByRole } = render(<LearningGoalChart goals={goals} />);
        const select = getByRole('combobox');
        fireEvent.change(select, { target: { value: 'g2' } });
        expect((select as HTMLSelectElement).value).toBe('g2');

        rerender(<LearningGoalChart goals={[makeGoal('g3', 'Third')]} />);
        expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('g3');
        expect(screen.getByRole('option', { name: /Third/ })).toBeInTheDocument();
    });

    it('updates selected goal on select change', () => {
        const goals = [makeGoal('g1', 'First'), makeGoal('g2', 'Second')];
        render(<LearningGoalChart goals={goals} />);
        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: 'g2' } });
        expect((select as HTMLSelectElement).value).toBe('g2');
    });

    it('formats the percentage tooltip with the series label', () => {
        render(<LearningGoalChart goals={[makeGoal('g1')]} />);
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('80%');
        expect(out).toContain('statistics.lg_series_percentage');
    });

    it('formats the points tooltip with earned over max', () => {
        render(<LearningGoalChart goals={[makeGoal('g1')]} />);
        fireEvent.click(screen.getByText('Pts'));
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('8 / 10');
        expect(out).toContain('statistics.lg_series_points');
        // value fallback when payload.earned is missing (earned ?? value, value is undefined here)
        expect(out).toContain('undefined / ?');
    });

    it('formats the tooltip label with the graded date when present', () => {
        render(<LearningGoalChart goals={[makeGoal('g1')]} />);
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('L ·');
        expect(out).toContain('L');
    });

    it('colors bars green/yellow/red against the target and accent when no target', () => {
        expect(barColor(90, 80)).toBe('var(--green)'); // at/above target
        expect(barColor(70, 80)).toBe('var(--yellow)'); // ≥ 80% of target
        expect(barColor(50, 80)).toBe('var(--red)'); // well below target
        expect(barColor(30, undefined)).toBe('var(--accent)'); // no target configured
    });

    it('falls back to a numbered label when a history entry has no rubric name', () => {
        const goal: LearningGoalAggregate = {
            ...makeGoal('g1'),
            history: [{ ...makeGoal('g1').history[0], rubricName: '' }],
        };
        render(<LearningGoalChart goals={[goal]} />);
        expect(screen.getAllByText('#1').length).toBeGreaterThan(0);
    });

    it('renders a reference line at the target only in percentage mode with a target', () => {
        const goal: LearningGoalAggregate = { ...makeGoal('g1'), targetPercentage: 80 };
        const { container, rerender } = render(<LearningGoalChart goals={[goal]} />);
        expect(container.querySelector('.recharts-reference-line')).toBeTruthy();
        rerender(<LearningGoalChart goals={[goal]} />);
        fireEvent.click(screen.getByText('Pts'));
        expect(container.querySelector('.recharts-reference-line')).toBeNull();
    });

    it('does not render a reference line when the goal has no target', () => {
        const { container } = render(<LearningGoalChart goals={[makeGoal('g1')]} />);
        expect(container.querySelector('.recharts-reference-line')).toBeNull();
    });

    it('shows the mastery target suffix next to the status', () => {
        const goal: LearningGoalAggregate = { ...makeGoal('g1'), targetPercentage: 80, status: 'ahead' };
        render(<LearningGoalChart goals={[goal]} />);
        expect(screen.getByText(/settings\.mastery_target_percentage_label/)).toBeTruthy();
    });
});
