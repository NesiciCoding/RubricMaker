# Performance audit — November 2026

Scope: application-layer performance across the whole stack — client bundle/build, React
rendering, the storage/sync layer, Supabase/Postgres, CPU-heavy compute paths (export, OCR,
aggregation), and CI/build pipeline time. This complements `docs/STACK_AUDIT_2026-10.md`
(infra/ops/deployment) rather than overlapping it — nothing here repeats that audit's findings.

Method: six focused, read-only passes over the codebase (no code changed by this audit), each
citing exact files/lines. `npm run build:analyze` (wired to `rollup-plugin-visualizer` already)
could not be run here — `node_modules` isn't installed in this environment — so bundle-size
claims below are static-analysis estimates, not measured chunk sizes; that's called out as the
first recommended follow-up.

Each finding below has a tracking issue (linked) with a fix plan. Severity is about user/operator
impact if left unfixed, not difficulty to fix.

**Status as of this audit's own fix PR (#1117, applied against commit `eaeba34`, the audit's
original revision):** #13/#1105 (`fetchAttachments` pagination), #16+#17/#1106+#1111 (the two
co-teaching RLS indexes), #12/#1109, #20/#1108, #21/#1112, and the #1115 quick-wins bundle are
implemented in the repository. The SQL migration for #16/#17 still needs to be **deployed** to
every environment's Postgres before those two actually stop costing anything in production — being
in the repo isn't the same as being applied. Everything else below is accurate as written. See the
`## Tracking` table for the full up-to-date status per issue.

## Top 5 worst offenders

| #   | Area                    | Issue                                                                                                                                                                                                                                                                                                          | Why it's worst                                                                                                                                          |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Supabase/RLS            | `test_in_coteaching()` does an unindexed full scan of `student_tests` per row of `tests`                                                                                                                                                                                                                       | Scales as O(tests × student_tests); gets worse every day the schools using co-teaching grow, and is invisible until a school hits it                    |
| 2   | Supabase/data integrity | `fetchAttachments` has no pagination                                                                                                                                                                                                                                                                           | Schools with >1000 attachment rows **silently lose rows** past PostgREST's cap on every hydrate — this is a data-loss bug wearing a performance costume |
| 3   | Aggregation             | `CefrOverviewPage`, `StudentLearningPathPage`, `calibrationCohorts.ts`, and the Dashboard `StudentSnapshotTable` all call per-student aggregators with the **full, unsliced** district-wide collections, instead of pre-grouping into `Map<studentId, T[]>` once (the pattern `StudentsPage.tsx` already uses) | O(students × total-records); these are exactly the "whole school at a glance" pages that get used most and will be the first ones to feel slow          |
| 4   | Export                  | Batch DOCX/PDF export builds the entire document tree synchronously on the main thread, no worker, no yielding                                                                                                                                                                                                 | A 30-student × 10-criteria batch export freezes the UI tab for the whole build                                                                          |
| 5   | CI pipeline             | `npm ci` runs fresh in ~9 separate jobs with no shared cache; 6 independent steps in the `ci` job run serially instead of in parallel jobs                                                                                                                                                                     | Direct, compounding cost on every single push and PR — the only item here that costs money/time today regardless of any school's data size              |

## Findings by layer

Severity: 🔴 high · 🟡 medium · 🟢 low/minor.

### A. Bundle & build

1. 🟡 **`src/data/cefrLevels.ts` — 1.57 MB / 64,185 lines**, a hand/generated `Map` literal.
   Pulled in (transitively via `grammarStandards.ts`, `academicWordList.ts`,
   `cefrVocabularyProfiler.ts`, `wordFormation.ts`, `clozeGenerators.ts`,
   `distractorSuggestions.ts`) by `QuestionEditor.tsx`, `DocumentAnalysisPanel.tsx`,
   `TextScreeningPanel.tsx`, `OpenAnswerInsightsPanel.tsx`. All of those sit behind
   already-`lazy()` routes, so it's _not_ in the main bundle — but whichever chunk(s) it lands in
   still pay ~1.5 MB of JS-literal construction at import time (test-builder / essay-analysis
   cold start).
   **Fix:** ship it as a static JSON asset loaded via dynamic `import('./cefrLevels.json', { with: { type: 'json' } })`, or split by CEFR level so a panel only loads the levels it needs.

2. 🟢 **No `manualChunks` vendor-splitting strategy** in `vite.config.ts` — chunking relies
   entirely on Rollup's automatic splitting at `lazy()` boundaries. With `recharts` shared across
   ~10 chart components and `@tiptap/*` shared across Essay and Test-builder editors, there's a
   real risk of either duplicated vendor code across chunks or cache-unfriendly bundling.
   **Fix:** run `npm run build:analyze` first to confirm with real numbers; if duplication shows up, add explicit `manualChunks` for recharts/tiptap/pdfjs/tesseract.js/docx/mammoth.

3. ✅ **Already well-optimized, noted so it isn't re-flagged later:** i18n lazy-loads non-English
   locales per-language and excludes them from PWA precache; `@supabase/supabase-js` (~450 KB) is
   behind `loadDb()`/`getDb()`; `react-joyride` (~800 KB) is lazy; `stats.html` and the pdf.js
   worker are precache-excluded.

### B. React rendering

4. 🔴 **`StudentSnapshotTable.tsx:109-142`** — for every student on the dashboard, calls
   `getCefrStudentOverview`, `getCriterionInterventionFlags`, `getCefrSkillInterventionFlags`,
   and `getStudentGrammarMasteryScore`, each of which rebuilds `rubricById`/`testById` lookup
   Maps from the _entire_ `rubrics`/`tests` arrays and `.filter()`s the full `studentRubrics`/
   `assignments`/`reviews` collections per student (`cefrStudentAggregator.ts:329,332-333`,
   `masteryProfileAggregator.ts:109-110`). Wrapped in `useMemo`, but the deps are the raw
   collections, so one grade edit anywhere invalidates the memo and recomputes for every student.
   **Fix:** build the lookup Maps once outside the per-student loop; reuse the `derivedByStudent` per-student caching pattern `StudentsPage.tsx` already has.

5. 🔴 **Same root cause in `CefrOverviewPage.tsx:85`, `StudentLearningPathPage.tsx:84`, and
   `calibrationCohorts.ts:147`** — each maps over every student in a class/cohort and passes the
   full unfiltered `studentRubrics`/`studentTests`/`selfAssessments`/`analysisResults` into
   `getCefrStudentOverview` (`cefrStudentAggregator.ts:308-800`), which internally re-filters the
   whole array per student (lines 329, 495-497, 620, 651). A school-wide CEFR grid rescans the
   entire district's grade history once per student shown.
   **Fix:** group each collection into `Map<studentId, T[]>` once outside the loop, pass each student's slice in — same fix as #4, same pattern already proven in `StudentsPage.tsx`.

6. 🟡 **`GradeStudent.tsx:901-903`** — `attachments.filter(...)` (×2) and
   `analysisResults.find(...)` run as plain statements in the render body, not `useMemo`,
   scanning the full app-wide arrays. `GradeStudent` re-renders on every keystroke in a comment
   box, so these re-run on every keystroke.
   **Fix:** wrap in `useMemo([attachments, rubricId, studentId])`.

7. 🟡 **`globalSearch.ts:142` (`searchAll`)** has no persistent index — every call re-normalizes
   (lowercase + NFD + regex strip) every field of every rubric/test/student/class/essay/deck on
   every keystroke; the compound student+rubric shortcut (lines 190-221) is an explicit
   O(students × rubrics) nested loop. `GlobalSearch.tsx:53-67` defers it with `useDeferredValue`
   (lower React priority) but doesn't avoid the rescan.
   **Fix:** build a normalized token index once per data-collection change, query that index instead of re-normalizing every keystroke.

8. 🟡 **`ComparativeGrading.tsx:280-303`** — `tierKey` does `studentRubrics.find(...)` over the
   full collection, called twice per matchup inside a `matchups.filter()` → O(matchups ×
   studentRubrics).
   **Fix:** index `studentRubrics` by `(rubricId, studentId)` once before the filter.

9. 🟢 **`useStoreSelector`/`selectorStore.notify()` (`AppContext.tsx:585-589`,
   `useStore.tsx:69-84`)** is well-built (`useSyncExternalStore` + shallow-equality cache,
   genuinely selective re-renders) — but `notify()` fires **every** registered selector on
   **every** dispatch regardless of domain. Shallow-equal stops the re-render, not the recompute,
   so any non-trivial selector pays CPU on unrelated actions app-wide.
   **Fix:** tag actions with the domain(s) touched and skip notifying selectors outside it, or keep selectors cheap by convention (document the constraint).

10. 🟢 **No list virtualization anywhere** — no `react-window`/`react-virtual` in `package.json`.
    `StudentsPage.tsx:1156`, `RubricList.tsx`, `TestListPage.tsx` render every row unconditionally.
    Fine today; will not scale past a few hundred rows.
    **Fix:** virtualize once roster/rubric-list sizes grow — not urgent, track as a trigger-based follow-up rather than doing it now.

11. 🟢 **`StatisticsPage.tsx:1260`** — `classTestAverages.map(...)` is inlined directly in the
    `<BarChart data={...}>` prop, creating a new array literal every render even though the
    source is memoized, defeating Recharts' change-detection.
    **Fix:** move the `.map` into its own `useMemo`.

### C. Storage / sync layer

Good news first: the layer mostly follows CLAUDE.md's storage rule correctly — every full-array
`localStorage` write is gated behind `isOffline()`, the per-dispatch diff short-circuits untouched
collections in O(1), and `mergeCollection`/`dedupeStudentRubrics` are genuinely O(n) (Map-based),
not the O(n²) the audit went in suspecting. Real findings:

12. 🔴 **No batched upsert/delete for any entity except `studentRubric`**
    (`StorageSync.ts:1437-1468` only special-cases `studentRubric`; every other entity falls
    through to the sequential loop at `StorageSync.ts:1431-1434`). `SupabaseAdapter.ts`'s only
    batch-capable methods are `upsertStudentRubrics`/`deleteStudentRubrics` (lines 832, 847) —
    everything else (students, classes, attachments, rubrics, flashcard decks/assignments, essay
    assignments) is single-row. A bulk edit/assign of N students or decks in one dispatch means
    N sequential network round-trips.
    **Fix:** add `upsertMany`/`deleteMany` adapter methods per entity (mirror the `studentRubric` pattern) and register them in `tryBatchUpsert`/`tryBatchDelete`.

13. 🔴 **`fetchAttachments` is unpaginated** (`SupabaseAdapter.ts:883-887`) — `.select('data,
storage_path')` with no `.range()`, called on every hydrate. Unlike `fetchStudentRubrics`/
    `fetchPeerReviews` (lines 804-809, 855-859), which explicitly route through the `fetchPaged`
    helper "so the heaviest tables aren't silently capped at PostgREST's default 1000-row limit,"
    attachments has no such protection. This is the top-5 item above — a correctness bug, not just slowness.
    **Fix:** route `fetchAttachments` through the existing `fetchPaged` helper, same as the other large collections.

14. 🟢 **Quota-exceeded retry path re-stringifies the full collection repeatedly**
    (`storage.ts:1246-1268, 1291-1322`) — on `QuotaExceededError`, retries with a second full
    `JSON.stringify`, then a binary search that calls `JSON.stringify` + `setItem` up to log2(n)
    more times. Only reached offline or when IndexedDB is unavailable — an edge case, not a hot
    path.
    **Fix:** estimate byte length before re-serializing instead of re-stringifying on each probe — low priority.

15. 🟢 **`syncDiff.ts:30`** falls back to `JSON.stringify(prevItem) !== JSON.stringify(item)` per
    item once a collection's top-level reference changes, duplicating work `StorageSync` will
    redo when it serializes the push body. Bounded (not O(n²)), low priority.
    **Fix:** skip the stringify comparison when the reducer already guarantees reference identity for untouched items; revisit only if profiling shows it matters.

### D. Supabase / Postgres

16. 🔴 **`96_coteacher_grading.sql`, `test_in_coteaching()` (lines 93-111)**, used by the
    `tests_coteaching_select` RLS policy — for every row scanned on `tests` by a non-owner, runs
    `EXISTS (SELECT 1 FROM student_tests st WHERE st.data->>'testId' = p_test_id AND
st.owner_id = p_owner ...)`. `student_tests` has **no index** on `data->>'testId'` (only
    `owner_id`, `student_user_id`, and a partial unique index on `assignment_id`) — a full
    sequential scan of `student_tests` per row of `tests`. This is the top-1 item above.
    **Fix:** `CREATE INDEX ON student_tests ((data->>'testId'))`, or better, promote `test_id`/`student_id` to real columns the way `student_rubrics` already does.

17. 🟡 **Same migration, `rubric_in_coteaching()` (lines 66-91)**, used by
    `rubrics_coteaching_select` — checks `c.data->'rubricIds' ? p_rubric_id` (jsonb containment)
    on `classes.data` with no GIN index, plus three chained levels of per-row correlated
    subqueries (`student_rubrics` ⋈ `students` ⋈ `class_members`) through `SECURITY DEFINER`
    functions. Lower risk than #16 since scoped by indexed `owner_id` first, but the same
    per-row-cost-multiplier pattern, and it gets worse with every class a co-teaching school adds.
    **Fix:** `CREATE INDEX ON classes USING gin ((data->'rubricIds'))`, or denormalize `rubricIds` into a join table.

18. 🟢 **`supabase/functions/scheduled-digest/index.ts:64-99`** — for every opted-in teacher,
    loops and calls up to 3 RPCs (`get_pending_moderation_count`, `get_overdue_grading_count`,
    `get_unread_messages_count`) sequentially — up to 3×N round trips. Low severity: nightly cron,
    not user-facing.
    **Fix:** rewrite the RPCs to accept an array of owner ids and return per-owner counts in one call each.

19. ✅ **No other issue found.** `006_missing_indexes.sql` and `026_security_performance_hardening.sql`
    already fixed the obvious gaps (FK indexes on `rubric_shares`, `class_members`,
    `analysis_results`, `self_assessments`, `speaking_sessions`; `auth.uid()` wrapped in
    `(SELECT auth.uid())` everywhere to avoid per-row re-evaluation). `flashcard_*`/`essay_*`
    tables ship composite indexes at creation time. No unfiltered `.select('*')` or missing
    `.limit()`/`.range()` elsewhere in edge functions; the backup/digest profile-listing loops
    already page at 1000/page.

### E. Heavy compute paths (export, OCR, calibration)

20. 🔴 **Batch DOCX/PDF export is synchronous and single-threaded**
    (`docxExport.ts:527` `exportBatchDocx`, `:866` `exportBatchTestSummaryDocx`,
    `docxTemplateExport.ts:185`, `pdfExport.ts:581` `exportBatchPdf`) — builds the entire
    `docx`/HTML document tree (nested paragraphs/tables/runs per student × per criterion) fully
    synchronously before the one `await Packer.toBlob(doc)` call, run directly from a click
    handler with zero event-loop yields. A 30-student × 10-criteria class export freezes the tab.
    **Fix:** chunk the batch loop with `await` yields every N students (`setTimeout(0)`/`requestIdleCallback`), or move tree construction + `Packer.toBlob` into a Web Worker.

21. 🟡 **Tesseract OCR worker re-created per image** (`textExtraction.ts:146-197`
    `recognizeImage`) — `createWorker()` then `worker.terminate()` in `finally`, every single
    call, never pooled. Worker mode does run off-main-thread (good), but no caller
    (`ExamScanBatchModal.tsx`, `ScanCaptureModal.tsx`) batches multiple images through one worker
    — a multi-page scan pays full engine-init + language-data-load cost per page.
    **Fix:** create one worker lazily per batch/session, reuse it across `recognizeImage` calls, terminate only when the batch ends.

22. 🟢 **Deep-clone anti-pattern** — `JSON.parse(JSON.stringify(...))` at `GradeStudent.tsx:471-472,
525-526, 579-580` and `ComparativeGrading.tsx:440,444`, cloning `rubric`/`scale` on every
    grade save. Not in a per-dispatch hot path (only fires on explicit save), but an avoidable
    round-trip of a potentially large rubric tree.
    **Fix:** `structuredClone(rubric)` — faster, no string round-trip, handles `Date`s correctly.

### F. CI / build pipeline

23. 🟡 **`ci` job (`.github/workflows/ci.yml:47-125`)** runs 6 largely-independent steps serially
    in one job: `typecheck` → `typecheck:edge-shared` (fresh `npx deno@2.9.6` download) → `lint`
    → `format:check` → nginx config validation (2× `docker run`) → `coverage`. None of the first 5
    depend on each other.
    **Fix:** split into parallel jobs (typecheck / lint+format / deno-check / nginx-check), accepting the small per-job `npm ci` cost, so wall-clock drops toward the slowest single step (coverage) instead of the sum.

24. 🟡 **`npm ci` runs fresh in ~9 jobs** (`ci`, both `e2e` shards, `e2e-merge-reports`,
    `e2e-supabase`, `e2e-a11y`, `bundle`, `deploy-pages`, `deploy-hestiacp`) with no shared
    `node_modules` cache beyond npm's own package cache — the single biggest aggregate
    minute-cost in the pipeline even at ~30-60s per hit.
    **Fix:** cache built `node_modules` via `actions/cache` keyed on the lockfile hash, or a single install job whose artifact downstream jobs reuse.

25. 🟢 **E2E sharding is coarse** — only 2 shards cover 5 projects (chromium, firefox, webkit,
    chromium-fake-media, mobile-chrome) against 59 spec files, up to 5× duplication of most specs
    split only 2 ways, risking unbalanced shards.
    **Fix:** increase shard count (e.g. 4) and/or split explicitly by project so slow projects (webkit) don't land in the same bucket as fast ones.

26. 🟢 **`e2e:supabase` forces `--workers=1`** (`package.json:27`) despite `fullyParallel: true`
    globally and a 35-min job budget — ~14 specs run fully serialized. Plausibly intentional
    (shared local Supabase stack state) — flagged as a cost center, not necessarily a bug.
    **Fix:** investigate whether the local Supabase stack can support ≥2 parallel workers (separate schemas/projects per worker); if not, leave as-is and close this item.

27. 🟢 **a11y gate re-crawls every route in its own job** (`playwright.config.ts:119-128`,
    `ci.yml:425-465`) — not literally duplicated assertions, but re-navigates the same route set
    functional specs already visit.
    **Fix:** only worth folding into functional specs if axe overhead per route proves non-trivial — measure before changing.

## Action plan

**Do first (data-loss / unbounded-growth risk, small fix):**

- #13 `fetchAttachments` pagination (data loss, not just slowness) — ✅ implemented (#1117)
- #16 `student_tests` expression index (unbounded RLS cost) — ✅ migration written (#1117); **still needs deployment** to take effect

**Quick wins (small diff, clear win, no architecture change):**

- #6 memoize `GradeStudent.tsx` attachment/analysis filters
- #11 `StatisticsPage.tsx` memoize chart data array
- #22 `structuredClone` instead of JSON round-trip
- #24 cache `node_modules` in CI

**Near-term (real but contained refactor):**

- #4 / #5 pre-group collections into per-student Maps before calling the aggregators (one fix pattern, four call sites: `StudentSnapshotTable`, `CefrOverviewPage`, `StudentLearningPathPage`, `calibrationCohorts`)
- #12 batched upsert/delete for entities beyond `studentRubric`
- #17 GIN index for `classes.data->'rubricIds'`
- #23 split the serial `ci` job into parallel jobs

**Needs design before building (bigger change or needs measurement first):**

- #20 worker/chunking strategy for batch export
- #21 OCR worker pooling
- #2 vendor chunk splitting — measure with `build:analyze` first
- #1 `cefrLevels.ts` → JSON asset split
- #7 `globalSearch` persistent index
- #25/#26/#27 — e2e sharding/worker strategy changes

**Tracked but not urgent:** #9 (selector notify fan-out), #10 (virtualization), #14/#15 (storage edge cases), #18 (digest N+1) — all filed together in [#1116](https://github.com/NesiciCoding/RubricMaker/issues/1116). #19 is a non-finding.

## Tracking

| Issue                                                            | Finding(s)                                                                                 | Severity |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| [#1105](https://github.com/NesiciCoding/RubricMaker/issues/1105) | #13 — attachments fetch unpaginated (data-loss risk)                                       | 🔴       |
| [#1106](https://github.com/NesiciCoding/RubricMaker/issues/1106) | #16 — `test_in_coteaching()` unindexed scan                                                | 🔴       |
| [#1107](https://github.com/NesiciCoding/RubricMaker/issues/1107) | #4, #5 — per-student aggregators rescan full collections                                   | 🔴       |
| [#1108](https://github.com/NesiciCoding/RubricMaker/issues/1108) | #20 — batch DOCX/PDF export blocks main thread                                             | 🔴       |
| [#1109](https://github.com/NesiciCoding/RubricMaker/issues/1109) | #12 — no batched upsert/delete beyond `studentRubric`                                      | 🔴       |
| [#1110](https://github.com/NesiciCoding/RubricMaker/issues/1110) | #23, #24 — serial CI job + no `node_modules` cache                                         | 🟡       |
| [#1111](https://github.com/NesiciCoding/RubricMaker/issues/1111) | #17 — `rubric_in_coteaching()` jsonb containment, no GIN index                             | 🟡       |
| [#1112](https://github.com/NesiciCoding/RubricMaker/issues/1112) | #21 — Tesseract OCR worker re-created per image                                            | 🟡       |
| [#1113](https://github.com/NesiciCoding/RubricMaker/issues/1113) | #7 — `globalSearch` re-normalizes full corpus per keystroke                                | 🟡       |
| [#1114](https://github.com/NesiciCoding/RubricMaker/issues/1114) | #1, #2 — `cefrLevels.ts` size + vendor chunk splitting                                     | 🟡       |
| [#1115](https://github.com/NesiciCoding/RubricMaker/issues/1115) | #6, #8, #11, #22 — quick-wins bundle                                                       | 🟡/🟢    |
| [#1116](https://github.com/NesiciCoding/RubricMaker/issues/1116) | #9, #10, #14, #15, #18, #25, #26, #27 — low-priority backlog, one checklist entry per item | 🟢       |

#3 and #19 are non-findings (already well-optimized, recorded so they aren't re-flagged later) and
have no issue.
