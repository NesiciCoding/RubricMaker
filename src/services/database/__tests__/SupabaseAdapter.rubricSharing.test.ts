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

    it('lookupUserByEmail lowercases and trims the email before querying', async () => {
        const client = makeClient({ data: { id: 'u2', display_name: 'Bob' }, error: null });
        const connected = adapterWithClient(client);

        const result = await connected.lookupUserByEmail('  Bob@Example.com  ');

        const builder = client.from.mock.results[0].value;
        expect(builder.eq).toHaveBeenCalledWith('email', 'bob@example.com');
        expect(result).toEqual({ userId: 'u2', displayName: 'Bob' });
    });

    it('lookupUserByEmail returns null when no account matches', async () => {
        const client = makeClient({ data: null, error: null });
        expect(await adapterWithClient(client).lookupUserByEmail('nobody@x.com')).toBeNull();
    });

    it('shareRubricWithEmail returns notFound when the email has no account', async () => {
        const client = makeClient({ data: null, error: null });
        const result = await adapterWithClient(client).shareRubricWithEmail('r1', 'nobody@x.com', 'read');

        expect(result).toEqual({ success: false, notFound: true, error: 'No account found for nobody@x.com' });
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

    it('fetchSharedRubrics unwraps the nested rubrics.data payload and drops empty rows', async () => {
        const rubricA = { id: 'r1', name: 'Shared A' };
        const rows = [{ rubrics: { data: rubricA } }, { rubrics: null }];
        const client = makeClient({ data: rows, error: null });

        const result = await adapterWithClient(client).fetchSharedRubrics();

        expect(result).toEqual([rubricA]);
    });

    it('fetchSchoolSharedRubrics returns [] on error', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        expect(await adapterWithClient(client).fetchSchoolSharedRubrics()).toEqual([]);
    });

    it('fetchSchoolSharedRubrics excludes the current user and maps rows', async () => {
        const okClient = makeClient({ data: [{ owner_id: 'other', data: { id: 'r2' } }], error: null });
        const connected = adapterWithClient(okClient, 'user1');
        const result = await connected.fetchSchoolSharedRubrics();

        const builder = okClient.from.mock.results[0].value;
        expect(builder.neq).toHaveBeenCalledWith('owner_id', 'user1');
        expect(result).toEqual([{ id: 'r2' }]);
    });
});
