import type { ProctorEvent } from '../types';

export type PresenceState = 'active' | 'idle' | 'disconnected';

// Heartbeats are sent every ~20s (see HEARTBEAT_INTERVAL_MS in useLiveSessionTelemetry).
// 40s tolerates one missed beat (network hiccup) before downgrading to idle; 90s tolerates
// two before treating the student as disconnected entirely.
const ACTIVE_THRESHOLD_MS = 40_000;
const IDLE_THRESHOLD_MS = 90_000;

export interface ProctorFlagSummary {
    tabSwitchCount: number;
    copyCount: number;
    cutCount: number;
    pasteCount: number;
    /** Most recent battery reading, parsed from `${level}${'+' if charging}`. */
    battery: { level: number; charging: boolean } | null;
    /** True if any seb_status event reported running inside Safe Exam Browser. */
    sebActive: boolean;
}

function latestHeartbeat(events: ProctorEvent[]): ProctorEvent | null {
    let latest: ProctorEvent | null = null;
    for (const event of events) {
        if (event.type !== 'heartbeat') continue;
        if (!latest || new Date(event.at).getTime() > new Date(latest.at).getTime()) {
            latest = event;
        }
    }
    return latest;
}

/**
 * Derives presence from the most recent heartbeat's age and reported value.
 * No heartbeat at all (e.g. student hasn't connected yet) is 'disconnected'.
 */
export function derivePresence(events: ProctorEvent[], now: number = Date.now()): PresenceState {
    const heartbeat = latestHeartbeat(events);
    if (!heartbeat) return 'disconnected';

    const age = now - new Date(heartbeat.at).getTime();
    if (age >= IDLE_THRESHOLD_MS) return 'disconnected';
    if (age >= ACTIVE_THRESHOLD_MS) return 'idle';
    return heartbeat.value === 'idle' ? 'idle' : 'active';
}

function parseBattery(value: ProctorEvent['value']): { level: number; charging: boolean } | null {
    if (typeof value !== 'string' || value.length === 0) return null;
    const charging = value.endsWith('+');
    const levelStr = charging ? value.slice(0, -1) : value;
    const level = Number(levelStr);
    if (Number.isNaN(level)) return null;
    return { level, charging };
}

/** Summarizes proctoring signal counts/states from a flat event list. */
export function summarizeProctorFlags(events: ProctorEvent[]): ProctorFlagSummary {
    const summary: ProctorFlagSummary = {
        tabSwitchCount: 0,
        copyCount: 0,
        cutCount: 0,
        pasteCount: 0,
        battery: null,
        sebActive: false,
    };

    let latestBatteryAt: string | null = null;
    for (const event of events) {
        switch (event.type) {
            case 'tab_switch':
                summary.tabSwitchCount++;
                break;
            case 'copy':
                summary.copyCount++;
                break;
            case 'cut':
                summary.cutCount++;
                break;
            case 'paste':
                summary.pasteCount++;
                break;
            case 'battery':
                if (!latestBatteryAt || new Date(event.at).getTime() > new Date(latestBatteryAt).getTime()) {
                    const parsed = parseBattery(event.value);
                    if (parsed) {
                        summary.battery = parsed;
                        latestBatteryAt = event.at;
                    }
                }
                break;
            case 'seb_status':
                if (event.value === true) summary.sebActive = true;
                break;
        }
    }

    return summary;
}

/**
 * Merges a persisted event log with live broadcast events, deduping by `at`+`type`
 * so re-delivered or already-persisted heartbeats/events aren't double-counted.
 */
export function mergeProctorEvents(persisted: ProctorEvent[], live: ProctorEvent[]): ProctorEvent[] {
    const seen = new Set(persisted.map((e) => `${e.type}:${e.at}`));
    const merged = [...persisted];
    for (const event of live) {
        const key = `${event.type}:${event.at}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(event);
    }
    return merged;
}
