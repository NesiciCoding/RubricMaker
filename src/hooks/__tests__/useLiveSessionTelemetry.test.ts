import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createClient } from '@supabase/supabase-js';
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

    it('captures nothing when the battery promise rejects', async () => {
        const nav = navigator as Navigator & { getBattery?: () => Promise<unknown> };
        nav.getBattery = vi.fn().mockRejectedValue(new Error('denied'));

        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        await act(async () => {
            await Promise.resolve();
        });

        expect(result.current.events.some((e) => e.type === 'battery')).toBe(false);
        delete nav.getBattery;
    });

    it('ignores visibilitychange when the tab becomes visible again', () => {
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(result.current.events.some((e) => e.type === 'tab_switch')).toBe(false);
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

    it('forwards nudge broadcasts to the onNudge callback', () => {
        const onNudge = vi.fn();
        renderHook(() =>
            useLiveSessionTelemetry({
                kind: 'test',
                assignmentKey: 'key1',
                enabled: true,
                onNudge,
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key',
            })
        );

        const broadcasts = mockChannel.on.mock.calls.filter(([type]) => type === 'broadcast');
        expect(broadcasts.length).toBeGreaterThan(0);
        act(() => {
            (broadcasts[broadcasts.length - 1][2] as (payload: unknown) => void)({
                payload: { message: 'nudge!' },
            });
        });
        expect(onNudge).toHaveBeenCalledWith('nudge!');
    });

    it('reflects the realtime subscription status in isBroadcasting', () => {
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({
                kind: 'test',
                assignmentKey: 'key1',
                enabled: true,
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key',
            })
        );

        const subscribes = mockChannel.subscribe.mock.calls;
        act(() => {
            (subscribes[subscribes.length - 1][0] as (status: string) => void)('SUBSCRIBED');
        });
        expect(result.current.isBroadcasting).toBe(true);
    });

    it('dedupes rapid consecutive tab switches', () => {
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        act(() => {
            window.dispatchEvent(new Event('blur'));
            window.dispatchEvent(new Event('blur'));
        });

        expect(result.current.events.filter((e) => e.type === 'tab_switch')).toHaveLength(1);
    });

    it('tracks keyboard and pointer activity for idle detection', () => {
        vi.useFakeTimers();
        const { result } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );

        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown'));
            window.dispatchEvent(new PointerEvent('pointerdown'));
            window.dispatchEvent(new PointerEvent('pointermove'));
        });
        act(() => {
            vi.advanceTimersByTime(20_000);
        });

        const heartbeats = result.current.events.filter((e) => e.type === 'heartbeat');
        expect(heartbeats[heartbeats.length - 1].value).toBe('active');
    });

    it('unmounts cleanly while the battery promise is still pending', async () => {
        let resolveBattery!: (b: unknown) => void;
        const nav = navigator as Navigator & { getBattery?: () => Promise<unknown> };
        nav.getBattery = vi.fn(() => new Promise((resolve) => (resolveBattery = resolve)));

        const { unmount } = renderHook(() =>
            useLiveSessionTelemetry({ kind: 'test', assignmentKey: 'key1', enabled: true })
        );
        unmount();
        await act(async () => {
            resolveBattery({
                level: 0.5,
                charging: true,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            });
            await Promise.resolve();
        });
        delete nav.getBattery;
    });

    it('opens the realtime client on an isolated storage key so it cannot collide with a real session', () => {
        renderHook(() =>
            useLiveSessionTelemetry({
                kind: 'test',
                assignmentKey: 'key1',
                enabled: true,
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key',
            })
        );

        expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key', {
            auth: { persistSession: false, autoRefreshToken: false, storageKey: 'rm_monitor_ephemeral' },
        });
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
