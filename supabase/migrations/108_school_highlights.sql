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
-- Small-group suppression lives in the read functions, not the client: any figure (a CEFR level, a
-- grammar item, a school's weekly activity) with fewer than monitoring.hl_min_cohort() students
-- behind it is not returned, so a screen can never show a figure that points at a handful of
-- identifiable children.

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
    AND (cefr->'overall' IS NULL OR jsonb_typeof(cefr->'overall') = 'object')
    AND (cefr->'skills' IS NULL OR jsonb_typeof(cefr->'skills') = 'object')
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
-- REST API does not expose, executable by pg_monitor only. Only the five reporting functions are
-- granted; the helpers below return unsuppressed per-teacher data and stay owner-only, so a
-- pg_monitor login can never read a small group's figures directly.
--
-- Suppression: every figure a function returns has at least monitoring.hl_min_cohort() students
-- behind it. CEFR levels, grammar items and weekly activity are all held to it, and schools are
-- grouped by id (two schools sharing a name are never merged; a duplicate name gets a short id
-- suffix as its label).

CREATE SCHEMA IF NOT EXISTS monitoring;
REVOKE ALL ON SCHEMA monitoring FROM PUBLIC;
GRANT USAGE ON SCHEMA monitoring TO pg_monitor;

CREATE OR REPLACE FUNCTION monitoring.hl_min_cohort()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 5 $$;

-- A non-object (a malformed snapshot) reads as empty instead of failing jsonb_each_text for everyone.
CREATE OR REPLACE FUNCTION monitoring.hl_object(j jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$ SELECT CASE WHEN jsonb_typeof(j) = 'object' THEN j ELSE '{}'::jsonb END $$;

-- Teacher -> school, labelled by name; a duplicate name (or a school literally called "No school")
-- gets the first 8 characters of its id appended so labels stay unique.
CREATE OR REPLACE FUNCTION monitoring.hl_owner_schools()
RETURNS TABLE (owner_id uuid, school_id uuid, school text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH labels AS (
    SELECT id AS school_id, name FROM public.schools
    UNION ALL
    SELECT NULL::uuid, 'No school'
  ),
  named AS (
    SELECT
      school_id,
      CASE WHEN count(*) OVER (PARTITION BY name) > 1
           THEN name || ' (' || coalesce(left(school_id::text, 8), 'none') || ')'
           ELSE name END AS school
    FROM labels
  )
  SELECT p.id, p.school_id, n.school
  FROM public.profiles p
  JOIN named n ON n.school_id IS NOT DISTINCT FROM p.school_id
$$;

-- Each teacher's newest snapshot from the last 60 days (a teacher who stopped syncing drops out),
-- attributed to the school on their profile. Unsuppressed: internal to the functions below.
CREATE OR REPLACE FUNCTION monitoring.hl_current_snapshots()
RETURNS TABLE (school_id uuid, school text, student_count integer, cefr jsonb, grammar jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT os.school_id, os.school, n.student_count, n.cefr, n.grammar
  FROM (
    SELECT DISTINCT ON (owner_id) owner_id, student_count, cefr, grammar
    FROM public.school_highlight_snapshots
    WHERE snapshot_date >= current_date - 60
    ORDER BY owner_id, snapshot_date DESC
  ) n
  JOIN monitoring.hl_owner_schools() os ON os.owner_id = n.owner_id
$$;

-- Students per CEFR level for 'overall' or one skill ('reading', 'writing', …), per school. A level
-- with fewer than the minimum cohort of students is left out, not shown as a small number.
CREATE OR REPLACE FUNCTION monitoring.hl_cefr_distribution(skill text DEFAULT 'overall')
RETURNS TABLE (school text, level text, students bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.school, e.key, sum(e.value::bigint)
  FROM monitoring.hl_current_snapshots() c,
       LATERAL jsonb_each_text(
         monitoring.hl_object(
           CASE WHEN skill = 'overall' THEN c.cefr->'overall' ELSE c.cefr->'skills'->skill END
         )
       ) e
  WHERE e.value ~ '^[0-9]{1,9}$'
  GROUP BY c.school_id, c.school, e.key
  HAVING sum(e.value::bigint) >= monitoring.hl_min_cohort()
$$;

-- Share of students per overall level, one point per ISO week: the latest snapshot each teacher
-- made that week. A share, not a count, because the number of teachers who opened the app in a
-- given week varies. A level under the minimum cohort that week is left out.
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
      os.school_id,
      os.school,
      h.cefr->'overall' AS overall
    FROM public.school_highlight_snapshots h
    JOIN monitoring.hl_owner_schools() os ON os.owner_id = h.owner_id
    WHERE h.snapshot_date BETWEEN range_start::date AND range_end::date
    ORDER BY h.owner_id, date_trunc('week', h.snapshot_date), h.snapshot_date DESC
  ),
  counts AS (
    SELECT w.week, w.school_id, w.school, e.key AS level, sum(e.value::bigint) AS n
    FROM weekly w, LATERAL jsonb_each_text(monitoring.hl_object(w.overall)) e
    WHERE e.value ~ '^[0-9]{1,9}$'
    GROUP BY w.week, w.school_id, w.school, e.key
  ),
  totals AS (
    SELECT week, school_id, sum(n) AS total FROM counts GROUP BY week, school_id
  )
  SELECT c.week, c.school, c.level, round(100.0 * c.n / t.total, 1)
  FROM counts c
  JOIN totals t ON t.week = c.week AND t.school_id IS NOT DISTINCT FROM c.school_id
  WHERE c.n >= monitoring.hl_min_cohort()
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
  WHERE g->>'id' IS NOT NULL
    AND g->>'n' ~ '^[0-9]{1,9}$'
    AND g->>'sum' ~ '^[0-9]{1,9}(\.[0-9]+)?$'
  GROUP BY c.school_id, c.school, g->>'id'
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
  GROUP BY school_id, school
  HAVING sum(student_count) >= monitoring.hl_min_cohort()
$$;

-- This week against last week (rolling 7 days), per school and metric. Read straight from the
-- domain tables like 092's app_daily_activity, but only for schools whose snapshots cover at least
-- the minimum cohort of students. Timestamps that do not parse are skipped (public.try_timestamptz,
-- 078) rather than failing the query; the string comparison is a cheap pre-filter for ISO dates.
CREATE OR REPLACE FUNCTION monitoring.hl_week_activity()
RETURNS TABLE (school text, metric text, this_week bigint, last_week bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH events (owner_id, metric, at, amount) AS (
    SELECT grader_id, 'grades', public.try_timestamptz(coalesce(data->>'gradedAt', data->>'updatedAt')), 1
      FROM public.student_rubrics
      WHERE NOT is_peer_review
        AND coalesce(data->>'gradedAt', data->>'updatedAt') >= to_char(now() - interval '15 days', 'YYYY-MM-DD') COLLATE "C"
    UNION ALL
    SELECT a.owner_id, 'essays', es.submitted_at, 1
      FROM public.essay_submissions es
      JOIN public.essay_assignments a ON a.id = es.assignment_id
      WHERE es.submitted_at >= now() - interval '15 days'
    UNION ALL
    SELECT a.owner_id, 'words', es.submitted_at, es.word_count
      FROM public.essay_submissions es
      JOIN public.essay_assignments a ON a.id = es.assignment_id
      WHERE es.submitted_at >= now() - interval '15 days'
    UNION ALL
    SELECT owner_id, 'test_attempts', public.try_timestamptz(data->>'startedAt'), 1
      FROM public.student_tests
      WHERE data->>'startedAt' >= to_char(now() - interval '15 days', 'YYYY-MM-DD') COLLATE "C"
  ),
  covered AS (
    SELECT school_id
    FROM monitoring.hl_current_snapshots()
    GROUP BY school_id
    HAVING sum(student_count) >= monitoring.hl_min_cohort()
  )
  SELECT
    os.school,
    e.metric,
    coalesce(sum(e.amount) FILTER (WHERE e.at >= now() - interval '7 days'), 0)::bigint,
    coalesce(sum(e.amount) FILTER (WHERE e.at >= now() - interval '14 days' AND e.at < now() - interval '7 days'), 0)::bigint
  FROM events e
  JOIN monitoring.hl_owner_schools() os ON os.owner_id = e.owner_id
  JOIN covered cv ON cv.school_id IS NOT DISTINCT FROM os.school_id
  WHERE e.at >= now() - interval '14 days'
  GROUP BY os.school_id, os.school, e.metric
$$;

REVOKE ALL ON FUNCTION monitoring.hl_min_cohort() FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_object(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_owner_schools() FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_current_snapshots() FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_cefr_distribution(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_cefr_trend(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_grammar_items(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_student_coverage() FROM PUBLIC;
REVOKE ALL ON FUNCTION monitoring.hl_week_activity() FROM PUBLIC;
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
