import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LearningGoalChart from '../LearningGoalChart';
import type { LearningGoalAggregate } from '../../../utils/learningGoalsAggregator';

const makeGoal = (guid: string, title = 'Goal A'): LearningGoalAggregate => ({
    guid,
    title,
    description: 'A test goal',
    standardSetTitle: 'CCSS',
    jurisdictionTitle: 'US',
    totalEarned: 80,
    totalMax: 100,
    averagePercentage: 80,
    history: [
        { gradedAt: '2024-01-01T00:00:00Z', rubricName: 'Rubric 1', percentage: 80, earnedPoints: 80, maxPoints: 100 },
        { gradedAt: '2024-02-01T00:00:00Z', rubricName: 'Rubric 2', percentage: 85, earnedPoints: 85, maxPoints: 100 },
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

    it('updates selected goal on select change', () => {
        const goals = [makeGoal('g1', 'First'), makeGoal('g2', 'Second')];
        render(<LearningGoalChart goals={goals} />);
        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: 'g2' } });
        expect((select as HTMLSelectElement).value).toBe('g2');
    });
});
