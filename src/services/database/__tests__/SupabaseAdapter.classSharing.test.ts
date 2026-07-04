import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseAdapter } from '../SupabaseAdapter';

type QueryResult = { data: unknown; error: { message: string } | null };

function makeQueryBuilder(result: QueryResult) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.upsert = vi.fn(chain);
    builder.delete = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.then = (resolve: (r: QueryResult) => void) => resolve(result);
    return builder;
}

function makeClient(result: QueryResult) {
    return { from: vi.fn(() => makeQueryBuilder(result)) };
}

function adapterWithClient(client: unknown, userId: string | null = 'user1') {
    const adapter = new SupabaseAdapter();
    // Reach into private fields the same way SupabaseAdapter.marketplace.test.ts
    // constructs adapters with a pre-connected client (no public setter exists).
    (adapter as unknown as { client: unknown }).client = client;
    (adapter as unknown as { userId: string | null }).userId = userId;
    return adapter;
}

describe('SupabaseAdapter class sharing methods', () => {
    let adapter: SupabaseAdapter;

    beforeEach(() => {
        adapter = new SupabaseAdapter();
    });

    it('addClassMember rejects when not connected (db() throws)', async () => {
        await expect(adapter.addClassMember('c1', 'u2')).rejects.toThrow('Not connected');
    });

    it('addClassMember upserts a class_members row, defaulting to viewer', async () => {
        const client = makeClient({ data: null, error: null });
        const result = await adapterWithClient(client).addClassMember('c1', 'u2');

        expect(client.from).toHaveBeenCalledWith('class_members');
        const builder = client.from.mock.results[0].value;
        expect(builder.upsert).toHaveBeenCalledWith(
            { class_id: 'c1', user_id: 'u2', role: 'viewer' },
            { onConflict: 'class_id,user_id' }
        );
        expect(result).toEqual({ success: true });
    });

    it('addClassMember surfaces an error result', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        const result = await adapterWithClient(client).addClassMember('c1', 'u2', 'editor');
        expect(result).toEqual({ success: false, error: 'boom' });
    });

    it('removeClassMember deletes the matching membership row', async () => {
        const client = makeClient({ data: null, error: null });
        const result = await adapterWithClient(client).removeClassMember('c1', 'u2');
        expect(client.from).toHaveBeenCalledWith('class_members');
        expect(result).toEqual({ success: true });
    });

    it('fetchClassMembers maps nested profile rows and falls back when the profile is missing', async () => {
        const rows = [
            { user_id: 'u2', role: 'editor', profiles: { email: 'b@x.com', display_name: 'Bob' } },
            { user_id: 'u3', role: 'viewer', profiles: null },
        ];
        const client = makeClient({ data: rows, error: null });
        const result = await adapterWithClient(client).fetchClassMembers('c1');

        expect(result).toEqual([
            { userId: 'u2', email: 'b@x.com', displayName: 'Bob', role: 'editor' },
            { userId: 'u3', email: undefined, displayName: undefined, role: 'viewer' },
        ]);
    });

    it('fetchClassMembers returns [] on error', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        expect(await adapterWithClient(client).fetchClassMembers('c1')).toEqual([]);
    });
});
