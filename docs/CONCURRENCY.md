# Concurrency & lost-update inventory

This document inventories every place the app performs a **read-modify-write on a
shared JSON/JSONB document** (or another shared aggregate) and records the
concurrency strategy chosen for each, so a later change can't silently
reintroduce a lost-update race. It is the standing answer to issue #336.

A "lost update" happens when two requests each read the same prior snapshot,
mutate an in-memory copy, and write the whole snapshot back — the later write
wins and silently discards the earlier one's independent changes. The fix is one
of three strategies:

- **Atomic** — the read and the rewrite happen inside a single database
  statement, so the row lock serializes concurrent callers and each computes its
  change from the other's committed result.
- **CAS** (compare-and-swap / optimistic concurrency) — the write is conditional
  on the snapshot still matching what was read; the loser is rejected and retries
  or reports a conflict.
- **Intentional last-write-wins (LWW)** — losing a concurrent change is
  acceptable for this field, documented here with the reason.

## Inventory

| Flow                                                                            | Shared document                                                   | Strategy                                                                                              | Where                                                                                                                                            |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `submit-test` Elo self-calibration                                              | `tests.data.questions[*].eloRating`                               | **Atomic**                                                                                            | `update_test_question_elo()` RPC — `supabase/migrations/064_atomic_test_question_elo.sql`, called from `supabase/functions/submit-test/index.ts` |
| `next-placement-question` run state                                             | `placement_sessions` (level trace, pending question, asked items) | **CAS**                                                                                               | `casUpdate()` guards on `pending->>questionId` — `supabase/functions/next-placement-question/index.ts`                                           |
| `next-placement-question` item Elo write-back                                   | `question_bank_items.data.…eloRating`                             | **Intentional LWW** (per small row, gated behind the CAS landing)                                     | `applyEloWriteBack()` — same file                                                                                                                |
| `next-placement-question` rate-limit counter                                    | `placement_sessions.rate_window_*`                                | **Intentional LWW** (best-effort counter)                                                             | same file                                                                                                                                        |
| Client entity sync (rubrics, grades, tests, classes, students, comment bank, …) | each entity's row / `data` blob                                   | **Intentional LWW by `updatedAt`**, with in-flight pending-queue edits protected from a stale hydrate | `src/utils/syncMerge.ts` (`mergeCollection` / `mergeStoreData`), driven by `StorageSync`                                                         |

### Details & rationale

**`submit-test` Elo (atomic).** This was the originally reported case. The
function used to read the whole `tests.data` JSONB blob, mutate the `eloRating` of
each question the staircase `levelPath` touched, and write the whole blob back —
a classic read-modify-write race. A whole class taking one placement test in a
single sitting (the roadmap 25.4 use case) could have the second submission's
write silently discard the first's rating changes. The RPC now does the
read-and-rewrite of the `questions` array inside a single `UPDATE` guarded by the
`tests` row lock, and — critically — computes the _new_ rating from the row's
**current** `eloRating` rather than from a client-precomputed absolute value (an
absolute replacement would still lose an update when two submissions touch the
same question). Callers pass only the replay inputs (opponent rating, correct
flag). The Elo delta math is duplicated in SQL there and must stay in sync with
the TypeScript source of truth in `src/utils/placementStaircase.ts`
(`ELO_K_FACTOR`, `DEFAULT_ELO_RATING`, and the `/ 400` expected-score divisor) —
`src/__tests__/atomicEloParity.test.ts` guards that parity.

**`next-placement-question` run state (CAS).** Every state write is a
compare-and-swap against the exact `pending` question that was just read
(`.eq('pending->>questionId', answeredQuestionId)` plus `.eq('status',
'in_progress')`). Two in-flight calls carrying the same `previousQuestionId`
(double-click, retry, duplicate tab) both pass the in-memory staleness check, but
only the one whose conditional write actually lands proceeds; the loser gets the
same `409` a genuinely stale call would. This keeps the level trace that
`submit-test` later trusts verbatim from being double-appended.

**`next-placement-question` item Elo write-back (intentional LWW).** The
per-question difficulty rating lives on the item's own small `question_bank_items`
row, not in the test document, so concurrent updates to _different_ items never
race, and concurrent updates to the _same_ item are a plain last-write-wins on
one small field. Item ratings are an internal self-calibration refinement, not
authoritative data, so losing one delta is acceptable; the write is best-effort
and never fails the request. It is deferred until the CAS above lands so a
rejected duplicate can't double-apply the delta.

**Client entity sync (intentional LWW by `updatedAt`).** The offline-capable
sync layer resolves per-record conflicts last-write-wins by `updatedAt`, with
in-flight pending-queue edits protected from being clobbered by a stale hydrate
(see the "Storage rule" sections of the root and `supabase/CLAUDE.md`). This is
the app's deliberate, single-teacher-owns-entity model, covered end-to-end by
`src/utils/syncMerge.test.ts`. Do not hand-roll merge logic elsewhere.

## Adding a new shared-document write

When you add a flow that reads a JSON/JSONB document (or another shared
aggregate), mutates it, and writes it back, pick a strategy from the three above
and add a row to the inventory. Prefer **atomic** (a single-statement
`jsonb_set` UPDATE or an RPC) whenever more than one writer can touch the same
document; fall back to **CAS** when the mutation can't be expressed in one
statement; use **intentional LWW** only when a lost concurrent change is
genuinely acceptable, and say why here.
