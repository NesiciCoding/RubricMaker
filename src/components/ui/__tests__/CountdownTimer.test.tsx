import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CountdownTimer from '../CountdownTimer';

const mockUseDeadlineCountdown = vi.hoisted(() => vi.fn());

vi.mock('../../../hooks/useDeadlineCountdown', () => ({
    useDeadlineCountdown: mockUseDeadlineCountdown,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('CountdownTimer', () => {
    it('renders nothing when there is no active countdown', () => {
        mockUseDeadlineCountdown.mockReturnValue(null);
        const { container } = render(
            <CountdownTimer durationMinutes={null} storageKey="k" submitted={false} timeUpLabel="Time up" />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('exposes role=timer with the formatted time and a polite live region', () => {
        mockUseDeadlineCountdown.mockReturnValue(725); // 12:05
        render(<CountdownTimer durationMinutes={15} storageKey="k" submitted={false} timeUpLabel="Time up" />);
        const timer = screen.getByRole('timer');
        expect(timer).toHaveTextContent('12:05');
        expect(timer).toHaveAttribute('aria-live', 'off');
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('announces the 5-minute and 1-minute thresholds exactly once each as they are crossed', () => {
        mockUseDeadlineCountdown.mockReturnValue(301);
        const { rerender } = render(
            <CountdownTimer durationMinutes={15} storageKey="k" submitted={false} timeUpLabel="Time up" />
        );
        expect(screen.getByRole('status')).toHaveTextContent('');

        mockUseDeadlineCountdown.mockReturnValue(300);
        act(() => {
            rerender(<CountdownTimer durationMinutes={15} storageKey="k" submitted={false} timeUpLabel="Time up" />);
        });
        expect(screen.getByRole('status')).toHaveTextContent('tests.taking.time_remaining_5min');

        // Still above the 1-minute threshold: the 5-minute announcement is not re-fired or cleared.
        mockUseDeadlineCountdown.mockReturnValue(200);
        act(() => {
            rerender(<CountdownTimer durationMinutes={15} storageKey="k" submitted={false} timeUpLabel="Time up" />);
        });
        expect(screen.getByRole('status')).toHaveTextContent('tests.taking.time_remaining_5min');

        mockUseDeadlineCountdown.mockReturnValue(60);
        act(() => {
            rerender(<CountdownTimer durationMinutes={15} storageKey="k" submitted={false} timeUpLabel="Time up" />);
        });
        expect(screen.getByRole('status')).toHaveTextContent('tests.taking.time_remaining_1min');
    });

    it('announces submission once the deadline passes and shows the visible time-up label', () => {
        mockUseDeadlineCountdown.mockReturnValue(1);
        const { rerender } = render(
            <CountdownTimer durationMinutes={15} storageKey="k" submitted={false} timeUpLabel="Time up!" />
        );

        mockUseDeadlineCountdown.mockReturnValue(0);
        act(() => {
            rerender(<CountdownTimer durationMinutes={15} storageKey="k" submitted={false} timeUpLabel="Time up!" />);
        });
        expect(screen.getByRole('timer')).toHaveTextContent('Time up!');
        expect(screen.getByRole('status')).toHaveTextContent('tests.taking.time_up_announcement');
    });

    it('resets the announced thresholds when resetSignal changes (e.g. a retake)', () => {
        mockUseDeadlineCountdown.mockReturnValue(30);
        const { rerender } = render(
            <CountdownTimer
                durationMinutes={15}
                storageKey="k"
                submitted={false}
                timeUpLabel="Time up"
                resetSignal={0}
            />
        );
        expect(screen.getByRole('status')).toHaveTextContent('tests.taking.time_remaining_1min');

        mockUseDeadlineCountdown.mockReturnValue(900);
        act(() => {
            rerender(
                <CountdownTimer
                    durationMinutes={15}
                    storageKey="k"
                    submitted={false}
                    timeUpLabel="Time up"
                    resetSignal={1}
                />
            );
        });
        expect(screen.getByRole('status')).toHaveTextContent('');
    });
});
