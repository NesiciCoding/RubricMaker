import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/111_prior_comment_search.sql'), 'utf8');

describe('prior-comment search migration (#887)', () => {
    it('enables pg_trgm and adds a Dutch generated tsvector behind one GIN index', () => {
        expect(sql).toMatch(/create extension if not exists pg_trgm/i);
        expect(sql).toMatch(/add column if not exists search_tsv tsvector/i);
        expect(sql).toMatch(
            /generated always as \(to_tsvector\('dutch'::regconfig, coalesce\(data->>'text', ''\)\)\) stored/i
        );
        expect(sql).toMatch(/using gin \(search_tsv\)/i);
    });

    it('creates no trigram index, because no query filters on trigram similarity', () => {
        // Only `similarity()` ranking uses pg_trgm, and that cannot use a GIN index.
        expect(sql).not.toMatch(/gin_trgm_ops/i);
        expect(sql).not.toMatch(/comment_bank_text_trgm_idx/i);
    });

    it('ranks with plainto_tsquery + ts_rank_cd and a similarity tiebreak', () => {
        expect(sql).toMatch(/plainto_tsquery\('dutch'::regconfig/i);
        expect(sql).toMatch(/ts_rank_cd\(/i);
        expect(sql).toMatch(/0\.5 \* similarity\(coalesce\(b\.data->>'text', ''\), params\.raw\)/i);
    });

    it('filters on the tsvector predicate alone so the GIN index is kept', () => {
        expect(sql).toMatch(/and b\.search_tsv @@ params\.tsq/i);
        // A second, unindexable predicate (or one OR'd with this) made the planner seq-scan.
        expect(sql).not.toMatch(/@@ params\.tsq\s+or\b/i);
        expect(sql).not.toMatch(/%>|word_similarity/i);
    });

    it('leaves typo tolerance to the client and has no fallback scan', () => {
        expect(sql).not.toMatch(/if found then/i);
        expect(sql).toMatch(/src\/utils\/commentRecall\.ts/);
    });

    it('runs as the caller so RLS scopes the corpus, and refuses other owners and anon', () => {
        expect(sql).toMatch(/security invoker/i);
        expect(sql).not.toMatch(/security definer/i);
        expect(sql).toMatch(/set search_path = public, pg_temp/i);
        expect(sql).toMatch(/b\.owner_id = auth\.uid\(\)/i);
        expect(sql).toMatch(/revoke all on function public\.search_prior_comments\(text, integer\) from public/i);
        expect(sql).toMatch(
            /grant execute on function public\.search_prior_comments\(text, integer\) to authenticated/i
        );
    });

    it('clamps the limit and short-circuits a blank query', () => {
        expect(sql).toMatch(/least\(greatest\(coalesce\(p_limit, 8\), 1\), 50\)/i);
        expect(sql).toMatch(/nullif\(btrim\(p_query\), ''\)/i);
        expect(sql).toMatch(/where params\.raw is not null/i);
    });

    it('is additive only — no drops, deletes or column rewrites', () => {
        expect(sql).not.toMatch(/^\s*drop\s+(table|index|column|function)/im);
        expect(sql).not.toMatch(/^\s*delete\s+from\b/im);
        expect(sql).not.toMatch(/alter column/i);
    });
});
