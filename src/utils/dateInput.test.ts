import { describe, it, expect } from 'vitest';
import { toLocalDatetimeInput, formatShortDate } from './dateInput';

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
