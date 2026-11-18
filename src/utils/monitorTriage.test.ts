import { describe, expect, it } from 'vitest';
import { filterByTriage, triageCounts, type TriageRow } from './monitorTriage';

function row(overrides: Partial<TriageRow> = {}): TriageRow {
    return {
        finished: false,
        tabSwitchCount: 0,
        stalledMinutes: null,
        started: true,
        progress: 40,
        pace: 'on_pace',
        ...overrides,
    };
}

describe('triageCounts', () => {
    it('counts each signal independently', () => {
        const counts = triageCounts([
            row({ tabSwitchCount: 3 }), // flagged
            row({ stalledMinutes: 6 }), // flagged + stalled
            row({ progress: 0 }), // not writing
            row({ pace: 'behind' }),
            row(),
        ]);

        expect(counts).toEqual({ flagged: 2, stalled: 1, not_writing: 1, behind: 1 });
    });

    it('ignores students who have finished, opened nothing, or never started', () => {
        const counts = triageCounts([
            row({ finished: true, tabSwitchCount: 9, stalledMinutes: 12, pace: 'behind' }),
            row({ progress: 0, started: false }),
            row({ tabSwitchCount: 1 }),
        ]);

        expect(counts).toEqual({ flagged: 0, stalled: 0, not_writing: 0, behind: 0 });
    });

    it('flags a tab switch at the threshold, not below it', () => {
        expect(triageCounts([row({ tabSwitchCount: 2 })]).flagged).toBe(0);
        expect(triageCounts([row({ tabSwitchCount: 3 })]).flagged).toBe(1);
    });

    it('treats a missing progress count as not writing once the student has started', () => {
        expect(triageCounts([row({ progress: undefined })]).not_writing).toBe(1);
    });
});

describe('filterByTriage', () => {
    const stalled = row({ studentId: 'a', stalledMinutes: 4 } as Partial<TriageRow>);
    const behind = row({ studentId: 'b', pace: 'behind' } as Partial<TriageRow>);

    it('returns every row when no chip is selected', () => {
        expect(filterByTriage([stalled, behind], null)).toHaveLength(2);
    });

    it('narrows to the selected signal', () => {
        expect(filterByTriage([stalled, behind], 'stalled')).toEqual([stalled]);
        expect(filterByTriage([stalled, behind], 'behind')).toEqual([behind]);
        expect(filterByTriage([stalled, behind], 'not_writing')).toEqual([]);
    });
});
