-- Recall similar past comments while grading (#887).
--
-- Additive only: one index and one generated column on `comment_bank`; no existing column is
-- rewritten and no data is touched. `comment_bank` is one row per saved snippet, so the stored
-- column is cheap to backfill.
--
-- The dictionary is Dutch because the corpus is Dutch EFL teacher feedback. English snippets
-- stem imperfectly under it — that is the accepted degradation from #887, not an oversight.
-- Typo tolerance does not come from the dictionary and is not done here: the grading composer
-- ranks its hydrated comments client-side (`src/utils/commentRecall.ts`, trigram similarity), so
-- the RPC stays a single indexed pass instead of adding a sequential fallback to every miss.
--
-- `pg_trgm` is installed for the dictionary-free `similarity()` tiebreak in the ranking below,
-- but there is deliberately no trigram GIN index on `comment_bank`. Nothing filters on trigram
-- similarity: the RPC filters on `search_tsv` only, and the client-side ranker runs in the
-- browser. An index no query can use is pure write amplification on every bank edit, so if a
-- server-side fuzzy filter is ever added, measure its predicate first and create the index in
-- that migration alongside the query that needs it.

create extension if not exists pg_trgm;

alter table public.comment_bank
    add column if not exists search_tsv tsvector
    generated always as (to_tsvector('dutch'::regconfig, coalesce(data->>'text', ''))) stored;

create index if not exists comment_bank_search_tsv_idx
    on public.comment_bank using gin (search_tsv);

-- Ranked prior comments for a free-text query.
--
-- One predicate, so the planner keeps `comment_bank_search_tsv_idx`: an `OR` between this and a
-- trigram predicate was measured over 60k rows to abandon both GIN indexes for a ~590 ms
-- sequential scan. `plainto_tsquery` already makes word order irrelevant; a misspelt word is
-- covered by the client-side ranking that runs either way.
--
-- `security invoker` on purpose: RLS on `comment_bank` is what scopes the corpus, and the extra
-- `owner_id = auth.uid()` keeps a colleague's school-shared snippet (comment_bank_school_select)
-- out of "comments I have written". No elevated-privilege helper is exposed, and anon cannot
-- execute it.
create or replace function public.search_prior_comments(p_query text, p_limit integer default 8)
returns table (id text, text text, tags text[], rank real)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
    with params as (
        select nullif(btrim(p_query), '') as raw,
               plainto_tsquery('dutch'::regconfig, coalesce(p_query, '')) as tsq,
               least(greatest(coalesce(p_limit, 8), 1), 50) as lim
    )
    select b.id,
           b.data->>'text' as text,
           coalesce(array(select jsonb_array_elements_text(b.data->'tags')), '{}'::text[]) as tags,
           (ts_rank_cd(b.search_tsv, params.tsq)
            + 0.5 * similarity(coalesce(b.data->>'text', ''), params.raw))::real as rank
    from public.comment_bank b
    cross join params
    where params.raw is not null
      and b.owner_id = auth.uid()
      and coalesce(b.data->>'text', '') <> ''
      and b.search_tsv @@ params.tsq
    order by rank desc, b.data->>'text'
    limit (select lim from params);
$$;

revoke all on function public.search_prior_comments(text, integer) from public;
grant execute on function public.search_prior_comments(text, integer) to authenticated;
