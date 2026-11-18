import { describe, expect, it } from 'vitest';
import {
    buildSessionCsv,
    buildSessionSummaryHtml,
    minutesSince,
    type SessionExportStudent,
} from './monitorSessionExport';

const now = Date.parse('2026-11-18T10:00:00.000Z');

const t = (key: string, options?: Record<string, unknown>) =>
    options && 'count' in options ? `${key}:${options.count}` : key;

function student(overrides: Partial<SessionExportStudent> = {}): SessionExportStudent {
    return {
        name: 'Ada Lovelace',
        finished: false,
        tabSwitchCount: 0,
        copyCount: 0,
        cutCount: 0,
        pasteCount: 0,
        nudges: [],
        ...overrides,
    };
}

describe('minutesSince', () => {
    it('reports whole minutes and never a negative age', () => {
        expect(minutesSince(now - 5 * 60_000, now)).toBe(5);
        expect(minutesSince(now - 59_000, now)).toBe(0);
        expect(minutesSince(now + 60_000, now)).toBe(0);
    });

    it('is undefined when the monitor never saw the signal', () => {
        expect(minutesSince(undefined, now)).toBeUndefined();
        expect(minutesSince(Number.NaN, now)).toBeUndefined();
    });
});

describe('buildSessionCsv', () => {
    it('writes one headered row per student with counts, ages and the nudge log', () => {
        const csv = buildSessionCsv(
            [
                student({
                    name: 'Ada Lovelace',
                    finished: true,
                    tabSwitchCount: 3,
                    copyCount: 1,
                    pasteCount: 2,
                    wordCount: 540,
                    draftAt: now - 4 * 60_000,
                    lastChangeAt: now - 12 * 60_000,
                    lastSignalAt: now,
                    nudges: [
                        { at: new Date(now - 20 * 60_000).toISOString(), message: 'Check the question' },
                        { at: new Date(now - 8 * 60_000).toISOString(), message: '5 minutes left' },
                    ],
                }),
                student({ name: 'Grace Hopper' }),
            ],
            { title: 'Midterm essay', kind: 'essay', at: now },
            t,
            now
        );

        const lines = csv.split('\r\n');
        expect(lines[0]).toBe(
            [
                'tests.monitor.export.column_student',
                'tests.monitor.export.column_status',
                'tests.monitor.export.column_tab_switches',
                'tests.monitor.export.column_copy',
                'tests.monitor.export.column_cut',
                'tests.monitor.export.column_paste',
                'tests.monitor.export.column_stalled',
                'tests.monitor.export.column_draft_age',
                'tests.monitor.export.column_words',
                'tests.monitor.export.column_nudges',
                'tests.monitor.export.column_nudge_log',
                'tests.monitor.export.column_last_signal',
            ].join(',')
        );

        const row = lines[1].split(',');
        expect(row[0]).toBe('Ada Lovelace');
        expect(row[1]).toBe('tests.monitor.export.status_submitted');
        expect(row[2]).toBe('3');
        expect(row[6]).toBe('12');
        expect(row[7]).toBe('4');
        expect(row[8]).toBe('540');
        expect(row[9]).toBe('2');
        expect(row[10]).toContain('Check the question');
        expect(row[10]).toContain('5 minutes left');

        // A student the monitor never saw writing keeps blank ages instead of implying zero.
        const untouched = lines[2].split(',');
        expect(untouched[0]).toBe('Grace Hopper');
        expect(untouched[6]).toBe('');
        expect(untouched[7]).toBe('');
        expect(untouched[9]).toBe('0');

        expect(csv.endsWith('\r\n')).toBe(true);
    });

    it('quotes names and messages that would otherwise split the columns', () => {
        const csv = buildSessionCsv(
            [
                student({
                    name: 'Smith, John "JD"',
                    nudges: [{ at: new Date(now).toISOString(), message: 'Please save; then stop' }],
                }),
            ],
            { title: 'Quiz', kind: 'test', at: now },
            t,
            now
        );

        expect(csv).toContain('"Smith, John ""JD"""');
        expect(csv).toContain('Please save; then stop');
    });
});

describe('buildSessionSummaryHtml', () => {
    it('escapes what students are called and totals the session', () => {
        const html = buildSessionSummaryHtml(
            [
                student({ name: '<script>alert(1)</script>', tabSwitchCount: 2, wordCount: 400 }),
                student({ name: 'Grace Hopper', finished: true, wordCount: 100, nudges: [{ at: '', message: 'x' }] }),
            ],
            { title: 'Midterm essay', kind: 'essay', at: now },
            t,
            now
        );

        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('Midterm essay');
        expect(html).toContain('tests.monitor.export.summary_students:2');
        expect(html).toContain('tests.monitor.export.summary_tab_switches:2');
        expect(html).toContain('tests.monitor.export.summary_words:500');
        expect(html).toContain('tests.monitor.export.summary_nudges:1');
    });
});
