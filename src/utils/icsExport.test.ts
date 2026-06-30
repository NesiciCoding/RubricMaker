import { describe, it, expect } from 'vitest';
import { buildIcs } from './icsExport';

describe('buildIcs', () => {
    it('emits a VCALENDAR with one VEVENT per input event', () => {
        const ics = buildIcs([
            { uid: 'essay-1', title: 'Argumentative Essay', dueDate: '2026-07-01T12:00:00.000Z' },
            { uid: 'essay-2', title: 'Narrative Essay', dueDate: '2026-07-05T12:00:00.000Z' },
        ]);
        expect(ics).toContain('BEGIN:VCALENDAR');
        expect(ics).toContain('END:VCALENDAR');
        expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
        expect(ics).toContain('UID:essay-1');
        expect(ics).toContain('DTSTART:20260701T120000Z');
        expect(ics).toContain('SUMMARY:Argumentative Essay');
    });

    it('strips newlines from titles so they cannot break the SUMMARY line', () => {
        const ics = buildIcs([{ uid: 'x', title: 'Line1\nLine2', dueDate: '2026-07-01T00:00:00.000Z' }]);
        expect(ics).toContain('SUMMARY:Line1 Line2');
    });

    it('escapes commas, semicolons, and backslashes per RFC 5545', () => {
        const ics = buildIcs([
            { uid: 'x', title: 'Essay 1, draft 2; final\\copy', dueDate: '2026-07-01T00:00:00.000Z' },
        ]);
        expect(ics).toContain('SUMMARY:Essay 1\\, draft 2\\; final\\\\copy');
    });
});
