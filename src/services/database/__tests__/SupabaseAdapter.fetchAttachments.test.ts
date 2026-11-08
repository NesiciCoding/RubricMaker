import { describe, it, expect } from 'vitest';
import { makePagedClient, adapterWithClient } from './supabaseTestUtils';

function makeRow(i: number) {
    return {
        data: { id: `a${i}`, name: `file${i}`, mimeType: 'text/plain', size: 1, addedAt: '2026-01-01T00:00:00.000Z' },
        storage_path: `path/${i}`,
    };
}

describe('SupabaseAdapter.fetchAttachments', () => {
    it('pages past PostgREST default 1000-row cap instead of silently dropping rows', async () => {
        const rows = Array.from({ length: 2500 }, (_, i) => makeRow(i));
        const client = makePagedClient('attachments', rows);
        const adapter = adapterWithClient(client);

        const result = await adapter.fetchAttachments();

        expect(result).toHaveLength(2500);
        expect(result[0]).toEqual({ ...rows[0].data, storagePath: 'path/0' });
        expect(result[2499]).toEqual({ ...rows[2499].data, storagePath: 'path/2499' });
    });

    it('maps a null storage_path to undefined storagePath', async () => {
        const rows = [
            {
                data: { id: 'a0', name: 'f', mimeType: 'text/plain', size: 1, addedAt: '2026-01-01' },
                storage_path: null,
            },
        ];
        const client = makePagedClient('attachments', rows);
        const adapter = adapterWithClient(client);

        const result = await adapter.fetchAttachments();

        expect(result[0].storagePath).toBeUndefined();
    });
});
