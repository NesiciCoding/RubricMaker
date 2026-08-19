import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Avatar from '../Avatar';
import CountdownTimer from '../CountdownTimer';

describe('Avatar', () => {
    it('renders the first letter of the name capitalized', () => {
        render(<Avatar name="alice" size={40} />);
        expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('falls back to a question mark for an empty name', () => {
        render(<Avatar name="" size={40} />);
        expect(screen.getByText('?')).toBeInTheDocument();
    });
});

describe('CountdownTimer', () => {
    it('shows the remaining time and colors it red under 120 seconds', () => {
        render(
            <CountdownTimer
                durationMinutes={1}
                storageKey="ui-extras-timer"
                submitted={false}
                timeUpLabel="Time's up!"
            />
        );
        const display = screen.getByText('01:00');
        expect(display).toBeInTheDocument();
        expect(display).toHaveStyle({ color: '#ef4444' });
    });

    it('clears the running interval on unmount mid-countdown', () => {
        const { unmount } = render(
            <CountdownTimer
                durationMinutes={5}
                storageKey="ui-extras-timer-2"
                submitted={false}
                timeUpLabel="Time's up!"
            />
        );
        expect(screen.getByText('05:00')).toBeInTheDocument();
        unmount();
    });

    it('runs the cleanup without an interval when submitted before the countdown starts', () => {
        const { unmount } = render(
            <CountdownTimer durationMinutes={5} storageKey="ui-extras-timer-3" submitted timeUpLabel="Time's up!" />
        );
        expect(screen.getByText('05:00')).toBeInTheDocument();
        unmount();
    });
});
