# Load testing (k6)

Load testing for RubricMaker's Supabase backend, runnable on your own machine
with one command, plus a weekly/on-demand CI run.

## What it exercises

`load-test.js` drives virtual users at the hot, student-facing backend paths:

1. **`get-test-assignment` edge function** — the endpoint a whole class hits when
   opening a test. Exercises `auth.getUser` + two Postgres reads + the
   student-safe transform. Idempotent, so it's safe to hammer.
2. **PostgREST RLS read of `tests`** — the sync/hydrate path every connected
   session drives on boot and after each edit.

The script **seeds its own pool** of tests and assignments (default 5 tests, 40
assignments) via the service_role key in k6's `setup()` — the `handle_new_user`
trigger auto-creates the teacher's profile — and each virtual user picks a random
assignment. Reads therefore hit many rows, not one cache-hot row, so the numbers
reflect a realistic access distribution. Seed rows are timestamped and left in
the DB; `npm run db:reset` clears them.

## Quick start (local)

```bash
npm run db:start        # start the local Supabase stack (needs Docker + supabase CLI)
npm run loadtest        # default 'load' profile — ~50 VUs against the local stack
```

`npm run loadtest` reads the anon + service_role keys straight from
`supabase status`, so you never copy keys by hand. Install k6 first with
`brew install k6` (macOS) or see
[k6 install](https://grafana.com/docs/k6/latest/set-up/install-k6/).

## Load profiles

Pick a profile as the first argument (or via the `npm run loadtest:*` scripts):

| Profile  | npm script              | Shape                                              | Answers |
| -------- | ----------------------- | -------------------------------------------------- | ------- |
| `smoke`  | `loadtest:smoke`        | 5 VUs, ~15s                                         | Is the path alive under a little concurrency? |
| `load`   | `loadtest` (default)    | ramp to 50 VUs, hold 60s                            | Does a class/small-school workload stay healthy? |
| `stress` | `loadtest:stress`       | climb 50→100→150→200 VUs in steps                   | Where does it start to break? |
| `spike`  | `loadtest:spike`        | jump to 150 VUs in 3s, hold                         | Whole class hits "open test" at once |
| `soak`   | `loadtest:soak`         | 30 VUs held for 10 min                             | Leaks / slow degradation over time |

Every profile's peak and hold are overridable:

```bash
VUS=300 npm run loadtest:stress          # climb to 300 VUs
VUS=80 DURATION=3m npm run loadtest       # 80 VUs held for 3 minutes
SEED_ASSIGNMENTS=200 npm run loadtest     # a bigger, less cache-hot read pool
scripts/loadtest.sh load -- --out json=run.json   # pass any flag through to k6
```

Steady profiles (`smoke`/`load`/`soak`) enforce **thresholds** that make the run
pass/fail: error rate < 1%, response-shape checks > 99%, and generous p95 bounds.
`stress`/`spike` deliberately overload the target, so they report numbers without
pass/fail thresholds — read the summary to find the knee.

## Getting numbers that mean something

The honest constraint: on one machine the k6 generator and the **entire** Supabase
stack (Postgres, PostgREST, GoTrue, Kong, a **single** edge-runtime container) share
the same CPU. Two consequences you have to design around:

**1. Make sure you're measuring the server, not the generator.** k6 can create
thousands of VUs trivially; the stack is what saturates first. While a run is
going, watch host CPU (`htop`) and the k6 live output. If you see
`dropped_iterations`, climbing `http_req_blocked`, or connection errors *before*
the server's own latency rises, your machine — not RubricMaker — is the
bottleneck, and the numbers are about your laptop. Mitigations:

- Give Docker Desktop more CPUs/RAM (Settings → Resources) — the local Supabase
  containers are what you're testing, so starve them and you measure noise.
- Close other heavy apps; run on AC power (laptops throttle on battery).
- For the truest local read, run k6 on a **second machine** on the same LAN and
  point it at the stack host: `SUPABASE_URL=http://<host-ip>:54321` plus that
  stack's keys. Now the generator and the server aren't fighting for cores.

**2. The local stack is not production-shaped.** Local Postgres is untuned and one
edge-runtime container serves every function call, whereas production Supabase
autoscales edge functions and runs isolated, tuned Postgres. So use the local run
for **relative** questions — "did this change regress the hot paths?", "does 50
concurrent stay under my p95 bound?", "at what VU count does *my box* fall over?"
— and treat absolute throughput as a floor, not the production ceiling.

To answer "can a real school of 100–200 students test simultaneously?", point the
**same script** at a dedicated **staging Supabase project** (export `SUPABASE_URL`
+ its anon/service keys, then `npm run loadtest:stress` with a high `VUS`). The
generator and the server are then fully separated and the target is real infra.
Provisioning that staging project is the remaining step for true capacity testing.

## In CI

`.github/workflows/load-test.yml` runs the `load` profile against a fresh local
stack **weekly (Mondays 05:00 UTC)** and **on demand** (`workflow_dispatch`, with
`vus` / `duration` inputs). It is intentionally **not** a per-PR check — a
co-located stack's latency is too noisy to gate unrelated PRs on. The k6 summary
is uploaded as a run artifact.
