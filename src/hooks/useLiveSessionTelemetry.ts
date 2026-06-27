import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProctorEvent } from '../types';

const HEARTBEAT_INTERVAL_MS = 20_000;
const IDLE_THRESHOLD_MS = 60_000;
const SNAPSHOT_INTERVAL_MS = 5_000;
const TAB_SWITCH_DEDUPE_MS = 750;

interface BatteryManagerLike {
    level: number;
    charging: boolean;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
}

interface NavigatorWithBattery extends Navigator {
    getBattery?: () => Promise<BatteryManagerLike>;
}

export interface LiveSessionSnapshot {
    text?: string;
    answers?: unknown;
    wordCount?: number;
}

export interface UseLiveSessionTelemetryOptions {
    /** Kind of session being monitored — used in the Realtime channel name. */
    kind: 'test' | 'essay';
    /** Stable identifier for this assignment — used in the Realtime channel name. */
    assignmentKey: string;
    /** Telemetry is only captured/broadcast while true. */
    enabled: boolean;
    /** Optional snapshot producer for throttled work-in-progress broadcasts. */
    getSnapshot?: () => LiveSessionSnapshot;
    /** When provided (DB mode), heartbeats/events/snapshots broadcast on a Realtime channel. */
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    /** Called when a teacher sends a "nudge" broadcast on this session's monitor channel. */
    onNudge?: (message: string) => void;
}

export interface UseLiveSessionTelemetryReturn {
    events: ProctorEvent[];
    /** Returns the accumulated event log (excluding ephemeral snapshots) and clears it. */
    flush: () => ProctorEvent[];
    /** True once a Realtime broadcast channel is active (DB mode, enabled). */
    isBroadcasting: boolean;
}

function shallowEqualSnapshot(a: LiveSessionSnapshot | null, b: LiveSessionSnapshot): boolean {
    if (!a) return false;
    return a.text === b.text && a.wordCount === b.wordCount && JSON.stringify(a.answers) === JSON.stringify(b.answers);
}

/**
 * Generic live-session telemetry: tab-switch/copy/paste detection, battery status,
 * heartbeats with active/idle state, and SEB detection. Optionally broadcasts
 * heartbeats, events, and throttled work-in-progress snapshots over a Supabase
 * Realtime channel named `monitor:{kind}:{assignmentKey}` so a teacher-side
 * monitor page can subscribe.
 */
export function useLiveSessionTelemetry({
    kind,
    assignmentKey,
    enabled,
    getSnapshot,
    supabaseUrl,
    supabaseAnonKey,
    onNudge,
}: UseLiveSessionTelemetryOptions): UseLiveSessionTelemetryReturn {
    const [events, setEvents] = useState<ProctorEvent[]>([]);
    const [isBroadcasting, setIsBroadcasting] = useState(false);

    const lastActivityRef = useRef<number>(Date.now());
    const lastTabSwitchAtRef = useRef(0);
    const lastSnapshotRef = useRef<LiveSessionSnapshot | null>(null);
    const channelRef = useRef<ReturnType<SupabaseClient['channel']> | null>(null);
    // Mirrors `events` so flush() can read the latest log synchronously —
    // setState updaters are not guaranteed to run before flush() returns.
    const eventsRef = useRef<ProctorEvent[]>([]);
    // Mirrors `onNudge` so the channel-setup effect doesn't need it in its deps (avoids resubscribing on every render).
    const onNudgeRef = useRef(onNudge);
    onNudgeRef.current = onNudge;

    const hasDb = !!(supabaseUrl && supabaseAnonKey);

    const pushEvent = useCallback((event: ProctorEvent) => {
        eventsRef.current = [...eventsRef.current, event];
        setEvents(eventsRef.current);
        channelRef.current?.send({ type: 'broadcast', event: 'event', payload: event });
    }, []);

    const flush = useCallback((): ProctorEvent[] => {
        const result = eventsRef.current;
        eventsRef.current = [];
        setEvents([]);
        return result;
    }, []);

    // ── Realtime channel setup (DB mode only) ────────────────────────────────
    useEffect(() => {
        if (!enabled || !hasDb) {
            setIsBroadcasting(false);
            return;
        }
        const client = createClient(supabaseUrl!, supabaseAnonKey!, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const channel = client.channel(`monitor:${kind}:${assignmentKey}`);
        channel.on('broadcast', { event: 'nudge' }, ({ payload }) => {
            onNudgeRef.current?.((payload as { message: string }).message);
        });
        channel.subscribe((status) => {
            setIsBroadcasting(status === 'SUBSCRIBED');
        });
        channelRef.current = channel;
        return () => {
            channelRef.current = null;
            void client.removeChannel(channel);
            setIsBroadcasting(false);
        };
    }, [enabled, hasDb, kind, assignmentKey, supabaseUrl, supabaseAnonKey]);

    // ── tab_switch: visibilitychange + window blur ───────────────────────────
    useEffect(() => {
        if (!enabled) return;
        const emitTabSwitch = () => {
            const now = Date.now();
            if (now - lastTabSwitchAtRef.current < TAB_SWITCH_DEDUPE_MS) return;
            lastTabSwitchAtRef.current = now;
            pushEvent({ type: 'tab_switch', at: new Date().toISOString() });
        };
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                emitTabSwitch();
            }
        };
        const onBlur = () => {
            emitTabSwitch();
        };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('blur', onBlur);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('blur', onBlur);
        };
    }, [enabled, pushEvent]);

    // ── copy / cut / paste — counts + timestamps only ────────────────────────
    useEffect(() => {
        if (!enabled) return;
        const onCopy = () => pushEvent({ type: 'copy', at: new Date().toISOString() });
        const onCut = () => pushEvent({ type: 'cut', at: new Date().toISOString() });
        const onPaste = () => pushEvent({ type: 'paste', at: new Date().toISOString() });
        document.addEventListener('copy', onCopy);
        document.addEventListener('cut', onCut);
        document.addEventListener('paste', onPaste);
        return () => {
            document.removeEventListener('copy', onCopy);
            document.removeEventListener('cut', onCut);
            document.removeEventListener('paste', onPaste);
        };
    }, [enabled, pushEvent]);

    // ── battery status — initial reading + change events ─────────────────────
    useEffect(() => {
        if (!enabled) return;
        const nav = navigator as NavigatorWithBattery;
        if (!nav.getBattery) return;

        let battery: BatteryManagerLike | null = null;
        const report = () => {
            if (!battery) return;
            pushEvent({
                type: 'battery',
                at: new Date().toISOString(),
                value: `${Math.round(battery.level * 100)}${battery.charging ? '+' : ''}`,
            });
        };

        let onLevelChange: (() => void) | null = null;
        let onChargingChange: (() => void) | null = null;

        nav.getBattery()
            .then((b) => {
                battery = b;
                report();
                onLevelChange = report;
                onChargingChange = report;
                b.addEventListener('levelchange', onLevelChange);
                b.addEventListener('chargingchange', onChargingChange);
            })
            .catch(() => {
                /* Battery Status API unavailable — no-op */
            });

        return () => {
            if (battery && onLevelChange) battery.removeEventListener('levelchange', onLevelChange);
            if (battery && onChargingChange) battery.removeEventListener('chargingchange', onChargingChange);
        };
    }, [enabled, pushEvent]);

    // ── seb_status — once at mount ───────────────────────────────────────────
    useEffect(() => {
        if (!enabled) return;
        pushEvent({ type: 'seb_status', at: new Date().toISOString(), value: /SEB/i.test(navigator.userAgent) });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    // ── activity tracking for idle detection ─────────────────────────────────
    useEffect(() => {
        if (!enabled) return;
        const onActivity = () => {
            lastActivityRef.current = Date.now();
        };
        window.addEventListener('keydown', onActivity);
        window.addEventListener('pointerdown', onActivity);
        window.addEventListener('pointermove', onActivity);
        return () => {
            window.removeEventListener('keydown', onActivity);
            window.removeEventListener('pointerdown', onActivity);
            window.removeEventListener('pointermove', onActivity);
        };
    }, [enabled]);

    // ── heartbeat every ~20s with active/idle state ──────────────────────────
    useEffect(() => {
        if (!enabled) return;
        const interval = setInterval(() => {
            const idle = Date.now() - lastActivityRef.current >= IDLE_THRESHOLD_MS;
            pushEvent({ type: 'heartbeat', at: new Date().toISOString(), value: idle ? 'idle' : 'active' });
        }, HEARTBEAT_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [enabled, pushEvent]);

    // ── throttled work-in-progress snapshots (ephemeral, broadcast only) ─────
    useEffect(() => {
        if (!enabled || !getSnapshot || !hasDb) return;
        const interval = setInterval(() => {
            const snapshot = getSnapshot();
            if (!shallowEqualSnapshot(lastSnapshotRef.current, snapshot)) {
                lastSnapshotRef.current = snapshot;
                channelRef.current?.send({ type: 'broadcast', event: 'snapshot', payload: snapshot });
            }
        }, SNAPSHOT_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [enabled, getSnapshot, hasDb]);

    return { events, flush, isBroadcasting };
}
