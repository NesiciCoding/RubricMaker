import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveSessionTelemetry } from '../useLiveSessionTelemetry';
import { __resetMonitorClientForTests } from '../../utils/monitorClient';

interface Broadcast {
    type: string;
    event: string;
    payload?: { type?: string };
}

const mockChannel = {
    on: vi.fn().mockReturnThis(),
    send: vi.fn(),
    subscribe: vi.fn().mockReturnThis(),
    state: 'joined',
};

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({ channel: vi.fn(() => mockChannel), removeChannel: vi.fn() })),
}));

/** The heartbeat announcements this student broadcast, as opposed to its 20s heartbeats. */
function announces(): number {
    return mockChannel.send.mock.calls.filter(([message]) => {
        const broadcast = message as Broadcast;
        return broadcast.event === 'event' && broadcast.payload?.type === 'heartbeat';
    }).length;
}

function join() {
    const subscribe = mockChannel.subscribe.mock.calls.at(-1)?.[0] as ((status: string) => void) | undefined;
    act(() => subscribe?.('SUBSCRIBED'));
}

function probeHandler(): (() => void) | undefined {
    const call = mockChannel.on.mock.calls.find(
        ([, options]) => (options as { event?: string } | undefined)?.event === 'probe'
    );
    return call?.[2] as (() => void) | undefined;
}

describe('useLiveSessionTelemetry join announce', () => {
    beforeEach(() => {
        __resetMonitorClientForTests();
        mockChannel.on.mockClear();
        mockChannel.send.mockClear();
        mockChannel.subscribe.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function render() {
        return renderHook(() =>
            useLiveSessionTelemetry({
                kind: 'essay',
                assignmentKey: 'key1',
                enabled: true,
                supabaseUrl: 'https://example.supabase.co',
                supabaseAnonKey: 'anon-key',
            })
        );
    }

    it('announces the join twice and then stops', () => {
        vi.useFakeTimers();
        render();

        join();
        expect(announces()).toBe(1);

        act(() => {
            vi.advanceTimersByTime(1_500);
        });
        expect(announces()).toBe(2);

        // The old burst fired three more times over the next 3.5s; nothing else may fire here.
        act(() => {
            vi.advanceTimersByTime(4_000);
        });
        expect(announces()).toBe(2);
    });

    it('answers a monitor probe with one announce, however late it arrives', () => {
        vi.useFakeTimers();
        render();

        join();
        act(() => {
            vi.advanceTimersByTime(1_500);
        });
        expect(announces()).toBe(2);

        const probe = probeHandler();
        expect(probe).toBeTypeOf('function');
        act(() => probe?.());
        expect(announces()).toBe(3);
    });
});
