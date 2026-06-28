import { describe, it, expect } from 'vitest';
import { dateGroupLabel } from './Dashboard';

const t = ((key: string, fallback?: string) => fallback ?? key) as Parameters<typeof dateGroupLabel>[1];

describe('dateGroupLabel', () => {
    it('groups today and yesterday separately from older dates', () => {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 86_400_000);
        const lastWeek = new Date(now.getTime() - 7 * 86_400_000);

        expect(dateGroupLabel(now.toISOString(), t)).toBe('Today');
        expect(dateGroupLabel(yesterday.toISOString(), t)).toBe('Yesterday');
        expect(dateGroupLabel(lastWeek.toISOString(), t)).not.toBe('Today');
        expect(dateGroupLabel(lastWeek.toISOString(), t)).not.toBe('Yesterday');
    });
});
