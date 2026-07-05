import { vi } from 'vitest';
import { SupabaseAdapter } from '../SupabaseAdapter';

export type QueryResult = { data: unknown; error: { message: string } | null };

export function makeQueryBuilder(result: QueryResult) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.insert = vi.fn(chain);
    builder.update = vi.fn(chain);
    builder.upsert = vi.fn(chain);
    builder.delete = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.neq = vi.fn(chain);
    builder.order = vi.fn(chain);
    builder.single = vi.fn(async () => result);
    builder.maybeSingle = vi.fn(async () => result);
    builder.then = (resolve: (r: QueryResult) => void) => resolve(result);
    return builder;
}

export function makeClient(result: QueryResult) {
    return { from: vi.fn(() => makeQueryBuilder(result)) };
}

/**
 * Some adapter methods (createSchool, removeSchoolMember) touch multiple
 * tables in sequence, with a rollback step re-hitting a table already called.
 * A single fixed result per client can't model that — queue one result per
 * call, per table, consumed in call order (last entry repeats once exhausted).
 */
export function makeSequencedClient(tableResults: Record<string, QueryResult[]>) {
    const callIndex: Record<string, number> = {};
    const from = vi.fn((table: string) => {
        const idx = callIndex[table] ?? 0;
        callIndex[table] = idx + 1;
        const seq = tableResults[table] ?? [];
        const result = seq[idx] ?? seq[seq.length - 1] ?? { data: null, error: null };
        return makeQueryBuilder(result);
    });
    return { from };
}

export function adapterWithClient(client: unknown, userId: string | null = 'user1') {
    const adapter = new SupabaseAdapter();
    // Reach into private fields — SupabaseAdapter has no public setter for a
    // pre-connected client, so tests construct one this way.
    (adapter as unknown as { client: unknown }).client = client;
    (adapter as unknown as { userId: string | null }).userId = userId;
    return adapter;
}
