import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SupabaseAdapter } from '../SupabaseAdapter';
import { makeClient, adapterWithClient } from './supabaseTestUtils';
import { loadPendingQueue } from '../../../store/storage';
import { storageSync } from '../StorageSync';
import type { Class } from '../../../types';

const ME = 'teacher-me';
const OTHER = 'teacher-other';

describe('SupabaseAdapter class ownership', () => {
    let adapter: SupabaseAdapter;

    beforeEach(() => {
        adapter = new SupabaseAdapter();
    });

    it('carries owner_id into the class it returns', async () => {
        const client = makeClient({
            data: [{ data: { id: 'c1', name: 'Mine' }, owner_id: ME }],
            error: null,
        });

        const [cls] = await adapterWithClient(client, ME).fetchClasses();

        expect(cls).toEqual({ id: 'c1', name: 'Mine', ownerId: ME });
    });

    it('sends the existing owner so an admin edit never takes the class over', async () => {
        const client = makeClient({ data: [{ id: 'c1' }], error: null });
        const connected = adapterWithClient(client, ME);

        await connected.upsertClass({ id: 'c1', name: 'Renamed', ownerId: OTHER });

        const upsert = (client.from as unknown as { mock: { results: { value: unknown }[] } }).mock.results[0]
            .value as {
            upsert: { mock: { calls: unknown[][] } };
        };
        expect(upsert.upsert.mock.calls[0][0]).toEqual({
            id: 'c1',
            owner_id: OTHER,
            data: { id: 'c1', name: 'Renamed' },
        });
    });

    it('reports a write RLS filtered to zero rows as forbidden, not as saved', async () => {
        const client = makeClient({ data: [], error: null });

        const result = await adapterWithClient(client, ME).upsertClass({ id: 'c1', name: 'Renamed' });

        expect(result).toEqual({ success: false, error: 'Write rejected by access rules', code: 'forbidden' });
    });

    it('reports an RLS error as forbidden so sync does not retry it forever', async () => {
        const client = makeClient({
            data: null,
            error: { message: 'new row violates row-level security policy', code: '42501' },
        });

        const result = await adapterWithClient(client, ME).upsertClass({ id: 'c1', name: 'Renamed' });

        expect(result).toEqual({
            success: false,
            error: 'new row violates row-level security policy',
            code: 'forbidden',
        });
    });

    it('reports a delete that matched no row (the silent case) as forbidden', async () => {
        const client = makeClient({ data: [], error: null });

        const result = await adapterWithClient(client, ME).deleteClass('c1');

        expect(result.success).toBe(false);
        expect(result.code).toBe('forbidden');
    });

    it('reports a successful delete as success', async () => {
        const client = makeClient({ data: [{ id: 'c1' }], error: null });
        expect(await adapterWithClient(client, ME).deleteClass('c1')).toEqual({ success: true });
    });

    it('keeps a transient failure retryable (no forbidden code)', async () => {
        const client = makeClient({ data: null, error: { message: 'network error' } });

        const result = await adapterWithClient(client, ME).upsertClass({ id: 'c1', name: 'Renamed' });

        expect(result).toEqual({ success: false, error: 'network error' });
    });
});

describe('StorageSync.pushOne rejected writes', () => {
    const adapter = storageSync.adapter;

    afterEach(() => {
        localStorage.removeItem('rm_pending_sync');
        vi.restoreAllMocks();
    });

    beforeEach(() => localStorage.removeItem('rm_pending_sync'));

    const cls: Class = { id: 'c1', name: 'Theirs', ownerId: OTHER } as Class;

    it('does not queue a write the server refused (it can never succeed)', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        vi.spyOn(adapter, 'upsertClass').mockResolvedValue({
            success: false,
            error: 'Write rejected by access rules',
            code: 'forbidden',
        });

        await storageSync.pushOne('class', 'upsert', cls, cls.id);

        expect(loadPendingQueue()).toHaveLength(0);
    });

    it('still queues a transient failure so it is retried on reconnect', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        vi.spyOn(adapter, 'upsertClass').mockResolvedValue({ success: false, error: 'offline blip' });

        await storageSync.pushOne('class', 'upsert', cls, cls.id);

        expect(loadPendingQueue().some((item) => item.entity === 'class' && item.entityId === cls.id)).toBe(true);
    });
});
