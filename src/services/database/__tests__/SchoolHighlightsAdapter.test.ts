import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SchoolHighlightsAdapter } from '../SchoolHighlightsAdapter';

type Page = { data: { id: string }[] | null; error: { message: string } | null };

function clientWithPages(pages: Page[]) {
    const range = vi.fn();
    pages.forEach((page) => range.mockResolvedValueOnce(page));
    const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), order: vi.fn(() => chain), range };
    return { client: { from: vi.fn(() => chain) } as unknown as SupabaseClient, chain, range };
}

const rows = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ id: `s${from + i}` }));

describe('SchoolHighlightsAdapter.fetchOwnStudentIds', () => {
    it('reads the owner’s student ids page by page until a short page', async () => {
        const { client, chain, range } = clientWithPages([
            { data: rows(0, 1000), error: null },
            { data: rows(1000, 3), error: null },
        ]);
        const ids = await new SchoolHighlightsAdapter(client).fetchOwnStudentIds('teacher-1');
        expect(ids.size).toBe(1003);
        expect(chain.eq).toHaveBeenCalledWith('owner_id', 'teacher-1');
        expect(range).toHaveBeenNthCalledWith(1, 0, 999);
        expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
    });

    it('returns an empty set for a teacher with no students', async () => {
        const { client } = clientWithPages([{ data: [], error: null }]);
        expect((await new SchoolHighlightsAdapter(client).fetchOwnStudentIds('t')).size).toBe(0);
    });

    it('throws when the read fails', async () => {
        const { client } = clientWithPages([{ data: null, error: { message: 'rls' } }]);
        await expect(new SchoolHighlightsAdapter(client).fetchOwnStudentIds('t')).rejects.toThrow('rls');
    });
});
