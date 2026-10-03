import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePageTourState } from './usePageTourState';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

describe('usePageTourState', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it('starts stopped, runs on start() and stops on finish()', () => {
        const { result } = renderHook(() => usePageTourState('rubrics'));
        expect(result.current.tourProps.run).toBe(false);
        act(() => result.current.start());
        expect(result.current.tourProps.run).toBe(true);
        act(() => result.current.tourProps.onFinish());
        expect(result.current.tourProps.run).toBe(false);
        expect(result.current.tourProps.steps.length).toBeGreaterThan(0);
    });

    it('auto-runs once content is ready, then remembers it was seen', () => {
        const { result } = renderHook(() => usePageTourState('studyflash', { seenKey: 'k', autoRun: true }));
        expect(result.current.tourProps.run).toBe(false);
        act(() => vi.advanceTimersByTime(500));
        expect(result.current.tourProps.run).toBe(true);
        act(() => result.current.tourProps.onFinish());
        expect(result.current.tourProps.run).toBe(false);
        expect(localStorage.getItem('k')).toBe('true');
    });

    it('does not auto-run before autoRun is true or when already seen', () => {
        const waiting = renderHook(() => usePageTourState('studyflash', { seenKey: 'k2', autoRun: false }));
        act(() => vi.advanceTimersByTime(1000));
        expect(waiting.result.current.tourProps.run).toBe(false);

        localStorage.setItem('k3', 'true');
        const seen = renderHook(() => usePageTourState('studyflash', { seenKey: 'k3', autoRun: true }));
        act(() => vi.advanceTimersByTime(1000));
        expect(seen.result.current.tourProps.run).toBe(false);
    });

    it('still lets the user start a seen tour manually', () => {
        localStorage.setItem('k4', 'true');
        const { result } = renderHook(() => usePageTourState('studyflash', { seenKey: 'k4', autoRun: true }));
        act(() => result.current.start());
        expect(result.current.tourProps.run).toBe(true);
    });

    it('survives unavailable storage', () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        const { result } = renderHook(() => usePageTourState('studyflash', { seenKey: 'k5', autoRun: true }));
        act(() => vi.advanceTimersByTime(500));
        expect(result.current.tourProps.run).toBe(true);
        act(() => result.current.tourProps.onFinish());
        expect(result.current.tourProps.run).toBe(false);
        spy.mockRestore();
        setSpy.mockRestore();
    });
});
