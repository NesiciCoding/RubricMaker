import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseAdapter } from '../SupabaseAdapter';
import { DEFAULT_FORMAT, type Rubric } from '../../../types';

type QueryResult = { data: unknown; error: { message: string } | null };

function makeQueryBuilder(result: QueryResult) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.insert = vi.fn(chain);
    builder.upsert = vi.fn(chain);
    builder.delete = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.order = vi.fn(chain);
    builder.single = vi.fn(async () => result);
    builder.then = (resolve: (r: QueryResult) => void) => resolve(result);
    return builder;
}

function makeClient(result: QueryResult) {
    return {
        from: vi.fn(() => makeQueryBuilder(result)),
    };
}

const rubric: Rubric = {
    id: 'rubric1',
    name: 'Essay Rubric',
    subject: 'English',
    description: 'desc',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage' as Rubric['scoringMode'],
};

function adapterWithClient(client: unknown, userId = 'user1') {
    const adapter = new SupabaseAdapter();
    // Reach into private fields the same way other tests in this codebase
    // construct adapters with a pre-connected client (no public setter exists).
    (adapter as unknown as { client: unknown }).client = client;
    (adapter as unknown as { userId: string | null }).userId = userId;
    return adapter;
}

describe('SupabaseAdapter marketplace methods', () => {
    let adapter: SupabaseAdapter;

    beforeEach(() => {
        adapter = new SupabaseAdapter();
    });

    it('listMarketplaceListings returns [] when not configured', async () => {
        expect(await adapter.listMarketplaceListings('school1')).toEqual([]);
    });

    it('publishToMarketplace returns null when not configured', async () => {
        expect(await adapter.publishToMarketplace('school1', 'rubric', rubric)).toBeNull();
    });

    it('cloneMarketplaceListing returns null when not configured', async () => {
        expect(await adapter.cloneMarketplaceListing('listing1')).toBeNull();
    });

    it('upvoteListing returns a failure result when not configured', async () => {
        const result = await adapter.upvoteListing('listing1');
        expect(result.success).toBe(false);
    });

    it('removeUpvote returns a failure result when not configured', async () => {
        const result = await adapter.removeUpvote('listing1');
        expect(result.success).toBe(false);
    });

    it('listMarketplaceListings maps snake_case rows to MarketplaceListing', async () => {
        const row = {
            id: 'listing1',
            school_id: 'school1',
            published_by: 'user1',
            kind: 'rubric',
            rubric_snapshot: rubric,
            name: 'Essay Rubric',
            subject: 'English',
            description: 'desc',
            attribution: 'Jane Doe',
            upvote_count: 3,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-02T00:00:00.000Z',
        };
        const client = makeClient({ data: [row], error: null });
        const connectedAdapter = adapterWithClient(client);

        const result = await connectedAdapter.listMarketplaceListings('school1');

        expect(client.from).toHaveBeenCalledWith('marketplace_listings');
        expect(result).toEqual([
            {
                id: 'listing1',
                schoolId: 'school1',
                publishedBy: 'user1',
                kind: 'rubric',
                snapshot: rubric,
                name: 'Essay Rubric',
                subject: 'English',
                description: 'desc',
                attribution: 'Jane Doe',
                upvoteCount: 3,
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-02T00:00:00.000Z',
            },
        ]);
    });

    it('listMarketplaceListings defaults kind to rubric for pre-24.4 rows', async () => {
        const row = {
            id: 'listing1',
            school_id: 'school1',
            published_by: 'user1',
            kind: null,
            rubric_snapshot: rubric,
            name: 'Essay Rubric',
            subject: 'English',
            description: 'desc',
            attribution: null,
            upvote_count: 0,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
        };
        const client = makeClient({ data: [row], error: null });
        const connectedAdapter = adapterWithClient(client);

        const result = await connectedAdapter.listMarketplaceListings('school1');

        expect(result[0].kind).toBe('rubric');
    });

    it('listMarketplaceListings returns [] on error', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        const connectedAdapter = adapterWithClient(client);

        expect(await connectedAdapter.listMarketplaceListings('school1')).toEqual([]);
    });

    it('publishToMarketplace inserts a row and maps the returned listing', async () => {
        const row = {
            id: 'listing1',
            school_id: 'school1',
            published_by: 'user1',
            kind: 'rubric',
            rubric_snapshot: rubric,
            name: 'Essay Rubric',
            subject: 'English',
            description: 'desc',
            attribution: 'Jane Doe',
            upvote_count: 0,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
        };
        const client = makeClient({ data: row, error: null });
        const connectedAdapter = adapterWithClient(client);

        const result = await connectedAdapter.publishToMarketplace('school1', 'rubric', rubric, 'Jane Doe');

        expect(client.from).toHaveBeenCalledWith('marketplace_listings');
        expect(result?.id).toBe('listing1');
        expect(result?.kind).toBe('rubric');
        expect(result?.attribution).toBe('Jane Doe');
    });

    it('publishToMarketplace omits subject for non-rubric kinds', async () => {
        const testEntity = {
            id: 't1',
            name: 'Grammar Quiz',
            questions: [],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2024-01-01T00:00:00.000Z',
        };
        const client = makeClient({ data: { ...testEntity, kind: 'test' }, error: null });
        const connectedAdapter = adapterWithClient(client);

        await connectedAdapter.publishToMarketplace('school1', 'test', testEntity as never);

        const builder = client.from.mock.results[0].value as { insert: ReturnType<typeof vi.fn> };
        expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'test', subject: null }));
    });

    it('publishToMarketplace returns null on error', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        const connectedAdapter = adapterWithClient(client);

        expect(await connectedAdapter.publishToMarketplace('school1', 'rubric', rubric)).toBeNull();
    });

    it('cloneMarketplaceListing returns a fresh local Rubric without versions', async () => {
        const client = makeClient({
            data: { kind: 'rubric', rubric_snapshot: { ...rubric, versions: [{ savedAt: 'x', snapshot: rubric }] } },
            error: null,
        });
        const connectedAdapter = adapterWithClient(client);

        const cloned = await connectedAdapter.cloneMarketplaceListing('listing1');

        expect(cloned).not.toBeNull();
        expect(cloned?.kind).toBe('rubric');
        expect(cloned?.entity.id).not.toBe(rubric.id);
        expect(cloned?.entity.name).toBe(rubric.name);
        expect((cloned?.entity as unknown as { versions?: unknown })?.versions).toBeUndefined();
    });

    it('cloneMarketplaceListing returns the deck kind for a published flashcard deck', async () => {
        const deck = { id: 'd1', name: 'Grammar Deck', cards: [], createdAt: '2024-01-01T00:00:00.000Z' };
        const client = makeClient({ data: { kind: 'deck', rubric_snapshot: deck }, error: null });
        const connectedAdapter = adapterWithClient(client);

        const cloned = await connectedAdapter.cloneMarketplaceListing('listing1');

        expect(cloned?.kind).toBe('deck');
        expect(cloned?.entity.name).toBe('Grammar Deck');
        expect(cloned?.entity.id).not.toBe('d1');
    });

    it('cloneMarketplaceListing returns null on error', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        const connectedAdapter = adapterWithClient(client);

        expect(await connectedAdapter.cloneMarketplaceListing('listing1')).toBeNull();
    });

    it('upvoteListing upserts a row scoped to the current user', async () => {
        const client = makeClient({ data: null, error: null });
        const connectedAdapter = adapterWithClient(client);

        const result = await connectedAdapter.upvoteListing('listing1');

        expect(client.from).toHaveBeenCalledWith('marketplace_upvotes');
        expect(result.success).toBe(true);
    });

    it('upvoteListing surfaces an error result', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        const connectedAdapter = adapterWithClient(client);

        const result = await connectedAdapter.upvoteListing('listing1');

        expect(result).toEqual({ success: false, error: 'boom' });
    });

    it('removeUpvote deletes the current user upvote row', async () => {
        const client = makeClient({ data: null, error: null });
        const connectedAdapter = adapterWithClient(client);

        const result = await connectedAdapter.removeUpvote('listing1');

        expect(client.from).toHaveBeenCalledWith('marketplace_upvotes');
        expect(result.success).toBe(true);
    });
});
