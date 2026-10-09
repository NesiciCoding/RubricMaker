import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeadlineCountdown } from '../useDeadlineCountdown';
import { clearTestTimer, saveTestTimer } from '../../store/storage';

const KEY = 'rm_test_timer_key';
const START = new Date('2026-10-07T10:00:00Z').getTime();

describe('useDeadlineCountdown (#717)', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vi.useFakeTimers();
        vi.setSystemTime(START);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns null without a time limit', () => {
        const { result } = renderHook(() =>
            useDeadlineCountdown({ durationMinutes: null, storageKey: KEY, stopped: false })
        );
        expect(result.current).toBeNull();
    });

    it('counts down by wall-clock time, even when interval ticks were paused (sleep/background)', () => {
        const { result } = renderHook(() =>
            useDeadlineCountdown({ durationMinutes: 30, storageKey: KEY, stopped: false })
        );
        expect(result.current).toBe(1800);
        // The device sleeps for 20 minutes: the clock moves on, no interval ticks run.
        vi.setSystemTime(START + 20 * 60_000);
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(result.current).toBe(600);
    });

    it('restores the original deadline after closing and reopening the page', () => {
        const first = renderHook(() => useDeadlineCountdown({ durationMinutes: 30, storageKey: KEY, stopped: false }));
        first.unmount();
        sessionStorage.clear(); // a closed tab loses sessionStorage
        vi.setSystemTime(START + 5 * 60_000);
        const second = renderHook(() => useDeadlineCountdown({ durationMinutes: 30, storageKey: KEY, stopped: false }));
        expect(second.result.current).toBe(25 * 60);
    });

    it('fires time-up after a reload once the deadline has passed, exactly once', () => {
        renderHook(() => useDeadlineCountdown({ durationMinutes: 10, storageKey: KEY, stopped: false })).unmount();
        vi.setSystemTime(START + 11 * 60_000);
        const onTimeUp = vi.fn();
        const { result, rerender } = renderHook(() =>
            useDeadlineCountdown({ durationMinutes: 10, storageKey: KEY, stopped: false, onTimeUp })
        );
        expect(result.current).toBe(0);
        expect(onTimeUp).toHaveBeenCalledTimes(1);
        rerender();
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(onTimeUp).toHaveBeenCalledTimes(1);
    });

    it('fires time-up when the countdown runs out while open', () => {
        const onTimeUp = vi.fn();
        renderHook(() => useDeadlineCountdown({ durationMinutes: 1, storageKey: KEY, stopped: false, onTimeUp }));
        act(() => {
            vi.advanceTimersByTime(61_000);
        });
        expect(onTimeUp).toHaveBeenCalledTimes(1);
    });

    it('does not fire once stopped (submitted)', () => {
        const onTimeUp = vi.fn();
        renderHook(() => useDeadlineCountdown({ durationMinutes: 1, storageKey: KEY, stopped: true, onTimeUp }));
        vi.setSystemTime(START + 2 * 60_000);
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(onTimeUp).not.toHaveBeenCalled();
    });

    it('migrates a legacy remaining-seconds value into a deadline', () => {
        saveTestTimer(KEY, 90);
        const { result } = renderHook(() =>
            useDeadlineCountdown({ durationMinutes: 30, storageKey: KEY, stopped: false })
        );
        expect(result.current).toBe(90);
    });

    it('starts a fresh countdown after the stored timer is cleared and resetSignal bumps (retake)', () => {
        let reset = 0;
        const { result, rerender } = renderHook(() =>
            useDeadlineCountdown({ durationMinutes: 10, storageKey: KEY, stopped: false, resetSignal: reset })
        );
        vi.setSystemTime(START + 4 * 60_000);
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current).toBeLessThan(600);
        clearTestTimer(KEY);
        reset = 1;
        rerender();
        expect(result.current).toBe(600);
    });
});
