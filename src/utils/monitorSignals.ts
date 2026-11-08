export const DEFAULT_STALL_MINUTES = 4;
export const MIN_STALL_MINUTES = 1;
export const MAX_STALL_MINUTES = 30;

export function clampStallMinutes(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value)) return DEFAULT_STALL_MINUTES;
    return Math.min(MAX_STALL_MINUTES, Math.max(MIN_STALL_MINUTES, Math.round(value)));
}

/** Whole minutes without progress once that reaches the threshold; null while the student is still within it. */
export function stalledMinutes(
    lastProgressAt: number | undefined,
    now: number,
    thresholdMinutes: number
): number | null {
    if (lastProgressAt === undefined) return null;
    const minutes = Math.floor((now - lastProgressAt) / 60_000);
    return minutes >= thresholdMinutes ? minutes : null;
}

export type PaceTrend = 'ahead' | 'on_pace' | 'behind';

export interface PaceInput {
    id: string;
    answered: number;
    total: number;
    /** Handed-in students count towards the class median but get no indicator themselves. */
    finished?: boolean;
}

/** Fewer students than this and a "class median" is just one other student's position. */
export const MIN_PACE_COHORT = 3;

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compares each student's share of questions answered with the class median right now. The band is
 * one question or 10% of the test, whichever is wider, so a single answer's difference reads as on pace.
 */
export function paceVsClass(inputs: PaceInput[]): Map<string, PaceTrend> {
    const result = new Map<string, PaceTrend>();
    const cohort = inputs.filter((i) => i.total > 0);
    if (cohort.length < MIN_PACE_COHORT) return result;
    const classMedian = median(cohort.map((i) => i.answered / i.total));
    for (const input of cohort) {
        if (input.finished) continue;
        const diff = input.answered / input.total - classMedian;
        const band = Math.max(0.1, 1 / input.total) + 1e-9;
        result.set(input.id, diff > band ? 'ahead' : diff < -band ? 'behind' : 'on_pace');
    }
    return result;
}

export interface WordSample {
    at: number;
    words: number;
}

export const WRITING_PACE_WINDOW_MS = 3 * 60_000;
const SAMPLE_RETENTION_MS = 2 * WRITING_PACE_WINDOW_MS + 60_000;

/** Keeps the sample history to what the two pace windows need; consecutive equal counts collapse into one sample. */
export function appendWordSample(samples: WordSample[], sample: WordSample): WordSample[] {
    const last = samples[samples.length - 1];
    const next = last && last.words === sample.words ? samples : [...samples, sample];
    const cutoff = sample.at - SAMPLE_RETENTION_MS;
    // Keep the newest sample at or before the cutoff: it is the baseline the oldest window measures from.
    let firstKept = 0;
    while (firstKept + 1 < next.length && next[firstKept + 1].at <= cutoff) firstKept++;
    return firstKept > 0 ? next.slice(firstKept) : next;
}

function wordsAt(samples: WordSample[], at: number): number | undefined {
    let words: number | undefined;
    for (const s of samples) {
        if (s.at > at) break;
        words = s.words;
    }
    return words;
}

export type WritingTrend = 'speeding_up' | 'steady' | 'slowing' | 'stopped';

export interface WritingPace {
    /** Words per minute over the last few minutes (deletions count as zero, not negative). */
    wpm: number;
    trend?: WritingTrend;
}

/** No samples old enough to span at least a minute → undefined; the pace would be noise. */
export function writingPace(samples: WordSample[], now: number): WritingPace | undefined {
    if (samples.length === 0) return undefined;
    const current = samples[samples.length - 1].words;
    const windowStart = now - WRITING_PACE_WINDOW_MS;
    const base = wordsAt(samples, windowStart);
    const baseWords = base ?? samples[0].words;
    const elapsedMs = base !== undefined ? WRITING_PACE_WINDOW_MS : now - samples[0].at;
    if (elapsedMs < 60_000) return undefined;
    const wpm = Math.max(0, current - baseWords) / (elapsedMs / 60_000);

    const lastChangeAt = samples[samples.length - 1].at;
    if (wpm === 0 && now - lastChangeAt >= 2 * 60_000) return { wpm, trend: 'stopped' };

    const prevBase = wordsAt(samples, now - 2 * WRITING_PACE_WINDOW_MS);
    if (base === undefined || prevBase === undefined) return { wpm };
    const prevWpm = Math.max(0, base - prevBase) / (WRITING_PACE_WINDOW_MS / 60_000);
    if (wpm < prevWpm * 0.6 && prevWpm - wpm >= 2) return { wpm, trend: 'slowing' };
    if (wpm > prevWpm * 1.4 && wpm - prevWpm >= 2) return { wpm, trend: 'speeding_up' };
    return { wpm, trend: 'steady' };
}

/** "45 s" under a minute, whole minutes after that — matches the 5 s refresh tick without pretending to more precision. */
export function elapsedParts(since: number, now: number): { unit: 'seconds' | 'minutes'; value: number } {
    const seconds = Math.max(0, Math.floor((now - since) / 1000));
    return seconds < 60 ? { unit: 'seconds', value: seconds } : { unit: 'minutes', value: Math.floor(seconds / 60) };
}
