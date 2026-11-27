import { describe, expect, it, type Mock } from 'vitest';
import { makeClient, adapterWithClient } from './supabaseTestUtils';
import type { Attachment } from '../../../types';

const meta: Omit<Attachment, 'dataUrl'> = {
    id: 'a1',
    name: 'Essay.html',
    mimeType: 'text/html',
    size: 120,
    studentId: 's1',
    addedAt: '2024-01-01T00:00:00.000Z',
    correctedHtml: '<p>Corrected</p>',
    correctedAt: '2024-01-02T00:00:00.000Z',
};

function firstBuilder(client: ReturnType<typeof makeClient>) {
    return client.from.mock.results[0]!.value as {
        update: Mock;
        upsert: Mock;
        eq: Mock;
    };
}

describe('SupabaseAdapter attachment metadata', () => {
    it('updates only the data document, owner-scoped, without touching storage_path', async () => {
        const client = makeClient({ data: null, error: null });
        const adapter = adapterWithClient(client, 'user1');

        const result = await adapter.updateAttachmentMeta(meta);

        expect(result).toEqual({ success: true });
        const builder = firstBuilder(client);
        expect(builder.update).toHaveBeenCalledWith({ data: meta });
        expect(builder.eq).toHaveBeenNthCalledWith(1, 'id', 'a1');
        expect(builder.eq).toHaveBeenNthCalledWith(2, 'owner_id', 'user1');
        expect(builder.upsert).not.toHaveBeenCalled();
    });

    it('reports a failed correction write instead of pretending it saved', async () => {
        const client = makeClient({ data: null, error: { message: 'nope' } });
        const adapter = adapterWithClient(client, 'user1');

        expect(await adapter.updateAttachmentMeta(meta)).toEqual({ success: false, error: 'nope' });
    });

    it('leaves storage_path out of a metadata-only upsert', async () => {
        const client = makeClient({ data: null, error: null });
        const adapter = adapterWithClient(client, 'user1');

        await adapter.upsertAttachment(meta);

        const builder = firstBuilder(client);
        const row = builder.upsert.mock.calls[0]![0] as Record<string, unknown>;
        expect(row).not.toHaveProperty('storage_path');
    });

    it('writes storage_path when this push uploaded the file', async () => {
        const client = makeClient({ data: null, error: null });
        const adapter = adapterWithClient(client, 'user1');

        await adapter.upsertAttachment(meta, 'user1/a1');

        const builder = firstBuilder(client);
        expect(builder.upsert.mock.calls[0]![0]).toMatchObject({ storage_path: 'user1/a1' });
    });
});
