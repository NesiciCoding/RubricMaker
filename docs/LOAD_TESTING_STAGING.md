# Load testing on a staging VM

How to run the k6 harness (`k6/`, `scripts/loadtest.sh`) against a VM that
mirrors a self-hosted RubricMaker deployment, to answer the capacity question the
local co-located run can't: **can a server of size X handle Y concurrent
students?**

For the mechanics of the harness itself (profiles, env knobs, how the local run
works) see [`k6/README.md`](../k6/README.md). This doc is only about the staging
VM as a testing ground.

## Why a VM (and not a hosted Supabase project)

RubricMaker's production is self-hosted (Docker Supabase behind Caddy on a VPS).
A managed Supabase project would not mirror that — it has a managed connection
pooler, autoscaling edge functions and tuned Postgres you don't run. A VM running
the **same Docker stack** reproduces the real bottlenecks, and — crucially — lets
you **size the VM to a specific school's server** and measure whether that exact
spec holds up. That's the number you actually need.

## First decide: which stack does the VM run?

This determines what you can load-test, because **this repo's own
`docker-compose.yml` does not run the edge functions.** It ships `db`,
`db_migrate`, `auth` (GoTrue), `rest` (PostgREST), `storage`, `app` and `caddy` —
but no edge runtime. The `get-test-assignment` / `submit-*` edge functions only
exist on:

- **Supabase Cloud**, or
- the **official self-hosted Supabase Docker stack** (which ships a `functions`
  container behind a Kong gateway).

So pick your `TARGET` to match the VM:

| VM runs…                              | Edge functions? | Use `TARGET=` | Tiers exercised |
| ------------------------------------- | --------------- | ------------- | --------------- |
| This repo's `docker-compose.yml`      | No              | `rest`        | PostgREST + Postgres + auth (seeding) |
| Official self-hosted Supabase stack   | Yes             | `both` (default) | Edge functions + PostgREST + Postgres + auth |
| Supabase Cloud                        | Yes             | `both`        | (that's Phase-2 hosted, not a VM) |

If you want the fullest capacity picture (including the edge functions students
hit when opening a test), mirror the **official self-hosted stack** on the VM and
copy each function's `index.ts` into that stack's `volumes/functions/<name>/`
(there's no separate deploy step — the edge runtime serves it as soon as the file
is in place). Otherwise the repo compose plus `TARGET=rest` still meaningfully
loads the database/sync tier, which is the bulk of steady-state traffic.

## The one rule that makes the numbers real

**Run k6 from OUTSIDE the VM.** If k6 runs inside the VM, the generator and the
Supabase stack fight for the same CPUs and you measure the VM's ability to run
both, not its capacity to serve students. So:

- **VM** = system under test only (the Docker stack).
- **k6** = your laptop or a separate box, ideally on the same LAN as the VM.

## Setup

### 1. Provision the VM at the spec you want to test

Give it the CPU/RAM you'd actually give a school (start small — a school server is
not large). You'll vary this later to find the spec each school needs.

### 2. Bring up the stack

For a VM mirroring this repo's compose:

```bash
git clone <repo> && cd RubricMaker
cp .env.docker.example .env      # set real POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY
docker compose up -d             # db_migrate applies all migrations automatically
```

Expose the Supabase gateway to the machine running k6 (the port/URL that serves
`/auth`, `/rest`, and — on the official stack — `/functions`). Confirm from the
k6 box:

```bash
curl -fsS "$SUPABASE_URL/rest/v1/" -H "apikey: $ANON_KEY" >/dev/null && echo reachable
```

### 3. Load a realistic data volume (optional but recommended)

Query plans and index behaviour change with table size; a near-empty DB flatters
your results. Restore a production-shaped dataset first (see
[`scripts/restore.sh`](../scripts/restore.sh) /
[`docs/SELF_HOSTING_OPS.md`](SELF_HOSTING_OPS.md)) so Postgres is working against
representative row counts. The harness's own seeded pool sits on top of that.

### 4. Snapshot the VM

Take a VM snapshot now. Revert to it between runs for clean, repeatable results —
that also makes the harness's seeded rows a non-issue (no cleanup needed; just
revert). If you can't snapshot, run [`scripts/loadtest-cleanup.sh`](../scripts/loadtest-cleanup.sh)
after each run instead.

## Run

From the k6 machine (not the VM):

```bash
export SUPABASE_URL=https://staging.yourdomain.tld      # or http://<vm-ip>:<port>
export SUPABASE_ANON_KEY=<anon key from the VM's .env>
export SUPABASE_SERVICE_KEY=<service_role key from the VM's .env>

# Non-localhost target → the runner asks you to confirm once (LOADTEST_YES=1 skips).
TARGET=rest npm run loadtest:smoke        # sanity check the wiring first
TARGET=rest VUS=100 npm run loadtest:stress   # repo-compose VM: DB/sync tier
# On the official self-hosted stack / Cloud, drop TARGET (defaults to both):
VUS=200 npm run loadtest:stress
```

Watch **both sides** during a run:

- **k6's live output** — RPS, p95, error rate. Rising `dropped_iterations` or
  connection errors *before* server latency climbs means your *generator* is
  saturated, not the VM — move k6 to a bigger box.
- **the VM's own metrics** — `htop` on the VM, or the bundled Loki/Promtail/Grafana
  stack ([`docker-compose.observability.yml`](../docker-compose.observability.yml),
  see [`docs/OBSERVABILITY_DASHBOARDS.md`](OBSERVABILITY_DASHBOARDS.md)). CPU
  pinned at 100%, Postgres hitting its connection limit, or swap usage is what
  turns "it got slow at 130 VUs" into a root cause you can fix by resizing.

## Sizing table — fill this in as you test

Re-provision the VM at each spec, run `stress`, and record where p95 crosses an
acceptable bound (e.g. keep the `get-test-assignment` p95 under ~1 s) or errors
begin:

| VM spec (vCPU / RAM) | Healthy up to (concurrent) | First breaks at | Notes (what saturated: CPU / DB conns / …) |
| -------------------- | -------------------------- | --------------- | ------------------------------------------ |
| 2 vCPU / 4 GB        |                            |                 |                                            |
| 4 vCPU / 8 GB        |                            |                 |                                            |
| 8 vCPU / 16 GB       |                            |                 |                                            |

A single class is ~25–35 concurrent; a school running a test across classes in one
period is ~100–200. Use those as your target bands when reading the table: pick
the smallest spec that comfortably clears the largest class-count a given school
will run simultaneously.

## Interpreting results

- **The knee, not the average.** The useful output of a `stress`/`spike` run is
  the VU count where latency/errors turn upward — that's the capacity ceiling for
  that spec.
- **A VM mirror is faithful but not identical** to your real VPS (disk, noisy
  neighbours, network path differ). Treat the numbers as a well-grounded estimate
  for sizing, and confirm against the real host in a maintenance window before
  committing to a school.
