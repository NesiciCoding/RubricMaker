import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createClient } from '@supabase/supabase-js';
import { useLiveSessionTelemetry } from '../useLiveSessionTelemetry';
import { __resetMonitorClientForTests } from '../../utils/monitorClient';

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
    beforeEach(() => {
        __resetMonitorClientForTests();
        vi.mocked(createClient).mockClear();
        mockChannel.on.mockClear();
        mockChannel.send.mockClear();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        Object.assign(mockChannel, { state: undefined });
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

    it('samples every 5s but sends fresh draft text at most once a minute', () => {
        vi.useFakeTimers();
        Object.assign(mockChannel, { state: 'joined' });
        let words = 1;
        const getSnapshot = vi.fn(() => ({ text: `draft ${words}`, wordCount: words }));

        renderHook(() =>
            useLiveSessionTelemetry({
                kind: 'essay',
                assignmentKey: 'key1',
                enabled: true,
                getSnapshot,
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key',
            })
        );

        // The join announce flushes the first snapshot straight away, text included.
        act(() => {
            (mockChannel.subscribe.mock.calls.at(-1)?.[0] as (status: string) => void)('SUBSCRIBED');
        });
        const sentSnapshots = () =>
            mockChannel.send.mock.calls
                .map(([message]) => message as { event: string; payload: Record<string, unknown> })
                .filter((message) => message.event === 'snapshot')
                .map((message) => message.payload);
        expect(sentSnapshots().at(-1)).toMatchObject({ text: 'draft 1', wordCount: 1 });

        // The next tick carries the new word count but leaves the prose out until the minute is up.
        words = 2;
        act(() => {
            vi.advanceTimersByTime(5_000);
        });
        expect(sentSnapshots().at(-1)).toEqual({ wordCount: 2, typedChars: 0, pastedChars: 0 });

        words = 3;
        act(() => {
            vi.advanceTimersByTime(55_000);
        });
        expect(sentSnapshots().at(-1)).toMatchObject({ text: 'draft 3', wordCount: 3 });
    });

    function inputEvent(inputType: string, data: string) {
        const event = new Event('input');
        Object.defineProperty(event, 'inputType', { value: inputType });
        Object.defineProperty(event, 'data', { value: data });
        return event;
    }

    function pasteEvent(text: string) {
        const event = new Event('paste', { bubbles: true });
        Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
        return event;
    }

    function renderEssayTelemetry(initialKey: string) {
        return renderHook(
            ({ assignmentKey }: { assignmentKey: string }) =>
                useLiveSessionTelemetry({
                    kind: 'essay',
                    assignmentKey,
                    enabled: true,
                    getSnapshot: () => ({ text: 'draft', wordCount: 1 }),
                    supabaseUrl: 'https://example.supabase.co',
                    supabaseAnonKey: 'anon-key',
                }),
            { initialProps: { assignmentKey: initialKey } }
        );
    }

    function lastSnapshotPayload() {
        act(() => {
            (mockChannel.subscribe.mock.calls.at(-1)?.[0] as (status: string) => void)('SUBSCRIBED');
            vi.advanceTimersByTime(6_000);
        });
        return mockChannel.send.mock.calls
            .map(([message]) => message as { event: string; payload: Record<string, unknown> })
            .filter((message) => message.event === 'snapshot')
            .at(-1)?.payload;
    }

    it('counts typed and pasted characters without ever recording their content', () => {
        vi.useFakeTimers();
        Object.assign(mockChannel, { state: 'joined' });
        const getSnapshot = vi.fn(() => ({ text: 'draft', wordCount: 1 }));

        renderHook(() =>
            useLiveSessionTelemetry({
                kind: 'essay',
                assignmentKey: 'key1',
                enabled: true,
                getSnapshot,
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key',
            })
        );

        const typed = new Event('input') as Event & { inputType?: string; data?: string };
        Object.defineProperty(typed, 'inputType', { value: 'insertText' });
        Object.defineProperty(typed, 'data', { value: 'hello' });
        act(() => {
            document.dispatchEvent(typed);
        });

        const editor = document.createElement('textarea');
        document.body.appendChild(editor);
        act(() => {
            editor.dispatchEvent(pasteEvent('pasted!'));
        });
        editor.remove();

        const snapshot = lastSnapshotPayload();
        expect(snapshot).toMatchObject({ typedChars: 5, pastedChars: 7 });
        expect(JSON.stringify(snapshot)).not.toContain('pasted!');
    });

    it('ignores a paste that landed outside an editable element', () => {
        vi.useFakeTimers();
        Object.assign(mockChannel, { state: 'joined' });
        renderEssayTelemetry('key1');

        act(() => {
            document.dispatchEvent(pasteEvent('x'.repeat(80)));
        });

        expect(lastSnapshotPayload()).toMatchObject({ pastedChars: 0 });
    });

    it('counts an IME composition once, when it is committed, not on every rewrite', () => {
        vi.useFakeTimers();
        Object.assign(mockChannel, { state: 'joined' });
        renderEssayTelemetry('key1');

        act(() => {
            for (const data of ['a', 'ab', 'abc']) document.dispatchEvent(inputEvent('insertCompositionText', data));
            const end = new Event('compositionend');
            Object.defineProperty(end, 'data', { value: 'abc' });
            document.dispatchEvent(end);
        });

        expect(lastSnapshotPayload()).toMatchObject({ typedChars: 3 });
    });

    it('restarts the typed and pasted counts when the assignment changes, not on a re-render', () => {
        vi.useFakeTimers();
        Object.assign(mockChannel, { state: 'joined' });
        const { rerender } = renderEssayTelemetry('assignment-a');

        act(() => {
            document.dispatchEvent(inputEvent('insertText', 'x'.repeat(1000)));
        });
        rerender({ assignmentKey: 'assignment-a' });
        expect(lastSnapshotPayload()).toMatchObject({ typedChars: 1000 });

        rerender({ assignmentKey: 'assignment-b' });
        expect(lastSnapshotPayload()).toMatchObject({ typedChars: 0, pastedChars: 0 });
    });

    it('hands the prose to persistDraftText only on the ticks that actually carry it', () => {
        vi.useFakeTimers();
        Object.assign(mockChannel, { state: 'joined' });
        let words = 1;
        const persistDraftText = vi.fn();
        const getSnapshot = vi.fn(() => ({ text: `draft ${words}`, wordCount: words }));

        renderHook(() =>
            useLiveSessionTelemetry({
                kind: 'essay',
                assignmentKey: 'key1',
                enabled: true,
                getSnapshot,
                persistDraftText,
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key',
            })
        );

        act(() => {
            (mockChannel.subscribe.mock.calls.at(-1)?.[0] as (status: string) => void)('SUBSCRIBED');
        });
        expect(persistDraftText).toHaveBeenLastCalledWith({ text: 'draft 1', wordCount: 1 });

        // A stats-only tick must not store the same prose a second time.
        words = 2;
        act(() => {
            vi.advanceTimersByTime(5_000);
        });
        expect(persistDraftText).toHaveBeenCalledTimes(1);

        words = 3;
        act(() => {
            vi.advanceTimersByTime(60_000);
        });
        expect(persistDraftText).toHaveBeenLastCalledWith({ text: 'draft 3', wordCount: 3 });
        expect(persistDraftText).toHaveBeenCalledTimes(2);
    });

    it('lifts the draft-text throttle only while a teacher spotlight is on', () => {
        vi.useFakeTimers();
        Object.assign(mockChannel, { state: 'joined' });
        let words = 1;
        const getSnapshot = vi.fn(() => ({ text: `draft ${words}`, wordCount: words }));

        const { result } = renderHook(() =>
            useLiveSessionTelemetry({
                kind: 'essay',
                assignmentKey: 'key1',
                enabled: true,
                getSnapshot,
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key',
            })
        );

        act(() => {
            (mockChannel.subscribe.mock.calls.at(-1)?.[0] as (status: string) => void)('SUBSCRIBED');
        });
        const sentSnapshots = () =>
            mockChannel.send.mock.calls
                .map(([message]) => message as { event: string; payload: Record<string, unknown> })
                .filter((message) => message.event === 'snapshot')
                .map((message) => message.payload);

        words = 2;
        act(() => {
            vi.advanceTimersByTime(5_000);
        });
        expect(sentSnapshots().at(-1)).not.toHaveProperty('text');

        const spotlightHandler = mockChannel.on.mock.calls
            .filter(([type, opts]) => type === 'broadcast' && (opts as { event: string }).event === 'spotlight')
            .at(-1)?.[2] as ((msg: { payload: unknown }) => void) | undefined;
        expect(spotlightHandler).toBeDefined();

        words = 3;
        act(() => {
            spotlightHandler!({ payload: { on: true } });
            vi.advanceTimersByTime(5_000);
        });
        expect(result.current.spotlighted).toBe(true);
        expect(sentSnapshots().at(-1)).toMatchObject({ text: 'draft 3', wordCount: 3 });

        act(() => {
            spotlightHandler!({ payload: { on: false } });
        });
        expect(result.current.spotlighted).toBe(false);
    });

    it('answers a monitor probe with one heartbeat that keeps an idle student idle', () => {
        vi.useFakeTimers();
        Object.assign(mockChannel, { state: 'joined' });
        renderHook(() =>
            useLiveSessionTelemetry({
                kind: 'test',
                assignmentKey: 'key1',
                enabled: true,
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key',
            })
        );
        act(() => {
            (mockChannel.subscribe.mock.calls.at(-1)?.[0] as (status: string) => void)('SUBSCRIBED');
        });
        const probe = mockChannel.on.mock.calls
            .filter(([type, opts]) => type === 'broadcast' && (opts as { event: string }).event === 'probe')
            .at(-1)?.[2] as (() => void) | undefined;
        expect(probe).toBeDefined();
        const heartbeats = () =>
            mockChannel.send.mock.calls
                .map(([message]) => message as { event: string; payload: { type: string; value: string } })
                .filter((message) => message.event === 'event' && message.payload.type === 'heartbeat');

        mockChannel.send.mockClear();
        act(() => {
            probe!();
        });
        expect(heartbeats().map((message) => message.payload.value)).toEqual(['active']);

        act(() => {
            vi.setSystemTime(Date.now() + 61_000);
        });
        mockChannel.send.mockClear();
        act(() => {
            probe!();
        });
        expect(heartbeats().map((message) => message.payload.value)).toEqual(['idle']);
    });

    it('announces active on join even after a long wait before the session was enabled', () => {
        vi.useFakeTimers();
        Object.assign(mockChannel, { state: 'joined' });
        const { rerender } = renderHook(
            ({ enabled }: { enabled: boolean }) =>
                useLiveSessionTelemetry({
                    kind: 'test',
                    assignmentKey: 'key1',
                    enabled,
                    supabaseUrl: 'https://example.supabase.co',
                    supabaseAnonKey: 'anon-key',
                }),
            { initialProps: { enabled: false } }
        );
        act(() => {
            vi.advanceTimersByTime(90_000);
        });
        mockChannel.send.mockClear();

        rerender({ enabled: true });
        act(() => {
            (mockChannel.subscribe.mock.calls.at(-1)?.[0] as (status: string) => void)('SUBSCRIBED');
        });

        const values = mockChannel.send.mock.calls
            .map(([message]) => message as { event: string; payload: { type: string; value: string } })
            .filter((message) => message.event === 'event' && message.payload.type === 'heartbeat')
            .map((message) => message.payload.value);
        expect(values).toEqual(['active']);
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

        const nudgeHandler = mockChannel.on.mock.calls
            .filter(([type, opts]) => type === 'broadcast' && (opts as { event: string }).event === 'nudge')
            .at(-1)?.[2] as ((msg: { payload: unknown }) => void) | undefined;
        expect(nudgeHandler).toBeDefined();
        act(() => {
            nudgeHandler!({ payload: { message: 'nudge!' } });
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

    it('waits for a still-leaving channel on the same topic before joining again', async () => {
        // The monitor client is shared, so client.channel(topic) would hand back a channel a
        // previous mount is still removing — subscribing to that one is a silent no-op.
        let releaseStale!: () => void;
        const staleRemoved = new Promise<string>((resolve) => {
            releaseStale = () => resolve('ok');
        });
        const stale = { topic: 'realtime:monitor:test:key1' };
        const clientWithStale = {
            ...mockClient,
            getChannels: vi.fn(() => [stale]),
            removeChannel: vi.fn(() => staleRemoved),
        };
        vi.mocked(createClient).mockReturnValueOnce(clientWithStale as never);
        mockClient.channel.mockClear();

        renderHook(() =>
            useLiveSessionTelemetry({
                kind: 'test',
                assignmentKey: 'key1',
                enabled: true,
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key',
            })
        );

        expect(clientWithStale.removeChannel).toHaveBeenCalledWith(stale);
        expect(clientWithStale.channel).not.toHaveBeenCalled();

        await act(async () => {
            releaseStale();
            await staleRemoved;
        });
        expect(clientWithStale.channel).toHaveBeenCalledWith('monitor:test:key1', expect.anything());
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
