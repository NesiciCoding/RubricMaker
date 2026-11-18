import { describe, expect, it } from 'vitest';
import { appendWordSample, type WordSample } from './monitorSignals';
import { buildTimeline, TIMELINE_WINDOW_MS } from './monitorTimeline';

const MIN = 60_000;
const NOW = new Date('2026-05-01T10:30:00Z').getTime();
const at = (minutesAgo: number) => NOW - minutesAgo * MIN;
const iso = (minutesAgo: number) => new Date(at(minutesAgo)).toISOString();

describe('buildTimeline', () => {
    it('keeps the window and starts from the last sample before it', () => {
        const timeline = buildTimeline(
            [
                { at: at(45), words: 10 },
                { at: at(10), words: 40 },
                { at: at(5), words: 60 },
            ],
            [],
            NOW
        );

        expect(timeline.from).toBe(NOW - TIMELINE_WINDOW_MS);
        expect(timeline.points.map((p) => p.words)).toEqual([10, 40, 60]);
    });

    it('marks tab switches and pastes inside the window only', () => {
        const timeline = buildTimeline(
            [],
            [
                { type: 'tab_switch', at: iso(20) },
                { type: 'paste', at: iso(15) },
                { type: 'tab_switch', at: iso(45) },
                { type: 'heartbeat', at: iso(1) },
            ],
            NOW
        );

        expect(timeline.markers.map((m) => m.kind)).toEqual(['tab_switch', 'paste']);
    });

    it('marks a completed stall between two change points as a pause', () => {
        const timeline = buildTimeline(
            [
                { at: at(20), words: 30 },
                { at: at(14), words: 55 },
                { at: at(13), words: 70 },
                { at: at(1), words: 90 },
            ],
            [],
            NOW
        );

        expect(timeline.markers.filter((m) => m.kind === 'idle')).toHaveLength(2);
        expect(timeline.longestFlatMinutes).toBe(12);
    });

    it('reports a stall that is still going on up to now', () => {
        const timeline = buildTimeline([{ at: at(8), words: 30 }], [], NOW);

        expect(timeline.markers.filter((m) => m.kind === 'idle')).toEqual([{ at: NOW, kind: 'idle' }]);
        expect(timeline.longestFlatMinutes).toBe(8);
    });

    it('finds a stall in samples that went through appendWordSample', () => {
        let samples: WordSample[] = [];
        for (const [minutesAgo, words] of [
            [20, 10],
            [18, 10],
            [15, 10],
            [10, 25],
            [3, 25],
        ] as const) {
            samples = appendWordSample(samples, { at: at(minutesAgo), words });
        }

        expect(samples).toHaveLength(2);
        const timeline = buildTimeline(samples, [], NOW);
        expect(timeline.markers.some((m) => m.kind === 'idle')).toBe(true);
        expect(timeline.longestFlatMinutes).toBe(10);
    });

    it('does not mark a slow minute as a pause', () => {
        const timeline = buildTimeline(
            [
                { at: at(4), words: 30 },
                { at: at(2), words: 40 },
                { at: at(0.5), words: 41 },
            ],
            [],
            NOW
        );

        expect(timeline.markers.filter((m) => m.kind === 'idle')).toHaveLength(0);
        expect(timeline.longestFlatMinutes).toBe(2);
    });

    it('counts only the part of a pause that falls inside the window', () => {
        const timeline = buildTimeline(
            [
                { at: at(45), words: 30 },
                { at: at(29), words: 40 },
                { at: at(1), words: 41 },
            ],
            [],
            NOW
        );

        // 45 -> 29 minutes ago is 16 minutes long, but only the last minute is inside the 30-minute window.
        expect(timeline.longestFlatMinutes).toBe(28);
        expect(timeline.markers.filter((m) => m.kind === 'idle')).toHaveLength(1);
    });

    it('returns an empty curve when nothing has been recorded yet', () => {
        const timeline = buildTimeline([], [], NOW);

        expect(timeline.points).toEqual([]);
        expect(timeline.markers).toEqual([]);
        expect(timeline.longestFlatMinutes).toBe(0);
    });
});
