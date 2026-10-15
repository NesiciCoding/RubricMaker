import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { toLocalDatetimeInput, fromLocalDatetimeInput, formatShortDate, localDayWindow } from './dateInput';

describe('toLocalDatetimeInput', () => {
    it('returns a value matching the datetime-local shape', () => {
        expect(toLocalDatetimeInput('2024-03-15T14:30:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it('round-trips to the same instant when parsed as local time', () => {
        const iso = '2024-03-15T14:30:00Z';
        const input = toLocalDatetimeInput(iso);
        // datetime-local values are interpreted as local time, so the round trip
        // must land on the original UTC instant regardless of the test machine's TZ.
        expect(new Date(input).toISOString()).toBe(new Date(iso).toISOString());
    });
});

describe('formatShortDate', () => {
    it('renders a localized short date containing the year', () => {
        const formatted = formatShortDate('2024-03-15T14:30:00Z');
        expect(formatted).toContain('2024');
        expect(formatted).toContain('Mar');
    });
});

describe('fromLocalDatetimeInput in a non-UTC zone (#700)', () => {
    let previousTz: string | undefined;
    beforeAll(() => {
        previousTz = process.env.TZ;
        process.env.TZ = 'Europe/Amsterdam';
    });
    afterAll(() => {
        if (previousTz === undefined) delete process.env.TZ;
        else process.env.TZ = previousTz;
    });

    it('runs in a zone with an offset, so the regression is meaningful', () => {
        expect(new Date('2026-10-11T20:27:33.645Z').getTimezoneOffset()).not.toBe(0);
    });

    it('keeps the deadline unchanged across repeated saves without edits', () => {
        let stored = '2026-10-11T20:27:33.645Z';
        for (let i = 0; i < 3; i++) {
            const shown = toLocalDatetimeInput(stored);
            expect(shown).toBe('2026-10-11T22:27');
            stored = fromLocalDatetimeInput(shown, stored)!;
        }
        expect(stored).toBe('2026-10-11T20:27:33.645Z');
    });

    it('converts an edited local time to the right UTC instant', () => {
        expect(fromLocalDatetimeInput('2026-10-11T23:00', '2026-10-11T20:27:33.645Z')).toBe('2026-10-11T21:00:00.000Z');
        expect(fromLocalDatetimeInput('2026-01-15T09:30')).toBe('2026-01-15T08:30:00.000Z');
    });

    it('treats an empty input as no deadline', () => {
        expect(fromLocalDatetimeInput('', '2026-10-11T20:27:33.645Z')).toBeUndefined();
    });

    it('shows the slice-based value the old code used would have shifted the deadline', () => {
        const stored = '2026-10-11T20:27:33.645Z';
        expect(new Date(stored.slice(0, 16)).toISOString()).not.toBe(stored);
    });
});

describe('localDayWindow in a non-UTC zone (#701)', () => {
    beforeAll(() => {
        process.env.TZ = 'Europe/Amsterdam';
    });
    afterAll(() => {
        delete process.env.TZ;
    });

    // Built inside the tests rather than at collection time: the zone is only switched in
    // beforeAll, so a module-level window would still be the runner's own zone (UTC on CI)
    // while every assertion below describes Europe/Amsterdam.
    const localWindow = () => localDayWindow('2026-01-05', '2026-01-05');
    const inside = (window: { fromTs: number; toTs: number }, iso: string) => {
        const ts = new Date(iso).getTime();
        return ts >= window.fromTs && ts < window.toTs;
    };

    it('runs in a zone with an offset, so the regression is meaningful', () => {
        expect(new Date('2026-01-05T00:30:00Z').getTimezoneOffset()).not.toBe(0);
    });

    it('covers the whole From day, including the hours before UTC midnight drifts in', () => {
        // 00:30 local on the From day: `new Date('2026-01-05')` (UTC midnight) used to exclude it.
        expect(inside(localWindow(), '2026-01-04T23:30:00Z')).toBe(true);
        expect(new Date('2026-01-04T23:30:00Z').getTime() < new Date('2026-01-05').getTime()).toBe(true);
    });

    it('covers the To day up to its final millisecond', () => {
        const window = localWindow();
        expect(inside(window, '2026-01-05T22:59:59.999Z')).toBe(true);
        expect(inside(window, '2026-01-05T23:00:00.000Z')).toBe(false);
    });

    it('leaves missing or unparsable bounds open', () => {
        expect(localDayWindow('', '')).toEqual({ fromTs: 0, toTs: Infinity });
        expect(localDayWindow('not-a-date', '')).toEqual({ fromTs: 0, toTs: Infinity });
        expect(localDayWindow('', '2026-01-05').fromTs).toBe(0);
    });

    it('keeps a DST-shortened day whole', () => {
        // 2026-03-29 is 23 hours long in Europe/Amsterdam (CET -> CEST at 02:00 local).
        const { fromTs, toTs } = localDayWindow('2026-03-29', '2026-03-29');
        expect((toTs - fromTs) / 3_600_000).toBe(23);
    });
});
