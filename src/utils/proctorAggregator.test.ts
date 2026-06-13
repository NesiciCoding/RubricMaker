import { describe, it, expect } from 'vitest';
import { derivePresence, summarizeProctorFlags, mergeProctorEvents } from './proctorAggregator';
import type { ProctorEvent } from '../types';

const NOW = new Date('2024-01-01T12:00:00.000Z').getTime();

function heartbeat(secondsAgo: number, value: 'active' | 'idle' = 'active'): ProctorEvent {
    return { type: 'heartbeat', at: new Date(NOW - secondsAgo * 1000).toISOString(), value };
}

describe('derivePresence', () => {
    it('returns disconnected when there are no heartbeats', () => {
        expect(derivePresence([], NOW)).toBe('disconnected');
    });

    it('returns active for a fresh active heartbeat', () => {
        expect(derivePresence([heartbeat(5, 'active')], NOW)).toBe('active');
    });

    it('returns idle when the latest heartbeat reports idle, even if recent', () => {
        expect(derivePresence([heartbeat(5, 'idle')], NOW)).toBe('idle');
    });

    it('treats a heartbeat just under the active threshold as active', () => {
        expect(derivePresence([heartbeat(39, 'active')], NOW)).toBe('active');
    });

    it('treats a heartbeat at the active threshold as idle', () => {
        expect(derivePresence([heartbeat(40, 'active')], NOW)).toBe('idle');
    });

    it('treats a heartbeat just under the idle threshold as idle', () => {
        expect(derivePresence([heartbeat(89, 'active')], NOW)).toBe('idle');
    });

    it('treats a heartbeat at the idle threshold as disconnected', () => {
        expect(derivePresence([heartbeat(90, 'active')], NOW)).toBe('disconnected');
    });

    it('uses the most recent heartbeat when several are present', () => {
        const events = [heartbeat(120, 'active'), heartbeat(5, 'active'), heartbeat(60, 'idle')];
        expect(derivePresence(events, NOW)).toBe('active');
    });
});

describe('summarizeProctorFlags', () => {
    it('returns zeroed counts and null battery for an empty event list', () => {
        expect(summarizeProctorFlags([])).toEqual({
            tabSwitchCount: 0,
            copyCount: 0,
            cutCount: 0,
            pasteCount: 0,
            battery: null,
            sebActive: false,
        });
    });

    it('counts tab switches and clipboard events', () => {
        const events: ProctorEvent[] = [
            { type: 'tab_switch', at: '2024-01-01T12:00:00.000Z' },
            { type: 'tab_switch', at: '2024-01-01T12:00:05.000Z' },
            { type: 'copy', at: '2024-01-01T12:00:06.000Z' },
            { type: 'cut', at: '2024-01-01T12:00:07.000Z' },
            { type: 'paste', at: '2024-01-01T12:00:08.000Z' },
            { type: 'paste', at: '2024-01-01T12:00:09.000Z' },
        ];
        const summary = summarizeProctorFlags(events);
        expect(summary.tabSwitchCount).toBe(2);
        expect(summary.copyCount).toBe(1);
        expect(summary.cutCount).toBe(1);
        expect(summary.pasteCount).toBe(2);
    });

    it('parses the latest battery reading, including charging state', () => {
        const events: ProctorEvent[] = [
            { type: 'battery', at: '2024-01-01T12:00:00.000Z', value: '80' },
            { type: 'battery', at: '2024-01-01T12:05:00.000Z', value: '60+' },
        ];
        expect(summarizeProctorFlags(events).battery).toEqual({ level: 60, charging: true });
    });

    it('handles missing/empty battery values gracefully', () => {
        const events: ProctorEvent[] = [{ type: 'battery', at: '2024-01-01T12:00:00.000Z', value: '' }];
        expect(summarizeProctorFlags(events).battery).toBeNull();
        expect(summarizeProctorFlags([{ type: 'battery', at: '2024-01-01T12:00:00.000Z' }]).battery).toBeNull();
    });

    it('sets sebActive when a seb_status event reports true', () => {
        const events: ProctorEvent[] = [{ type: 'seb_status', at: '2024-01-01T12:00:00.000Z', value: true }];
        expect(summarizeProctorFlags(events).sebActive).toBe(true);
    });

    it('leaves sebActive false when seb_status reports false', () => {
        const events: ProctorEvent[] = [{ type: 'seb_status', at: '2024-01-01T12:00:00.000Z', value: false }];
        expect(summarizeProctorFlags(events).sebActive).toBe(false);
    });
});

describe('mergeProctorEvents', () => {
    it('returns persisted events unchanged when there are no live events', () => {
        const persisted: ProctorEvent[] = [{ type: 'tab_switch', at: '2024-01-01T12:00:00.000Z' }];
        expect(mergeProctorEvents(persisted, [])).toEqual(persisted);
    });

    it('appends new live events not present in persisted', () => {
        const persisted: ProctorEvent[] = [{ type: 'tab_switch', at: '2024-01-01T12:00:00.000Z' }];
        const live: ProctorEvent[] = [{ type: 'copy', at: '2024-01-01T12:00:05.000Z' }];
        expect(mergeProctorEvents(persisted, live)).toEqual([...persisted, ...live]);
    });

    it('dedupes live events that match a persisted event by type+at', () => {
        const shared: ProctorEvent = { type: 'heartbeat', at: '2024-01-01T12:00:00.000Z', value: 'active' };
        const persisted: ProctorEvent[] = [shared];
        const live: ProctorEvent[] = [shared, { type: 'heartbeat', at: '2024-01-01T12:00:20.000Z', value: 'active' }];
        const merged = mergeProctorEvents(persisted, live);
        expect(merged).toHaveLength(2);
        expect(merged.filter((e) => e.at === shared.at)).toHaveLength(1);
    });

    it('dedupes live events against each other within the same merge', () => {
        const persisted: ProctorEvent[] = [];
        const dup: ProctorEvent = { type: 'paste', at: '2024-01-01T12:00:00.000Z' };
        const merged = mergeProctorEvents(persisted, [dup, { ...dup }]);
        expect(merged).toHaveLength(1);
    });
});
