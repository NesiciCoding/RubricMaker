import { describe, expect, it, vi } from 'vitest';
import { adapterWithClient } from './supabaseTestUtils';

type Obj = { bucket_id: string; name: string };

function makeClient(opts: {
    objects?: Obj[];
    listError?: { message: string };
    eraseErrors?: Record<string, string>;
    removeShortfall?: string;
}) {
    const calls: string[] = [];
    const remove = vi.fn();
    const rpc = vi.fn(async (fn: string) => {
        calls.push(`rpc:${fn}`);
        if (fn === 'my_storage_objects') return { data: opts.objects ?? [], error: opts.listError ?? null };
        return { data: { deleted: {}, errors: opts.eraseErrors ?? {} }, error: null };
    });
    const storage = {
        from: (bucket: string) => ({
            remove: async (paths: string[]) => {
                calls.push(`remove:${bucket}:${paths.length}`);
                remove(bucket, paths);
                // RLS-skipped objects come back missing from data, without an error.
                const data = bucket === opts.removeShortfall ? paths.slice(1) : paths;
                return { data: data.map((name) => ({ name })), error: null };
            },
        }),
    };
    return { client: { from: vi.fn(), rpc, storage }, calls, remove };
}

// #642: erase every owned row and object, and never report success when something was left behind.
describe('SupabaseAdapter.deleteAllMyData', () => {
    it('removes storage objects per bucket in chunks before erasing rows', async () => {
        const objects: Obj[] = [
            ...Array.from({ length: 150 }, (_, i) => ({ bucket_id: 'attachments', name: `u1/a${i}` })),
            { bucket_id: 'backups', name: 'u1/2026.json' },
            { bucket_id: 'essays', name: 'assign-1/s1.html' },
        ];
        const { client, calls } = makeClient({ objects });
        const result = await adapterWithClient(client).deleteAllMyData();
        expect(result).toEqual({ success: true, failed: [] });
        expect(calls).toEqual([
            'rpc:my_storage_objects',
            'remove:attachments:100',
            'remove:attachments:50',
            'remove:backups:1',
            'remove:essays:1',
            'rpc:erase_my_data',
        ]);
    });

    it('stops before touching rows when a bucket is not fully cleared', async () => {
        const { client, calls } = makeClient({
            objects: [
                { bucket_id: 'scans', name: 'u1/x' },
                { bucket_id: 'scans', name: 'u1/y' },
            ],
            removeShortfall: 'scans',
        });
        const result = await adapterWithClient(client).deleteAllMyData();
        expect(result).toEqual({ success: false, error: 'storage:scans', failed: ['storage:scans'] });
        expect(calls).not.toContain('rpc:erase_my_data');
    });

    it('reports per-table failures from erase_my_data', async () => {
        const { client } = makeClient({ eraseErrors: { messages: 'permission denied' } });
        const result = await adapterWithClient(client).deleteAllMyData();
        expect(result).toEqual({ success: false, error: 'messages', failed: ['messages'] });
    });

    it('fails without deleting anything when the storage listing fails', async () => {
        const { client, calls } = makeClient({ listError: { message: 'boom' } });
        const result = await adapterWithClient(client).deleteAllMyData();
        expect(result).toEqual({ success: false, error: 'boom', failed: ['storage'] });
        expect(calls).toEqual(['rpc:my_storage_objects']);
    });
});
