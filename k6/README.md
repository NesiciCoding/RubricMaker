# Load testing (k6)

Phase-1 load testing for RubricMaker's Supabase backend. This is a **regression
smoke test, not a capacity test** — read the scope note below before reading the
numbers.

## What this is (and isn't)

`load-test.js` drives ~50 [k6](https://k6.io) virtual users at the hot,
student-facing backend paths:

1. **`get-test-assignment` edge function** — the endpoint a whole class hits when
   opening a test. Exercises `auth.getUser` + two Postgres reads + the
   student-safe transform. Idempotent, so it's safe to hammer.
2. **PostgREST RLS read of `tests`** — the sync/hydrate path every connected
   session drives on boot and after each edit.

k6 thresholds fail the run on:

- **error rate ≥ 1%** (`http_req_failed`) — the "does it still work under
  concurrency" gate,
- **malformed responses** (`checks` < 99%) — right shape, not just HTTP 200,
- **gross latency regressions** (p95 over a generous local-stack bound).

### Why it is not a capacity test

In CI (and locally) the k6 generator and the **entire Supabase stack** — Postgres,
PostgREST, GoTrue, Kong, and a **single** Deno edge-runtime container — run on the
**same machine, sharing the same CPU**. The p95 you get is dominated by that
co-location, not by how the code would behave on production infrastructure, where
edge functions autoscale across a fleet and Postgres is tuned and isolated.

So this suite answers *"did this change break or grossly slow the hot paths?"*.
It **cannot** answer *"can a school of 100+ students test simultaneously?"* — that
needs a dedicated staging Supabase project (**Phase 2**), pointing the same script
at the staging URL with a higher `VUS`.

## Running locally

Start the local stack, export its credentials, then run k6:

```bash
npm run db:start                       # or: supabase start
supabase status                        # copy the publishable + secret keys

export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY=sb_publishable_...   # anon / publishable key
export SUPABASE_SERVICE_KEY=sb_secret_...      # service_role / secret key

k6 run k6/load-test.js
```

Install k6 with `brew install k6` (macOS) or see
[k6 installation](https://grafana.com/docs/k6/latest/set-up/install-k6/).

### Tuning the run

Environment variables (all optional):

| Var        | Default | Meaning                                  |
| ---------- | ------- | ---------------------------------------- |
| `VUS`      | `50`    | Peak concurrent virtual users            |
| `DURATION` | `60s`   | Hold time at peak VUs (e.g. `2m`, `90s`) |

```bash
VUS=25 DURATION=30s k6 run k6/load-test.js
```

The script seeds its own throwaway teacher, test, and assignment via the
service_role key in k6's `setup()` (the `handle_new_user` trigger auto-creates the
teacher's profile), so no manual fixtures are needed. Seed rows are timestamped
and left in the local DB — `npm run db:reset` clears them.

## In CI

`.github/workflows/load-test.yml` runs this against a fresh local stack **weekly
(Mondays 05:00 UTC)** and **on demand** (`workflow_dispatch`, with `vus` /
`duration` inputs). It is intentionally **not** a per-PR check: a co-located
stack's latency is too noisy to gate unrelated PRs on, and load tests shouldn't
slow the main CI gate. The k6 summary is uploaded as a run artifact.
