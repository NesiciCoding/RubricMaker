import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseAdapter } from '../SupabaseAdapter';
import { makeClient, adapterWithClient } from './supabaseTestUtils';

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
        const builder = client.from.mock.results[0].value;
        expect(builder.eq).toHaveBeenCalledWith('class_id', 'c1');
        expect(builder.eq).toHaveBeenCalledWith('user_id', 'u2');
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

    it('addClassMemberByEmail returns notFound when the email has no account', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
        const client = { ...makeClient({ data: null, error: null }), rpc };
        const result = await adapterWithClient(client).addClassMemberByEmail('c1', 'nobody@x.com');
        expect(result).toEqual({ success: false, notFound: true, error: 'No account found for nobody@x.com' });
    });

    it('addClassMemberByEmail surfaces a refused lookup', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'rate limited' } });
        const client = { ...makeClient({ data: null, error: null }), rpc };
        const result = await adapterWithClient(client).addClassMemberByEmail('c1', 'bob@x.com', 'editor');
        expect(result).toEqual({ success: false, error: 'rate limited' });
    });

    it('addClassMemberByEmail adds the resolved user with the requested role', async () => {
        const adapterInstance = adapterWithClient(makeClient({ data: null, error: null }));
        vi.spyOn(adapterInstance, 'lookupUserByEmail').mockResolvedValue({ userId: 'u2' });
        const addSpy = vi.spyOn(adapterInstance, 'addClassMember').mockResolvedValue({ success: true });

        const result = await adapterInstance.addClassMemberByEmail('c1', 'bob@x.com', 'editor');

        expect(addSpy).toHaveBeenCalledWith('c1', 'u2', 'editor');
        expect(result).toEqual({ success: true });
    });

    it('addClassMemberByEmail refuses to add the signed-in owner to their own class', async () => {
        const adapterInstance = adapterWithClient(makeClient({ data: null, error: null }), 'user1');
        vi.spyOn(adapterInstance, 'lookupUserByEmail').mockResolvedValue({ userId: 'user1' });
        const addSpy = vi.spyOn(adapterInstance, 'addClassMember');

        const result = await adapterInstance.addClassMemberByEmail('c1', 'me@x.com');

        expect(addSpy).not.toHaveBeenCalled();
        expect(result).toMatchObject({ success: false, isSelf: true });
    });
});
