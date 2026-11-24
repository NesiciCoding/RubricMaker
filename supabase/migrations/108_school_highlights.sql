-- Migration 108: school-level highlights for a wall display (Grafana).
--
-- A hallway screen wants numbers like "how many students are at B1 reading" and "which grammar
-- topics does the school know best", but CEFR level and grammar mastery are computed in the
-- browser (cefrStudentAggregator, masteryProfileAggregator) from jsonb documents, and the SQL side
-- must not grow a second copy of that logic. Each teacher's client therefore pushes a small
-- AGGREGATE snapshot of its own students — counts per CEFR level and a per-grammar-item score
-- total — and the monitoring functions below sum them per school.
--
-- A snapshot holds no student id, name, email, class or free text: level counts and, per grammar
-- item, "n students with evidence, sum of their scores". Rows are the teacher's own (RLS), one per
-- teacher per day, and are part of that teacher's data: backed up with owner_data_tables(), erased
-- by "Delete all my database data", pruned after two years.
--
-- Small-group suppression lives in the read functions, not the client: a school (or grammar item)
-- with fewer than monitoring.hl_min_cohort() students returns no rows, so a screen can never show
-- a figure that points at a handful of identifiable children.

-- ── 1. Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_highlight_snapshots (
  owner_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  snapshot_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  student_count INTEGER     NOT NULL DEFAULT 0 CHECK (student_count >= 0),
  cefr          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  grammar       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, snapshot_date),
  CONSTRAINT school_highlight_snapshots_shape CHECK (
    jsonb_typeof(cefr) = 'object'
    AND jsonb_typeof(grammar) = 'array'
    AND pg_column_size(cefr) < 20000
    AND pg_column_size(grammar) < 200000
  )
);

CREATE INDEX IF NOT EXISTS school_highlight_snapshots_date_idx
  ON public.school_highlight_snapshots (snapshot_date);

ALTER TABLE public.school_highlight_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_highlight_snapshots_owner_all" ON public.school_highlight_snapshots;
CREATE POLICY "school_highlight_snapshots_owner_all"
  ON public.school_highlight_snapshots FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- Weekly trends need history, a wall display does not need more than two years of it.
SELECT cron.schedule(
  'school-highlight-snapshots-cleanup',
  '55 3 * * *',
  $$ DELETE FROM public.school_highlight_snapshots WHERE snapshot_date < current_date - 730 $$
);

-- ── 2. Read functions for Grafana ───────────────────────────────────────────────
-- Same rules as 091/092: SECURITY DEFINER with a pinned search_path, in the monitoring schema the
-- REST API does not expose, executable by pg_monitor only.

CREATE SCHEMA IF NOT EXISTS monitoring;
REVOKE ALL ON SCHEMA monitoring FROM PUBLIC;
GRANT USAGE ON SCHEMA monitoring TO pg_monitor;

CREATE OR REPLACE FUNCTION monitoring.hl_min_cohort()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 5 $$;

-- Each teacher's newest snapshot from the last 60 days (a teacher who stopped syncing drops out),
-- attributed to the school on their profile.
CREATE OR REPLACE FUNCTION monitoring.hl_current_snapshots()
RETURNS TABLE (school text, student_count integer, cefr jsonb, grammar jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(s.name, 'No school'), n.student_count, n.cefr, n.grammar
  FROM (
    SELECT DISTINCT ON (owner_id) owner_id, student_count, cefr, grammar
    FROM public.school_highlight_snapshots
    WHERE snapshot_date >= current_date - 60
    ORDER BY owner_id, snapshot_date DESC
  ) n
  JOIN public.profiles p ON p.id = n.owner_id
  LEFT JOIN public.schools s ON s.id = p.school_id
$$;

-- Students per CEFR level for 'overall' or one skill ('reading', 'writing', …), per school.
CREATE OR REPLACE FUNCTION monitoring.hl_cefr_distribution(skill text DEFAULT 'overall')
RETURNS TABLE (school text, level text, students bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH levels AS (
    SELECT c.school, e.key AS level, sum(e.value::bigint) AS students
    FROM monitoring.hl_current_snapshots() c,
         LATERAL jsonb_each_text(
           CASE WHEN skill = 'overall' THEN c.cefr->'overall' ELSE c.cefr->'skills'->skill END
         ) e
    WHERE e.value ~ '^[0-9]+$'
    GROUP BY 1, 2
  )
  SELECT l.school, l.level, l.students
  FROM levels l
  WHERE (SELECT sum(x.students) FROM levels x WHERE x.school = l.school) >= monitoring.hl_min_cohort()
$$;

-- Share of students per overall level, one point per ISO week: the latest snapshot each teacher
-- made that week. A share, not a count, because the number of teachers who opened the app in a
-- given week varies.
CREATE OR REPLACE FUNCTION monitoring.hl_cefr_trend(range_start timestamptz, range_end timestamptz)
RETURNS TABLE (week timestamptz, school text, level text, share numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH weekly AS (
    SELECT DISTINCT ON (h.owner_id, date_trunc('week', h.snapshot_date))
      date_trunc('week', h.snapshot_date)::timestamptz AS week,
      coalesce(s.name, 'No school') AS school,
      h.cefr->'overall' AS overall
    FROM public.school_highlight_snapshots h
    JOIN public.profiles p ON p.id = h.owner_id
    LEFT JOIN public.schools s ON s.id = p.school_id
    WHERE h.snapshot_date BETWEEN range_start::date AND range_end::date
    ORDER BY h.owner_id, date_trunc('week', h.snapshot_date), h.snapshot_date DESC
  ),
  counts AS (
    SELECT w.week, w.school, e.key AS level, sum(e.value::bigint) AS n
    FROM weekly w, LATERAL jsonb_each_text(w.overall) e
    WHERE e.value ~ '^[0-9]+$'
    GROUP BY 1, 2, 3
  ),
  totals AS (
    SELECT week, school, sum(n) AS total FROM counts GROUP BY 1, 2
  )
  SELECT c.week, c.school, c.level, round(100.0 * c.n / t.total, 1)
  FROM counts c
  JOIN totals t USING (week, school)
  WHERE t.total >= monitoring.hl_min_cohort()
  ORDER BY 1, 2, 3
$$;

-- Average grammar score (0–100, the blend of test accuracy, flashcard mastery and rubric writing
-- evidence the app shows teachers) per grammar item, weighted by how many students have evidence.
CREATE OR REPLACE FUNCTION monitoring.hl_grammar_items(lang text DEFAULT 'en')
RETURNS TABLE (school text, item_id text, label text, category text, level text, students bigint, avg_score numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.school,
    g->>'id',
    max(CASE WHEN lang = 'nl' THEN coalesce(g->>'ln', g->>'l') ELSE g->>'l' END),
    max(CASE WHEN lang = 'nl' THEN coalesce(g->>'cn', g->>'c') ELSE g->>'c' END),
    max(g->>'lv'),
    sum((g->>'n')::bigint),
    round(sum((g->>'sum')::numeric) / nullif(sum((g->>'n')::numeric), 0), 1)
  FROM monitoring.hl_current_snapshots() c, LATERAL jsonb_array_elements(c.grammar) g
  WHERE g->>'id' IS NOT NULL AND g->>'n' ~ '^[0-9]+$' AND g->>'sum' ~ '^[0-9]+(\.[0-9]+)?$'
  GROUP BY 1, 2
  HAVING sum((g->>'n')::bigint) >= monitoring.hl_min_cohort()
$$;

-- Students the snapshots cover, per school — the "how many students does this screen speak for" line.
CREATE OR REPLACE FUNCTION monitoring.hl_student_coverage()
RETURNS TABLE (school text, students bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT school, sum(student_count)::bigint
  FROM monitoring.hl_current_snapshots()
  GROUP BY 1
  HAVING sum(student_count) >= monitoring.hl_min_cohort()
$$;

-- This week against last week (rolling 7 days), per school and metric. Read straight from the
-- domain tables like 092's app_daily_activity, so it needs no client snapshot.
CREATE OR REPLACE FUNCTION monitoring.hl_week_activity()
RETURNS TABLE (school text, metric text, this_week bigint, last_week bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH events (owner_id, metric, at, amount) AS (
    SELECT grader_id, 'grades', coalesce(data->>'gradedAt', data->>'updatedAt')::timestamptz, 1
      FROM public.student_rubrics
      WHERE NOT is_peer_review AND coalesce(data->>'gradedAt', data->>'updatedAt') IS NOT NULL
    UNION ALL
    SELECT a.owner_id, 'essays', es.submitted_at, 1
      FROM public.essay_submissions es
      JOIN public.essay_assignments a ON a.id = es.assignment_id
      WHERE es.submitted_at IS NOT NULL
    UNION ALL
    SELECT a.owner_id, 'words', es.submitted_at, es.word_count
      FROM public.essay_submissions es
      JOIN public.essay_assignments a ON a.id = es.assignment_id
      WHERE es.submitted_at IS NOT NULL
    UNION ALL
    SELECT owner_id, 'test_attempts', (data->>'startedAt')::timestamptz, 1
      FROM public.student_tests WHERE data->>'startedAt' IS NOT NULL
  )
  SELECT
    coalesce(s.name, 'No school'),
    e.metric,
    coalesce(sum(e.amount) FILTER (WHERE e.at >= now() - interval '7 days'), 0)::bigint,
    coalesce(sum(e.amount) FILTER (WHERE e.at >= now() - interval '14 days' AND e.at < now() - interval '7 days'), 0)::bigint
  FROM events e
  JOIN public.profiles p ON p.id = e.owner_id
  LEFT JOIN public.schools s ON s.id = p.school_id
  WHERE e.at >= now() - interval '14 days'
  GROUP BY 1, 2
$$;

REVOKE ALL ON FUNCTION monitoring.hl_min_cohort() FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_current_snapshots() FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_cefr_distribution(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_cefr_trend(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_grammar_items(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_student_coverage() FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_week_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION monitoring.hl_min_cohort() TO pg_monitor;
GRANT EXECUTE ON FUNCTION monitoring.hl_current_snapshots() TO pg_monitor;
GRANT EXECUTE ON FUNCTION monitoring.hl_cefr_distribution(text) TO pg_monitor;
GRANT EXECUTE ON FUNCTION monitoring.hl_cefr_trend(timestamptz, timestamptz) TO pg_monitor;
GRANT EXECUTE ON FUNCTION monitoring.hl_grammar_items(text) TO pg_monitor;
GRANT EXECUTE ON FUNCTION monitoring.hl_student_coverage() TO pg_monitor;
GRANT EXECUTE ON FUNCTION monitoring.hl_week_activity() TO pg_monitor;

-- ── 3. Registry ─────────────────────────────────────────────────────────────────
-- Nightly backups and "Delete all my database data" read owner_data_tables(); redefined from its
-- latest version (105) with the new table added. The snapshot has no student column, so
-- student_data_tables() (erase one student) needs nothing: the figures are counts that cannot be
-- traced to a child, and the next push drops an erased student from them anyway.

CREATE OR REPLACE FUNCTION public.owner_data_tables()
RETURNS TABLE (key text, table_name text, owner_filter text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  VALUES
    ('rubrics',                   'rubrics',                   'owner_id = $1'),
    ('folders',                   'folders',                   'owner_id = $1'),
    ('rubric_versions',           'rubric_versions',           'owner_id = $1'),
    ('rubric_shares',             'rubric_shares',             'rubric_id IN (SELECT id FROM public.rubrics WHERE owner_id = $1)'),
    ('classes',                   'classes',                   'owner_id = $1'),
    ('class_members',             'class_members',             'class_id IN (SELECT id FROM public.classes WHERE owner_id = $1)'),
    ('students',                  'students',                  'owner_id = $1'),
    ('student_rubrics',           'student_rubrics',           'grader_id = $1 AND is_peer_review = false'),
    ('peer_reviews',              'student_rubrics',           'grader_id = $1 AND is_peer_review = true'),
    ('attachments',               'attachments',               'owner_id = $1'),
    ('grade_scales',              'grade_scales',               'owner_id = $1'),
    ('comment_snippets',          'comment_snippets',          'owner_id = $1'),
    ('comment_bank',              'comment_bank',              'owner_id = $1'),
    ('export_templates',          'export_templates',          'owner_id = $1'),
    ('favorite_standards',        'favorite_standards',        'owner_id = $1'),
    ('standard_mastery_targets',  'standard_mastery_targets',  'owner_id = $1'),
    ('self_assessments',          'self_assessments',          'owner_id = $1'),
    ('speaking_sessions',         'speaking_sessions',         'owner_id = $1'),
    ('recording_metadata',        'recording_metadata',        'owner_id = $1'),
    ('scan_metadata',             'scan_metadata',             'owner_id = $1'),
    ('analysis_results',          'analysis_results',          'owner_id = $1'),
    ('tests',                     'tests',                     'owner_id = $1'),
    ('test_assignments',          'test_assignments',          'owner_id = $1'),
    ('student_tests',             'student_tests',             'owner_id = $1'),
    ('placement_sessions',        'placement_sessions',        'owner_id = $1'),
    ('essay_templates',           'essay_templates',           'owner_id = $1'),
    ('essay_assignments',         'essay_assignments',         'owner_id = $1'),
    ('essay_submissions',         'essay_submissions',         'assignment_id IN (SELECT id FROM public.essay_assignments WHERE owner_id = $1)'),
    ('essay_batch_assignments',   'essay_batch_assignments',   'owner_id = $1'),
    ('essay_offline_submissions', 'essay_offline_submissions', 'owner_id = $1'),
    ('grading_tasks',             'grading_tasks',             'owner_id = $1'),
    ('user_templates',            'user_templates',            'owner_id = $1'),
    ('user_settings',             'user_settings',             'user_id = $1'),
    ('flashcard_decks',           'flashcard_decks',           'owner_id = $1'),
    ('flashcard_assignments',     'flashcard_assignments',     'owner_id = $1'),
    ('flashcard_reviews',         'flashcard_reviews',         'owner_id = $1'),
    ('news_flashes',              'news_flashes',              'owner_id = $1'),
    ('news_flash_reads',          'news_flash_reads',          'owner_id = $1'),
    ('messages',                  'messages',                  'owner_id = $1'),
    ('question_bank_items',       'question_bank_items',       'owner_id = $1'),
    ('document_comments',         'document_comments',         'owner_id = $1'),
    ('notification_dismissals',   'notification_dismissals',   'owner_id = $1'),
    ('comparative_matchups',      'comparative_matchups',      'owner_id = $1'),
    ('marketplace_listings',      'marketplace_listings',      'published_by = $1'),
    ('marketplace_upvotes',       'marketplace_upvotes',       'profile_id = $1'),
    ('live_draft_snapshots',      'live_draft_snapshots',      'owner_id = $1'),
    ('live_writing_peer_pairs',   'live_writing_peer_pairs',   'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $1)'),
    ('live_writing_round_log',    'live_writing_round_log',    'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $1)'),
    ('live_writing_votes',        'live_writing_votes',        'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $1)'),
    ('live_writing_responses',    'live_writing_responses',    'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $1)'),
    ('live_writing_participants', 'live_writing_participants', 'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $1)'),
    ('live_writing_sessions',     'live_writing_sessions',     'owner_id = $1'),
    ('school_highlight_snapshots','school_highlight_snapshots','owner_id = $1')
$$;
