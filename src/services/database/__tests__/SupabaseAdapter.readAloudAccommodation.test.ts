import { describe, it, expect, beforeEach } from 'vitest';
import { SupabaseAdapter } from '../SupabaseAdapter';
import { makeClient, adapterWithClient } from './supabaseTestUtils';

describe('SupabaseAdapter.fetchMyReadAloudAccommodation', () => {
    let adapter: SupabaseAdapter;

    beforeEach(() => {
        adapter = new SupabaseAdapter();
    });

    it('rejects when not connected (db() throws)', async () => {
        await expect(adapter.fetchMyReadAloudAccommodation('s1')).rejects.toThrow('Not connected');
    });

    it('returns true when the student row has the accommodation enabled', async () => {
        const client = makeClient({ data: { data: { readAloudAccommodation: true } }, error: null });
        const result = await adapterWithClient(client).fetchMyReadAloudAccommodation('s1');
        expect(client.from).toHaveBeenCalledWith('students');
        const builder = client.from.mock.results[0].value;
        expect(builder.eq).toHaveBeenCalledWith('id', 's1');
        expect(result).toBe(true);
    });

    it('returns false when the flag is absent or false', async () => {
        const client = makeClient({ data: { data: {} }, error: null });
        expect(await adapterWithClient(client).fetchMyReadAloudAccommodation('s1')).toBe(false);
    });

    it('returns false (not an error) when RLS returns no row', async () => {
        const client = makeClient({ data: null, error: null });
        expect(await adapterWithClient(client).fetchMyReadAloudAccommodation('other-student')).toBe(false);
    });

    it('returns false when the query errors', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        expect(await adapterWithClient(client).fetchMyReadAloudAccommodation('s1')).toBe(false);
    });
});
