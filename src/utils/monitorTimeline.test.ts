import { describe, expect, it } from 'vitest';
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

    it('marks a flat stretch of five minutes or more as a pause', () => {
        const timeline = buildTimeline(
            [
                { at: at(20), words: 30 },
                { at: at(14), words: 30 },
                { at: at(13), words: 55 },
                { at: at(12), words: 55 },
            ],
            [],
            NOW
        );

        expect(timeline.markers.filter((m) => m.kind === 'idle')).toHaveLength(1);
        expect(timeline.longestFlatMinutes).toBe(6);
    });

    it('does not mark a slow minute as a pause', () => {
        const timeline = buildTimeline(
            [
                { at: at(4), words: 30 },
                { at: at(2), words: 30 },
            ],
            [],
            NOW
        );

        expect(timeline.markers.filter((m) => m.kind === 'idle')).toHaveLength(0);
        expect(timeline.longestFlatMinutes).toBe(2);
    });

    it('returns an empty curve when nothing has been recorded yet', () => {
        const timeline = buildTimeline([], [], NOW);

        expect(timeline.points).toEqual([]);
        expect(timeline.markers).toEqual([]);
        expect(timeline.longestFlatMinutes).toBe(0);
    });
});
