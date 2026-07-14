import type { ProctorEvent, StudentTest, Test } from '../types';

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

export interface StudentTimeOnTask {
    studentId: string;
    durationMinutes: number;
    /** True when this submission looks suspiciously fast next to the class or the test's time limit. */
    isOutlier: boolean;
}

export interface TestTimeOnTaskSummary {
    perStudent: StudentTimeOnTask[];
    averageMinutes: number;
    medianMinutes: number;
}

const EMPTY_SUMMARY: TestTimeOnTaskSummary = { perStudent: [], averageMinutes: 0, medianMinutes: 0 };

// ponytail: outlier = under 30% of the class median, or under 20% of the test's time
// limit when set — a simple relative-speed heuristic, not a statistical model. Revisit
// with a proper z-score/IQR approach if teachers report false positives/negatives.
const CLASS_MEDIAN_OUTLIER_RATIO = 0.3;
const TIME_LIMIT_OUTLIER_RATIO = 0.2;

/**
 * Duration-on-task per submitted StudentTest, from startedAt/submittedAt, plus the
 * class average/median and an outlier flag for submissions that look too fast.
 */
export function calcTestTimeOnTask(test: Test, studentTests: StudentTest[]): TestTimeOnTaskSummary {
    const durations = studentTests
        .filter((st) => st.testId === test.id && st.submittedAt)
        .map((st) => ({
            studentId: st.studentId,
            durationMinutes: (new Date(st.submittedAt!).getTime() - new Date(st.startedAt).getTime()) / 60_000,
        }))
        .filter((d) => d.durationMinutes >= 0);

    if (durations.length === 0) return EMPTY_SUMMARY;

    const sorted = [...durations.map((d) => d.durationMinutes)].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianMinutes = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const averageMinutes = sorted.reduce((sum, d) => sum + d, 0) / sorted.length;

    const perStudent = durations.map(({ studentId, durationMinutes }) => {
        const belowClassMedian = durations.length >= 3 && durationMinutes <= medianMinutes * CLASS_MEDIAN_OUTLIER_RATIO;
        const belowTimeLimit =
            !!test.durationMinutes && durationMinutes <= test.durationMinutes * TIME_LIMIT_OUTLIER_RATIO;
        return { studentId, durationMinutes, isOutlier: belowClassMedian || belowTimeLimit };
    });

    return { perStudent, averageMinutes, medianMinutes };
}
