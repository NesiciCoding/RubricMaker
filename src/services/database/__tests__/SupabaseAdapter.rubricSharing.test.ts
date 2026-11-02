import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseAdapter } from '../SupabaseAdapter';
import { makeClient, adapterWithClient } from './supabaseTestUtils';

describe('SupabaseAdapter rubric sharing methods', () => {
    let adapter: SupabaseAdapter;

    beforeEach(() => {
        adapter = new SupabaseAdapter();
    });

    it('shareRubric rejects when not connected (db() throws)', async () => {
        await expect(adapter.shareRubric('r1', 'u2', 'read')).rejects.toThrow('Not connected');
    });

    it('shareRubric upserts a rubric_shares row and succeeds', async () => {
        const client = makeClient({ data: null, error: null });
        const connected = adapterWithClient(client);

        const result = await connected.shareRubric('r1', 'u2', 'edit');

        expect(client.from).toHaveBeenCalledWith('rubric_shares');
        expect(result).toEqual({ success: true });
    });

    it('shareRubric surfaces an error result', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        const result = await adapterWithClient(client).shareRubric('r1', 'u2', 'read');
        expect(result).toEqual({ success: false, error: 'boom' });
    });

    it('unshareRubric deletes the matching share row', async () => {
        const client = makeClient({ data: null, error: null });
        const result = await adapterWithClient(client).unshareRubric('r1', 'u2');
        expect(client.from).toHaveBeenCalledWith('rubric_shares');
        const builder = client.from.mock.results[0].value;
        expect(builder.eq).toHaveBeenCalledWith('rubric_id', 'r1');
        expect(builder.eq).toHaveBeenCalledWith('user_id', 'u2');
        expect(result).toEqual({ success: true });
    });

    it('fetchRubricShares maps nested profile rows and falls back when the profile is missing', async () => {
        const rows = [
            { user_id: 'u2', mode: 'edit', profiles: { email: 'b@x.com', display_name: 'Bob' } },
            { user_id: 'u3', mode: 'read', profiles: null },
        ];
        const client = makeClient({ data: rows, error: null });
        const result = await adapterWithClient(client).fetchRubricShares('r1');

        expect(result).toEqual([
            { userId: 'u2', email: 'b@x.com', displayName: 'Bob', mode: 'edit' },
            { userId: 'u3', email: undefined, displayName: undefined, mode: 'read' },
        ]);
    });

    it('fetchRubricShares returns [] on error', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        expect(await adapterWithClient(client).fetchRubricShares('r1')).toEqual([]);
    });

    it('lookupUserByEmail calls the lookup RPC with a trimmed, lowercased address', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'u2', display_name: 'Bob' }], error: null });
        const connected = adapterWithClient({ ...makeClient({ data: null, error: null }), rpc });

        const result = await connected.lookupUserByEmail('  Bob@Example.com  ');

        expect(rpc).toHaveBeenCalledWith('find_profile_by_email', { p_email: 'bob@example.com' });
        expect(result).toEqual({ userId: 'u2', displayName: 'Bob' });
    });

    it('lookupUserByEmail returns null when no account matches', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
        const connected = adapterWithClient({ ...makeClient({ data: null, error: null }), rpc });
        expect(await connected.lookupUserByEmail('nobody@x.com')).toBeNull();
    });

    it('shareRubricWithEmail returns notFound when the email has no account', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
        const client = { ...makeClient({ data: null, error: null }), rpc };
        const result = await adapterWithClient(client).shareRubricWithEmail('r1', 'nobody@x.com', 'read');

        expect(result).toEqual({ success: false, notFound: true, error: 'No account found for nobody@x.com' });
    });

    it('shareRubricWithEmail surfaces a refused lookup instead of reporting notFound', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Too many lookups, try again later' } });
        const client = { ...makeClient({ data: null, error: null }), rpc };
        const result = await adapterWithClient(client).shareRubricWithEmail('r1', 'bob@example.com', 'read');
        expect(result).toEqual({ success: false, error: 'Too many lookups, try again later' });
    });

    it('shareRubricWithEmail shares with the resolved user id when the email matches', async () => {
        const client = adapterWithClient(makeClient({ data: null, error: null }));
        const lookupSpy = vi.spyOn(client, 'lookupUserByEmail').mockResolvedValue({ userId: 'u2', displayName: 'Bob' });
        const shareSpy = vi.spyOn(client, 'shareRubric').mockResolvedValue({ success: true });

        const result = await client.shareRubricWithEmail('r1', 'bob@example.com', 'edit');

        expect(lookupSpy).toHaveBeenCalledWith('bob@example.com');
        expect(shareSpy).toHaveBeenCalledWith('r1', 'u2', 'edit');
        expect(result).toEqual({ success: true });
    });

    it('fetchSharedMaterials splits items from folders and normalises access', async () => {
        const rows = [
            { owner_id: 'o1', owner_name: 'Ann', item_kind: 'rubric', data: { id: 'r1' }, access: 'edit' },
            { owner_id: 'o1', owner_name: null, item_kind: 'folder', data: { id: 'f1' }, access: null },
            { owner_id: 'o2', owner_name: 'Bo', item_kind: 'rubric', data: null, access: 'view' },
        ];
        const rpc = vi.fn(async () => ({ data: rows, error: null }));
        const result = await adapterWithClient({ rpc }).fetchSharedMaterials('rubric');

        expect(rpc).toHaveBeenCalledWith('list_shared_materials', { p_kind: 'rubric' });
        expect(result.items).toEqual([{ item: { id: 'r1' }, ownerId: 'o1', ownerName: 'Ann', access: 'edit' }]);
        expect(result.folders).toEqual([{ item: { id: 'f1' }, ownerId: 'o1', ownerName: '', access: 'view' }]);
    });

    it('fetchSharedMaterials throws on an RPC error', async () => {
        const rpc = vi.fn(async () => ({ data: null, error: { message: 'boom' } }));
        await expect(adapterWithClient({ rpc }).fetchSharedMaterials('test')).rejects.toThrow('boom');
    });

    it('updateSharedMaterial updates (never upserts) the row by id', async () => {
        const client = makeClient({ data: [{ id: 'r1' }], error: null });
        const rubric = { id: 'r1', updatedAt: '2026-01-01T00:00:00Z' } as never;
        const result = await adapterWithClient(client).updateSharedMaterial('rubric', rubric);

        expect(client.from).toHaveBeenCalledWith('rubrics');
        const builder = client.from.mock.results[0].value;
        expect(builder.update).toHaveBeenCalledWith({ data: rubric, updated_at: '2026-01-01T00:00:00Z' });
        expect(builder.upsert).not.toHaveBeenCalled();
        expect(builder.eq).toHaveBeenCalledWith('id', 'r1');
        expect(result).toEqual({ success: true });
    });

    it('updateSharedMaterial reports not_permitted when RLS matched no row', async () => {
        const client = makeClient({ data: [], error: null });
        const result = await adapterWithClient(client).updateSharedMaterial('test', { id: 't1' } as never);
        expect(client.from).toHaveBeenCalledWith('tests');
        expect(client.from.mock.results[0].value.update).toHaveBeenCalledWith({ data: { id: 't1' } });
        expect(result).toEqual({ success: false, error: 'not_permitted' });
    });

    it('updateSharedMaterial surfaces a database error', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        const result = await adapterWithClient(client).updateSharedMaterial('test', { id: 't1' } as never);
        expect(result).toEqual({ success: false, error: 'boom' });
    });

    it('saveTestAssignment writes my own assignment under me and a colleague’s under its test owner', async () => {
        const client = makeClient({ data: null, error: null });
        const adapter = adapterWithClient(client, 'me');
        const base = {
            testId: 't1',
            studentId: 's1',
            teacherKey: 'k1',
            testName: 'Quiz',
            requireSEB: false,
            createdAt: '2026-01-01T00:00:00Z',
        };
        await adapter.saveTestAssignment(base);
        await adapter.saveTestAssignment({ ...base, teacherKey: 'k2', ownerId: 'ann' });
        const rows = client.from.mock.results.map((r) => (r.value.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]);
        expect(rows[0]).toMatchObject({ id: 'k1', owner_id: 'me' });
        expect(rows[1]).toMatchObject({ id: 'k2', owner_id: 'ann' });
    });

    it('fetchProfileNames maps visible profiles to a display name, falling back to the email', async () => {
        const rows = [
            { id: 'a', display_name: 'Ann', email: 'ann@x' },
            { id: 'b', display_name: '  ', email: 'bo@x' },
            { id: 'c', display_name: null, email: null },
        ];
        const client = makeClient({ data: rows, error: null });
        const adapter = adapterWithClient(client);
        expect(await adapter.fetchProfileNames(['a', 'b', 'a', 'c', ''])).toEqual({ a: 'Ann', b: 'bo@x' });
        expect(client.from).toHaveBeenCalledWith('profiles');
        expect(client.from.mock.results[0].value.in).toHaveBeenCalledWith('id', ['a', 'b', 'c']);
    });

    it('fetchProfileNames skips the query for no ids and returns {} on an error', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        const adapter = adapterWithClient(client);
        expect(await adapter.fetchProfileNames([])).toEqual({});
        expect(client.from).not.toHaveBeenCalled();
        expect(await adapter.fetchProfileNames(['a'])).toEqual({});
    });
});
