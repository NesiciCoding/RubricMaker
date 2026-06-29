import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dateGroupLabel } from './Dashboard';

const t = ((key: string, fallback?: string) => fallback ?? key) as Parameters<typeof dateGroupLabel>[1];

describe('dateGroupLabel', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-28T12:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('groups today and yesterday separately from older dates', () => {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 86_400_000);
        const lastWeek = new Date(now.getTime() - 7 * 86_400_000);

        expect(dateGroupLabel(now.toISOString(), t)).toBe('Today');
        expect(dateGroupLabel(yesterday.toISOString(), t)).toBe('Yesterday');
        expect(dateGroupLabel(lastWeek.toISOString(), t)).not.toBe('Today');
        expect(dateGroupLabel(lastWeek.toISOString(), t)).not.toBe('Yesterday');
    });

    it('includes the year for older dates so different years are not merged', () => {
        const sameDayLastYear = new Date('2025-06-28T12:00:00.000Z');
        const lastWeek = new Date('2026-06-21T12:00:00.000Z');

        expect(dateGroupLabel(sameDayLastYear.toISOString(), t)).toContain('2025');
        expect(dateGroupLabel(lastWeek.toISOString(), t)).toContain('2026');
        expect(dateGroupLabel(sameDayLastYear.toISOString(), t)).not.toBe(dateGroupLabel(lastWeek.toISOString(), t));
    });
});
