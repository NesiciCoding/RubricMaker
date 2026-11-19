import type { PaceTrend } from './monitorSignals';

export type TriageKey = 'flagged' | 'stalled' | 'not_writing' | 'behind';

/** Same threshold the grid's red edge uses, so the strip and the rows agree. */
export const TAB_SWITCH_FLAG_MIN = 3;

export interface TriageRow {
    finished: boolean;
    tabSwitchCount: number;
    /** Whole minutes without progress, when the stall rule is on and the row is stalled. */
    stalledMinutes: number | null;
    /** True once the student has sent any signal at all. */
    started: boolean;
    /** Words for an essay, answered questions for a test; undefined before the first snapshot. */
    progress?: number;
    pace?: PaceTrend;
}

export const TRIAGE_KEYS: readonly TriageKey[] = ['flagged', 'stalled', 'not_writing', 'behind'];

export function isFlagged(row: TriageRow): boolean {
    return !row.finished && (row.tabSwitchCount >= TAB_SWITCH_FLAG_MIN || row.stalledMinutes !== null);
}

export function isStalled(row: TriageRow): boolean {
    return !row.finished && row.stalledMinutes !== null;
}

export function isNotWriting(row: TriageRow): boolean {
    return !row.finished && row.started && (row.progress ?? 0) === 0;
}

export function isBehind(row: TriageRow): boolean {
    return !row.finished && row.pace === 'behind';
}

export function triageMatches(row: TriageRow, key: TriageKey): boolean {
    switch (key) {
        case 'flagged':
            return isFlagged(row);
        case 'stalled':
            return isStalled(row);
        case 'not_writing':
            return isNotWriting(row);
        case 'behind':
            return isBehind(row);
    }
}

export type TriageCounts = Record<TriageKey, number>;

/**
 * Turns a 30-row grid into a worklist: how many students are flagged, stalled, not writing at all,
 * or behind the class. Counts rather than booleans, because the number is the thing a teacher acts
 * on ("3 flagged") and a zero is the thing that lets them ignore the row.
 */
export function triageCounts(rows: readonly TriageRow[]): TriageCounts {
    const counts: TriageCounts = { flagged: 0, stalled: 0, not_writing: 0, behind: 0 };
    for (const row of rows) {
        if (triageMatches(row, 'flagged')) counts.flagged += 1;
        if (triageMatches(row, 'stalled')) counts.stalled += 1;
        if (triageMatches(row, 'not_writing')) counts.not_writing += 1;
        if (triageMatches(row, 'behind')) counts.behind += 1;
    }
    return counts;
}

/** The rows a triage chip narrows the grid to; every row when nothing is selected. */
export function filterByTriage<T extends TriageRow>(rows: readonly T[], key: TriageKey | null): T[] {
    if (!key) return [...rows];
    return rows.filter((row) => triageMatches(row, key));
}
