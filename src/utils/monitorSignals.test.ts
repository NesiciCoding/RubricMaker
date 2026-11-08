import { describe, it, expect } from 'vitest';
import {
    appendWordSample,
    clampStallMinutes,
    elapsedParts,
    paceVsClass,
    stalledMinutes,
    writingPace,
    DEFAULT_STALL_MINUTES,
    MAX_STALL_MINUTES,
    MIN_STALL_MINUTES,
    WRITING_PACE_WINDOW_MS,
    type WordSample,
} from './monitorSignals';

const MIN = 60_000;

describe('clampStallMinutes', () => {
    it('defaults a missing or non-numeric value', () => {
        expect(clampStallMinutes(undefined)).toBe(DEFAULT_STALL_MINUTES);
        expect(clampStallMinutes(Number.NaN)).toBe(DEFAULT_STALL_MINUTES);
    });

    it('clamps and rounds into the allowed range', () => {
        expect(clampStallMinutes(0)).toBe(MIN_STALL_MINUTES);
        expect(clampStallMinutes(500)).toBe(MAX_STALL_MINUTES);
        expect(clampStallMinutes(6.6)).toBe(7);
    });
});

describe('stalledMinutes', () => {
    it('is null without a baseline or inside the threshold', () => {
        expect(stalledMinutes(undefined, 10 * MIN, 4)).toBeNull();
        expect(stalledMinutes(0, 3 * MIN + 59_000, 4)).toBeNull();
    });

    it('reports whole minutes once the threshold is reached', () => {
        expect(stalledMinutes(0, 4 * MIN, 4)).toBe(4);
        expect(stalledMinutes(0, 7 * MIN + 30_000, 4)).toBe(7);
    });
});

describe('paceVsClass', () => {
    it('needs at least three students with a known total', () => {
        expect(
            paceVsClass([
                { id: 'a', answered: 1, total: 10 },
                { id: 'b', answered: 9, total: 10 },
                { id: 'c', answered: 0, total: 0 },
            ]).size
        ).toBe(0);
    });

    it('marks students ahead, on pace or behind the class median', () => {
        const pace = paceVsClass([
            { id: 'a', answered: 2, total: 10 },
            { id: 'b', answered: 5, total: 10 },
            { id: 'c', answered: 6, total: 10 },
            { id: 'd', answered: 9, total: 10 },
        ]);
        // median = 0.55; band = 0.1
        expect(pace.get('a')).toBe('behind');
        expect(pace.get('b')).toBe('on_pace');
        expect(pace.get('c')).toBe('on_pace');
        expect(pace.get('d')).toBe('ahead');
    });

    it('treats one question either way as on pace on a short test', () => {
        const pace = paceVsClass([
            { id: 'a', answered: 1, total: 4 },
            { id: 'b', answered: 2, total: 4 },
            { id: 'c', answered: 3, total: 4 },
        ]);
        expect(pace.get('a')).toBe('on_pace');
        expect(pace.get('c')).toBe('on_pace');
    });

    it('counts finished students towards the median without labelling them', () => {
        const pace = paceVsClass([
            { id: 'a', answered: 10, total: 10, finished: true },
            { id: 'b', answered: 10, total: 10, finished: true },
            { id: 'c', answered: 3, total: 10 },
        ]);
        expect(pace.has('a')).toBe(false);
        expect(pace.get('c')).toBe('behind');
    });
});

describe('appendWordSample', () => {
    it('collapses repeated counts', () => {
        const s = appendWordSample([{ at: 0, words: 5 }], { at: 1000, words: 5 });
        expect(s).toEqual([{ at: 0, words: 5 }]);
    });

    it('drops old samples but keeps one baseline before the retention cutoff', () => {
        let s: WordSample[] = [];
        for (let i = 0; i <= 20; i++) s = appendWordSample(s, { at: i * MIN, words: i * 10 });
        const cutoff = 20 * MIN - (2 * WRITING_PACE_WINDOW_MS + MIN);
        expect(s[0].at).toBeLessThanOrEqual(cutoff);
        expect(s[1].at).toBeGreaterThan(cutoff);
        expect(s[s.length - 1]).toEqual({ at: 20 * MIN, words: 200 });
    });
});

describe('writingPace', () => {
    it('is undefined without samples or under a minute of history', () => {
        expect(writingPace([], 0)).toBeUndefined();
        expect(writingPace([{ at: 0, words: 0 }], 30_000)).toBeUndefined();
    });

    it('computes words per minute from the first sample while history is short', () => {
        const pace = writingPace(
            [
                { at: 0, words: 0 },
                { at: 2 * MIN, words: 40 },
            ],
            2 * MIN
        );
        expect(pace).toEqual({ wpm: 20 });
    });

    it('reports a steady trend when both windows match', () => {
        const samples = [0, 1, 2, 3, 4, 5, 6].map((m) => ({ at: m * MIN, words: m * 10 }));
        expect(writingPace(samples, 6 * MIN)).toEqual({ wpm: 10, trend: 'steady' });
    });

    it('detects slowing down and speeding up', () => {
        const slowing = [
            { at: 0, words: 0 },
            { at: 3 * MIN, words: 60 },
            { at: 6 * MIN, words: 66 },
        ];
        expect(writingPace(slowing, 6 * MIN)?.trend).toBe('slowing');
        const speeding = [
            { at: 0, words: 0 },
            { at: 3 * MIN, words: 6 },
            { at: 6 * MIN, words: 66 },
        ];
        expect(writingPace(speeding, 6 * MIN)?.trend).toBe('speeding_up');
    });

    it('reports stopped when nothing was written in the window', () => {
        const samples = [
            { at: 0, words: 0 },
            { at: 2 * MIN, words: 50 },
        ];
        expect(writingPace(samples, 6 * MIN)).toEqual({ wpm: 0, trend: 'stopped' });
    });

    it('does not count deletions as negative pace', () => {
        const samples = [
            { at: 0, words: 100 },
            { at: 3 * MIN, words: 100 },
            { at: 5 * MIN, words: 80 },
        ];
        expect(writingPace(samples, 6 * MIN)?.wpm).toBe(0);
    });
});

describe('elapsedParts', () => {
    it('uses seconds under a minute and whole minutes after', () => {
        expect(elapsedParts(0, 45_000)).toEqual({ unit: 'seconds', value: 45 });
        expect(elapsedParts(0, 150_000)).toEqual({ unit: 'minutes', value: 2 });
        expect(elapsedParts(10_000, 0)).toEqual({ unit: 'seconds', value: 0 });
    });
});
