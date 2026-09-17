import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProctorEvent, CefrLevel } from '../types';

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
    /** Current CEFR level/Elo anchor/progress of a generator-engine (roadmap 27.1) placement run in progress, for the Live Monitor's live level display (27.3). */
    generatorLevel?: CefrLevel;
    generatorEloAnchor?: number;
    questionsAsked?: number;
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
    /**
     * Sends a one-off broadcast on the active session channel and resolves with
     * the server acknowledgement ('ok'), a timeout, or an error — or 'ok'
     * immediately when no channel is live. Used for state transitions the
     * channel owner needs to see — e.g. the student broadcasting 'submitted'
     * just before `enabled` flips false and tears the channel down. Callers
     * that gate UI on the broadcast (like the submitted confirmation) should
     * await it; the channel is configured with `broadcast.ack: true` so the
     * promise only resolves once the Realtime server confirmed receipt.
     */
    broadcast: (event: string, payload?: unknown) => Promise<'ok' | 'timed out' | 'error'>;
}

function shallowEqualSnapshot(a: LiveSessionSnapshot | null, b: LiveSessionSnapshot): boolean {
    if (!a) return false;
    return (
        a.text === b.text &&
        a.wordCount === b.wordCount &&
        JSON.stringify(a.answers) === JSON.stringify(b.answers) &&
        a.generatorLevel === b.generatorLevel &&
        a.generatorEloAnchor === b.generatorEloAnchor &&
        a.questionsAsked === b.questionsAsked
    );
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
    useEffect(() => {
        onNudgeRef.current = onNudge;
    }, [onNudge]);

    const hasDb = !!(supabaseUrl && supabaseAnonKey);

    // Broadcasts that fired before the channel finished joining (or during a reconnect gap) are
    // held here and flushed once it's joined — see wsSend / the subscribe handler below.
    const pendingBroadcastsRef = useRef<{ event: string; payload: unknown }[]>([]);

    // Push a broadcast over the live WebSocket. When the channel isn't joined, realtime-js's send()
    // silently falls back to a REST POST and logs a deprecation warning ("send() is automatically
    // falling back to REST API…"). Rather than take that path, a `buffer` broadcast (a discrete
    // proctor event that must arrive — e.g. the once-at-mount seb_status, a tab switch) is queued
    // and flushed on join; a non-buffered broadcast (an ephemeral heartbeat/snapshot that re-fires
    // on its own interval) is simply dropped, since a stale REST-delivered copy adds nothing. The
    // deliberate, must-arrive 'submitted' handoff still uses send() directly (via broadcast() below).
    const wsSend = useCallback(
        (event: string, payload: unknown, opts?: { buffer?: boolean }) => {
            const ch = channelRef.current;
            if (ch && (ch.state as string) === 'joined') {
                ch.send({ type: 'broadcast', event, payload });
                return;
            }
            if (opts?.buffer && hasDb) {
                pendingBroadcastsRef.current.push({ event, payload });
                if (pendingBroadcastsRef.current.length > 100) pendingBroadcastsRef.current.shift();
            }
        },
        [hasDb]
    );

    const pushEvent = useCallback(
        (event: ProctorEvent) => {
            eventsRef.current = [...eventsRef.current, event];
            setEvents(eventsRef.current);
            wsSend('event', event, { buffer: true });
        },
        [wsSend]
    );

    const broadcast = useCallback((event: string, payload?: unknown): Promise<'ok' | 'timed out' | 'error'> => {
        // send() is typed as a branded `string` in this realtime-js version; its runtime
        // values are exactly 'ok' | 'timed out' | 'error' (see RealtimeChannel.send).
        return (channelRef.current?.send({ type: 'broadcast', event, payload }) ??
            Promise.resolve('ok' as const)) as Promise<'ok' | 'timed out' | 'error'>;
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
            auth: { persistSession: false, autoRefreshToken: false, storageKey: 'rm_monitor_ephemeral' },
        });
        // ack:true makes send() resolve only after the server confirms receipt —
        // important for the 'submitted' broadcast, which is fire-and-forget today
        // but must not be silently dropped right before the channel tears down.
        const channel = client.channel(`monitor:${kind}:${assignmentKey}`, {
            config: { broadcast: { ack: true, self: false } },
        });
        channel.on('broadcast', { event: 'nudge' }, ({ payload }) => {
            onNudgeRef.current?.((payload as { message: string }).message);
        });
        channel.subscribe((status) => {
            setIsBroadcasting(status === 'SUBSCRIBED');
            if (status !== 'SUBSCRIBED') return;
            // Flush any broadcasts buffered before the channel joined (e.g. the once-at-mount
            // seb_status, or a tab switch during the join window) — now that it's joined they go
            // over the socket with no REST fallback.
            const buffered = pendingBroadcastsRef.current;
            pendingBroadcastsRef.current = [];
            for (const b of buffered) {
                channel.send({ type: 'broadcast', event: b.event, payload: b.payload });
            }
            // Announce the join immediately — and a few times over the next seconds:
            // the regular heartbeat only fires every ~20s, so without this the
            // teacher's monitor would keep showing the student as disconnected for
            // that whole window after they connect. The retries cover the teacher's
            // monitor channel joining a moment later (its row renders before the
            // channel finishes subscribing) — a one-shot broadcast at join would
            // otherwise be silently missed and presence would lie until the first
            // real heartbeat.
            const announce = (delayMs: number) => {
                setTimeout(() => {
                    if (channelRef.current !== channel) return; // channel already torn down
                    channel.send({
                        type: 'broadcast',
                        event: 'event',
                        payload: { type: 'heartbeat', at: new Date().toISOString(), value: 'active' },
                    });
                }, delayMs);
            };
            announce(0);
            announce(750);
            announce(1500);
            announce(3000);
            announce(5000);
        });
        channelRef.current = channel;
        return () => {
            channelRef.current = null;
            pendingBroadcastsRef.current = [];
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
            /* v8 ignore next -- report only fires after getBattery assigns battery */
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
        const tick = () => {
            const snapshot = getSnapshot();
            if (!shallowEqualSnapshot(lastSnapshotRef.current, snapshot)) {
                lastSnapshotRef.current = snapshot;
                wsSend('snapshot', snapshot);
            }
        };
        // Fire once right away (re-runs when isBroadcasting flips true, i.e. the channel just
        // subscribed) so the teacher's first snapshot lands immediately instead of after a full
        // SNAPSHOT_INTERVAL_MS — the initial-signal lag point 2 called out.
        if (isBroadcasting) tick();
        const interval = setInterval(tick, SNAPSHOT_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [enabled, getSnapshot, hasDb, isBroadcasting, wsSend]);

    return { events, flush, isBroadcasting, broadcast };
}
