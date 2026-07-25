import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PlacementLevelPanel from './PlacementLevelPanel';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (opts) return `${key} ${JSON.stringify(opts)}`;
            return key;
        },
    }),
}));

describe('PlacementLevelPanel', () => {
    it('shows a pending state when no level has been reported yet', () => {
        render(<PlacementLevelPanel />);
        expect(screen.getByText('tests.monitor.generator_level_pending')).toBeInTheDocument();
    });

    it('shows the current level, Elo anchor, and questions-asked count once reported', () => {
        render(<PlacementLevelPanel level="B1" eloAnchor={1200} questionsAsked={4} />);
        expect(screen.getByText(/tests\.monitor\.generator_level_label/)).toBeInTheDocument();
        expect(screen.getByText(/tests\.monitor\.generator_questions_asked_label/)).toBeInTheDocument();
        const badge = screen.getByText(/tests\.monitor\.generator_level_label/);
        expect(badge).toHaveAttribute('title', expect.stringContaining('tests.monitor.generator_elo_label'));
        expect(badge.getAttribute('title')).toContain('1200');
    });

    it('does not render nudge buttons when onNudge is not provided', () => {
        render(<PlacementLevelPanel level="B1" />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('calls onNudge with the clicked direction', () => {
        const onNudge = vi.fn();
        render(<PlacementLevelPanel level="B1" onNudge={onNudge} />);
        fireEvent.click(screen.getByLabelText('tests.monitor.nudge_up_button'));
        expect(onNudge).toHaveBeenCalledWith('up');
        fireEvent.click(screen.getByLabelText('tests.monitor.nudge_down_button'));
        expect(onNudge).toHaveBeenCalledWith('down');
    });

    it('disables nudge buttons when disabled is set', () => {
        const onNudge = vi.fn();
        render(<PlacementLevelPanel level="B1" onNudge={onNudge} disabled />);
        expect(screen.getByLabelText('tests.monitor.nudge_up_button')).toBeDisabled();
        expect(screen.getByLabelText('tests.monitor.nudge_down_button')).toBeDisabled();
    });
});
