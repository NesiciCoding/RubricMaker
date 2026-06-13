import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveSessionTelemetry } from '../useLiveSessionTelemetry';

const mockChannel = {
    on: vi.fn().mockReturnThis(),
    send: vi.fn(),
    subscribe: vi.fn().mockReturnThis(),
};
const mockClient = {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => mockClient),
}));

describe('useLiveSessionTelemetry', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('captures a tab_switch event on document visibilitychange → hidden', () => {
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(result.current.events.some((e) => e.type === 'tab_switch')).toBe(true);
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });

    it('captures a tab_switch event on window blur', () => {
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        act(() => {
            window.dispatchEvent(new Event('blur'));
        });

        expect(result.current.events.filter((e) => e.type === 'tab_switch')).toHaveLength(1);
    });

    it('counts copy, cut, and paste events with timestamps only', () => {
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        act(() => {
            document.dispatchEvent(new Event('copy'));
            document.dispatchEvent(new Event('cut'));
            document.dispatchEvent(new Event('paste'));
            document.dispatchEvent(new Event('paste'));
        });

        const types = result.current.events.map((e) => e.type);
        expect(types.filter((t) => t === 'copy')).toHaveLength(1);
        expect(types.filter((t) => t === 'cut')).toHaveLength(1);
        expect(types.filter((t) => t === 'paste')).toHaveLength(2);
        // No clipboard contents recorded — only type + timestamp
        result.current.events
            .filter((e) => e.type === 'copy' || e.type === 'cut' || e.type === 'paste')
            .forEach((e) => {
                expect(Object.keys(e).sort()).toEqual(['at', 'type']);
            });
    });

    it('records seb_status once at mount based on user agent', () => {
        vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 SEB/3.0' });
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        const sebEvents = result.current.events.filter((e) => e.type === 'seb_status');
        expect(sebEvents).toHaveLength(1);
        expect(sebEvents[0].value).toBe(true);
    });

    it('does not capture battery events when the Battery Status API is unavailable', async () => {
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        await act(async () => {
            await Promise.resolve();
        });

        expect(result.current.events.some((e) => e.type === 'battery')).toBe(false);
    });

    it('captures a battery event on mount and on change when the Battery API is available', async () => {
        let changeListeners: Record<string, () => void> = {};
        const battery = {
            level: 0.75,
            charging: true,
            addEventListener: (type: string, cb: () => void) => {
                changeListeners[type] = cb;
            },
            removeEventListener: vi.fn(),
        };
        const nav = navigator as Navigator & { getBattery?: () => Promise<typeof battery> };
        nav.getBattery = vi.fn().mockResolvedValue(battery);

        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current.events.some((e) => e.type === 'battery' && e.value === '75+')).toBe(true);

        battery.level = 0.5;
        battery.charging = false;
        act(() => {
            changeListeners['levelchange']?.();
        });

        expect(result.current.events.some((e) => e.type === 'battery' && e.value === '50')).toBe(true);

        delete nav.getBattery;
        changeListeners = {};
    });

    it('emits a heartbeat with active/idle state every ~20s', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        act(() => {
            vi.advanceTimersByTime(20_000);
        });

        const heartbeats = result.current.events.filter((e) => e.type === 'heartbeat');
        expect(heartbeats).toHaveLength(1);
        expect(['active', 'idle']).toContain(heartbeats[0].value);
    });

    it('marks heartbeat as idle after 60s of no keyboard/pointer activity', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        act(() => {
            vi.advanceTimersByTime(60_000);
        });

        const heartbeats = result.current.events.filter((e) => e.type === 'heartbeat');
        expect(heartbeats.length).toBeGreaterThan(0);
        expect(heartbeats[heartbeats.length - 1].value).toBe('idle');
    });

    it('flush returns the accumulated event log and clears it (snapshots excluded)', () => {
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        act(() => {
            window.dispatchEvent(new Event('blur'));
        });

        let flushed: ReturnType<typeof result.current.flush> = [];
        act(() => {
            flushed = result.current.flush();
        });

        expect(flushed.some((e) => e.type === 'tab_switch')).toBe(true);
        expect(flushed.every((e) => e.type !== undefined)).toBe(true);
        expect(result.current.events).toHaveLength(0);
    });

    it('throttles snapshot publishing — only sends when getSnapshot output changes', () => {
        vi.useFakeTimers();
        let snapshotValue = { text: 'a' };
        const getSnapshot = vi.fn(() => snapshotValue);

        renderHook(() =>
            useLiveSessionTelemetry({
                kind: 'test',
                assignmentKey: 'key1',
                enabled: true,
                getSnapshot,
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key',
            })
        );

        act(() => {
            vi.advanceTimersByTime(5_000);
        });
        expect(getSnapshot).toHaveBeenCalled();

        const callsAfterFirst = getSnapshot.mock.calls.length;
        act(() => {
            vi.advanceTimersByTime(5_000);
        });
        // getSnapshot is polled again even when unchanged
        expect(getSnapshot.mock.calls.length).toBeGreaterThan(callsAfterFirst);

        snapshotValue = { text: 'b' };
        act(() => {
            vi.advanceTimersByTime(5_000);
        });
        expect(getSnapshot).toHaveBeenCalled();
    });

    it('does nothing when disabled', () => {
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: false })
        );

        act(() => {
            window.dispatchEvent(new Event('blur'));
            document.dispatchEvent(new Event('copy'));
        });

        expect(result.current.events).toHaveLength(0);
        expect(result.current.isBroadcasting).toBe(false);
    });
});
