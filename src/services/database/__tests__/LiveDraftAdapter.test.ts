import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LiveDraftAdapter } from '../LiveDraftAdapter';

function asClient(value: unknown): SupabaseClient {
    return value as SupabaseClient;
}

function readClient(rows: unknown[]) {
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn(() => ({ limit }));
    const inFilter = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ in: inFilter }));
    const from = vi.fn(() => ({ select }));
    return { client: asClient({ from }), from, select, inFilter, order, limit };
}

describe('LiveDraftAdapter', () => {
    it('records a snapshot through the RPC with snake_case parameters', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
        const adapter = new LiveDraftAdapter(asClient({ rpc }));

        await adapter.recordSnapshot('teacher-key', 128, '<p>draft</p>');

        expect(rpc).toHaveBeenCalledWith('record_live_draft_snapshot', {
            p_assignment_id: 'teacher-key',
            p_word_count: 128,
            p_draft_text: '<p>draft</p>',
        });
    });

    it('skips the RPC when there is no assignment key yet', async () => {
        const rpc = vi.fn();
        const adapter = new LiveDraftAdapter(asClient({ rpc }));

        await adapter.recordSnapshot('', 10, 'draft');

        expect(rpc).not.toHaveBeenCalled();
    });

    it('surfaces a failed write so callers can decide whether it matters', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'not_your_assignment' } });
        const adapter = new LiveDraftAdapter(asClient({ rpc }));

        await expect(adapter.recordSnapshot('key', 1, 'x')).rejects.toThrow('not_your_assignment');
    });

    it('groups stored snapshots by student, oldest first, and keeps words-only rows text-free', async () => {
        const { client, order, inFilter } = readClient([
            { student_id: 's1', captured_at: '2026-05-01T10:02:00Z', word_count: 40, draft_text: null },
            { student_id: 's1', captured_at: '2026-05-01T10:01:00Z', word_count: 20, draft_text: '<p>one</p>' },
            { student_id: 's2', captured_at: '2026-05-01T10:01:30Z', word_count: 5, draft_text: '<p>two</p>' },
        ]);
        const adapter = new LiveDraftAdapter(client);

        const grouped = await adapter.listSnapshots(['key']);

        expect(inFilter).toHaveBeenCalledWith('assignment_id', ['key']);
        expect(order).toHaveBeenCalledWith('captured_at', { ascending: false });
        expect(grouped.get('s1')?.map((s) => [s.wordCount, s.text])).toEqual([
            [20, '<p>one</p>'],
            [40, undefined],
        ]);
        expect(grouped.get('s2')).toHaveLength(1);
    });

    it('drops rows with an unparseable timestamp instead of plotting NaN', async () => {
        const { client } = readClient([
            { student_id: 's1', captured_at: 'not-a-date', word_count: 3, draft_text: 'x' },
            { student_id: 's1', captured_at: '2026-05-01T10:01:00Z', word_count: 4, draft_text: 'y' },
        ]);
        const adapter = new LiveDraftAdapter(client);

        const grouped = await adapter.listSnapshots(['key']);

        expect(grouped.get('s1')).toHaveLength(1);
        expect(grouped.get('s1')?.[0].wordCount).toBe(4);
    });

    it('does not query at all when no assignment is known', async () => {
        const { client, from } = readClient([]);
        const adapter = new LiveDraftAdapter(client);

        const grouped = await adapter.listSnapshots(['', '']);

        expect(grouped.size).toBe(0);
        expect(from).not.toHaveBeenCalled();
    });

    it('fetches the latest row for a student the shared page limit left out', async () => {
        const limit = vi
            .fn()
            .mockResolvedValueOnce({
                data: [{ student_id: 's2', captured_at: '2026-05-01T10:05:00Z', word_count: 9, draft_text: 'b' }],
                error: null,
            })
            .mockResolvedValueOnce({
                data: [{ student_id: 's1', captured_at: '2026-05-01T09:00:00Z', word_count: 3, draft_text: 'a' }],
                error: null,
            });
        const eq = vi.fn(() => ({ order: () => ({ limit }) }));
        const inFilter = vi.fn(() => ({ order: () => ({ limit }), eq }));
        const client = asClient({ from: () => ({ select: () => ({ in: inFilter }) }) });

        const grouped = await new LiveDraftAdapter(client).listSnapshots(['key'], ['s1', 's2']);

        expect(eq).toHaveBeenCalledTimes(1);
        expect(eq).toHaveBeenCalledWith('student_id', 's1');
        expect(grouped.get('s1')?.[0].wordCount).toBe(3);
        expect(grouped.get('s2')?.[0].wordCount).toBe(9);
    });

    it('builds the student client around the essay adapter session instead of a bare anon key', () => {
        const session = { getAccessToken: vi.fn().mockResolvedValue('jwt') };
        const first = LiveDraftAdapter.forStudent('https://abc.supabase.co', 'anon', session);
        const second = LiveDraftAdapter.forStudent('https://abc.supabase.co', 'anon', session);

        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        expect(LiveDraftAdapter.forStudent('https://abc.supabase.co', 'anon', null)).toBeNull();
    });
});
