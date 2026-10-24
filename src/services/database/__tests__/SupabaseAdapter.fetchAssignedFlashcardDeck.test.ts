import { describe, it, expect, beforeEach } from 'vitest';
import { SupabaseAdapter } from '../SupabaseAdapter';
import { makeClient, adapterWithClient } from './supabaseTestUtils';

describe('SupabaseAdapter.fetchAssignedFlashcardDeck', () => {
    let adapter: SupabaseAdapter;

    beforeEach(() => {
        adapter = new SupabaseAdapter();
    });

    it('rejects when not connected (db() throws)', async () => {
        await expect(adapter.fetchAssignedFlashcardDeck('d1')).rejects.toThrow('Not connected');
    });

    it('returns the deck data when the row exists', async () => {
        const deck = { id: 'd1', cards: [] };
        const client = makeClient({ data: { data: deck }, error: null });
        const result = await adapterWithClient(client).fetchAssignedFlashcardDeck('d1');
        expect(client.from).toHaveBeenCalledWith('flashcard_decks');
        const builder = client.from.mock.results[0].value;
        expect(builder.eq).toHaveBeenCalledWith('id', 'd1');
        expect(result).toEqual(deck);
    });

    it('resolves to null when no row is found', async () => {
        const client = makeClient({ data: null, error: null });
        expect(await adapterWithClient(client).fetchAssignedFlashcardDeck('missing')).toBeNull();
    });

    it('rejects when the query errors, so the caller can distinguish it from a missing deck', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        await expect(adapterWithClient(client).fetchAssignedFlashcardDeck('d1')).rejects.toThrow('boom');
    });
});
