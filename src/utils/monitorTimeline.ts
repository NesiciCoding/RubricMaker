import type { WordSample } from './monitorSignals';

export type TimelineMarkerKind = 'tab_switch' | 'paste' | 'idle';

export interface TimelineMarker {
    /** Epoch ms, matching WordSample.at. */
    at: number;
    kind: TimelineMarkerKind;
}

export interface MonitorTimeline {
    /** Start of the window the curve covers, epoch ms. */
    from: number;
    /** End of the window (now). */
    to: number;
    /** Word counts inside the window, oldest first, with the last sample before it as the baseline. */
    points: WordSample[];
    markers: TimelineMarker[];
    /** Longest stretch with no new words inside the window, in whole minutes (0 when unknown). */
    longestFlatMinutes: number;
}

/** A lesson's worth of history; longer than any single essay session, short enough to read. */
export const TIMELINE_WINDOW_MS = 30 * 60_000;
/** Below this, an unchanged word count is just a slow minute, not a pause worth marking. */
const IDLE_GAP_MS = 5 * 60_000;

/**
 * Turns the two signals the monitor already collects — the word-count samples and the proctoring
 * events — into one small picture of the lesson: what the count did, and what interrupted it.
 * Pure and windowed, so the spotlight can redraw it on every tick without keeping more state.
 */
export function buildTimeline(
    samples: readonly WordSample[],
    events: readonly { type: string; at: string }[],
    now: number,
    windowMs: number = TIMELINE_WINDOW_MS
): MonitorTimeline {
    const to = now;
    const from = now - windowMs;

    const inside = samples.filter((sample) => sample.at >= from && sample.at <= to);
    // The newest sample before the window is the baseline the curve starts from, so the first
    // stretch reads as a real count instead of appearing out of nowhere.
    const baseline = samples.filter((sample) => sample.at < from).at(-1);
    const points = baseline ? [baseline, ...inside] : inside;

    const markers: TimelineMarker[] = [];
    for (const event of events) {
        if (event.type !== 'tab_switch' && event.type !== 'paste') continue;
        const at = new Date(event.at).getTime();
        if (Number.isNaN(at) || at < from || at > to) continue;
        markers.push({ at, kind: event.type });
    }

    // Samples are change points: appendWordSample drops a repeated count, so a stall leaves no
    // samples at all and shows up only as the time between two of them. Each count is held until
    // the next change, and the last one until now. Only the part of a stretch inside the window counts.
    let longestFlatMs = 0;
    const notePause = (start: number, end: number, markerAt: number) => {
        const gap = end - Math.max(start, from);
        if (gap <= 0) return;
        longestFlatMs = Math.max(longestFlatMs, gap);
        if (gap >= IDLE_GAP_MS) markers.push({ at: markerAt, kind: 'idle' });
    };
    for (let index = 1; index < points.length; index += 1) {
        notePause(points[index - 1].at, points[index].at, points[index].at);
    }
    const newest = points.at(-1);
    if (newest) notePause(newest.at, to, to);
    markers.sort((a, b) => a.at - b.at);

    return { from, to, points, markers, longestFlatMinutes: Math.round(longestFlatMs / 60_000) };
}
