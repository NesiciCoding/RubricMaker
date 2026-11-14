import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SEB_QUIT_DELAY_MS, useSebQuitRedirect } from '../useSebQuitRedirect';
import { buildSebQuitUrl } from '../../utils/sebConfig';

function stubUserAgent(ua: string) {
    Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

describe('useSebQuitRedirect', () => {
    const originalUserAgent = window.navigator.userAgent;

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        stubUserAgent(originalUserAgent);
    });

    it('quits once the delay after submission has passed inside SEB', () => {
        stubUserAgent('Mozilla/5.0 (X11; Linux x86_64) SEB 3.10.2');
        const quit = vi.fn();

        const { result } = renderHook(() => useSebQuitRedirect(true, quit));
        expect(result.current).toBe(true);
        expect(quit).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(SEB_QUIT_DELAY_MS - 1));
        expect(quit).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(1));
        expect(quit).toHaveBeenCalledOnce();
        expect(quit).toHaveBeenCalledWith(buildSebQuitUrl());
    });

    it('waits for submission before quitting', () => {
        stubUserAgent('Mozilla/5.0 (X11; Linux x86_64) SEB 3.10.2');
        const quit = vi.fn();

        renderHook(() => useSebQuitRedirect(false, quit));
        act(() => vi.advanceTimersByTime(SEB_QUIT_DELAY_MS * 5));

        expect(quit).not.toHaveBeenCalled();
    });

    it('does nothing in a regular browser', () => {
        stubUserAgent('Mozilla/5.0 (regular browser)');
        const quit = vi.fn();

        const { result } = renderHook(() => useSebQuitRedirect(true, quit));
        act(() => vi.advanceTimersByTime(SEB_QUIT_DELAY_MS * 5));

        expect(result.current).toBe(false);
        expect(quit).not.toHaveBeenCalled();
    });

    it('cancels the pending quit when submission is rolled back', () => {
        stubUserAgent('Mozilla/5.0 (X11; Linux x86_64) SEB 3.10.2');
        const quit = vi.fn();

        const { rerender } = renderHook(({ submitted }) => useSebQuitRedirect(submitted, quit), {
            initialProps: { submitted: true },
        });
        rerender({ submitted: false });
        act(() => vi.advanceTimersByTime(SEB_QUIT_DELAY_MS * 2));

        expect(quit).not.toHaveBeenCalled();
    });
});
