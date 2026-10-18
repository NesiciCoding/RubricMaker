# Live-stack audit — October 2026

Second pass over what is worth adding to the live RubricMaker stack, sized for the
production host: **one Strato VPS, 6 vCores, 12 GB RAM** (Linux VC 6-12, ~360 GB disk,
traffic not metered). It reviews the open issues from the first audit (#882, #891) and
adds what that audit missed.

This is a review, not a spec. Where something could not be checked from the repository
(the live box was not reachable from the audit environment), it says so and gives the
command that settles it.

---

## 0. What production actually runs

The repository describes two different backends, and most of the open ops work assumes
the wrong one:

| Evidence                                                                                                                                    | Points to                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `README.md`: student passwords, essay submission and tests need edge functions, which "this repo's own docker-compose.yml does not include" | Official Supabase self-hosted stack                          |
| `deploy/nginx-hestiacp.conf` CSP and `.mcp.json` name `supabase.rubricmaker.nl`                                                             | Separate Supabase host, not this repo's `app` proxy          |
| `ci.yml` `deploy-hestiacp` rsyncs `dist/` to HestiaCP's `public_html`                                                                       | The repo's `app`/`caddy` services are not used in production |
| `docs/LOAD_TESTING_STAGING.md`: "production is self-hosted (Docker Supabase behind Caddy on a VPS)"                                         | Ambiguous                                                    |

So production is most likely **HestiaCP (frontend) + the official Supabase Docker stack
(backend) + this repo's observability compose**, all on the one VPS. The official stack is
not in this repository.

**Confirmed by the operator (2026-10-18):** production is HestiaCP plus the official
Supabase Docker stack.

**Tracking:** the findings below are filed as #929–#937 and indexed on #882. #871 and #873
are closed; #870, #875 and #886 are re-scoped; #404 is raised to high and #889 deferred.

---

## 1. Fix before adding anything

These are defects in what is already live. Each one is small.

### 1.1 The camera scan is blocked by our own headers (bug)

Every deploy config sends `Permissions-Policy: geolocation=(), camera=(), payment=()`:
`deploy/nginx-hestiacp.conf`, `deploy/.htaccess`, `public/.htaccess`, both Apache confs,
`deploy/nginx-virtualmin.conf`, `docker/nginx*.conf`.

`camera=()` disables the camera for the page itself, so `getUserMedia({ video })` in
`src/hooks/useCameraCapture.ts` fails with `NotAllowedError` in production. That breaks the
live camera in `ScanCaptureModal` (handwriting OCR) and `ExamScanCaptureModal` (answer-sheet
scanning). Photo import still works. Dev and e2e never send these headers, which is why
the tests don't catch it.

**Fix:** `camera=(self), microphone=(self)` in every file. Microphone is not blocked today,
but stating it keeps the two consistent. Add a test that scans `deploy/`, `docker/` and
`public/` for `camera=()`.

### 1.2 Check what the official stack exposes to the internet

- The upstream `docker-compose.yml` publishes Supavisor on `${POSTGRES_PORT}:5432` and
  `${POOLER_PROXY_PORT_TRANSACTION}:6543`, and the API gateway on `8000`, on **all
  interfaces**. Docker writes its own iptables rules ahead of HestiaCP's firewall, so a
  port blocked in the panel can still be reachable.
- `.mcp.json` points at `http://supabase.rubricmaker.nl/mcp` over **plain HTTP**. The
  Studio MCP endpoint can run SQL against the whole database, and Studio's basic-auth
  credentials cross the network in clear text on that URL.

**Fix:** bind `5432`, `6543` and `8000` to `127.0.0.1` in the stack's
`docker-compose.override.yml` (nginx already fronts the API). Reach Studio and `/mcp` only
over an SSH tunnel or WireGuard/Tailscale, never through the public vhost. Change
`.mcp.json` to `https://` or to a tunnel address. Verify from **outside** the VPS:
`nmap -Pn -p 5432,6543,8000,8443,3000 <vps-ip>` should show every port closed or filtered.

### 1.3 The CI deploy logs in as root (#404 — raise to high)

`deploy-hestiacp` rsyncs as `remote_user: root` with a key stored in GitHub secrets. That
key is root on the machine that holds every student record. #404's plan (a dedicated
account limited to `public_html`) is right, and it is a 30-minute job. It is marked
`priority: medium`; it should be high.

### 1.4 Make sure the backup work protects production (#872 / PR #925)

PR #925 is careful work, but it is built for **this repo's** compose:

- `backup.sh` requires a Docker **named volume** `<project>_storage-data` and refuses to run
  without one. The official stack stores uploads in a **bind mount**
  (`./volumes/storage`), so the script stops.
- It records migrations from `public._migrations`, which only exists when migrations were
  applied by this repo's `docker/migrate.sh`. A stack migrated with `supabase db push`
  keeps them in `supabase_migrations.schema_migrations`, so that query fails.
- `restore-drill.sh` restores into this repo's compose, which doesn't match production.

If §0 shows the official stack, the PR needs a mode for it before #872 can be called done:
a bind-mount path in place of `STORAGE_VOLUME`, the right migrations table, and a drill
against the same stack. Until then, production's only backups are the `nightly-backup`
JSON snapshots, which hold no files and sit on the same disk.

---

## 2. Memory budget for 12 GB

The earlier audit sized everything for "4 vCPU, 4–8 GB" (#885, #891). The real host has
50% more cores and up to 3× the RAM, so several conclusions change. These are rough
figures: the observability numbers were measured in PR #928, the rest are typical values.
Confirm them with `docker stats --no-stream` and `free -m`.

| Component                                                  | Typical RSS   | Notes                                                                                |
| ---------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| Postgres (with §3.3 tuning)                                | 2.5–3 GB      | Mostly `shared_buffers`; the rest is page cache                                      |
| Rest of the official Supabase stack                        | 1.5–2 GB      | auth, rest, realtime, storage, imgproxy, meta, studio, functions, supavisor, gateway |
| Logflare + Vector, if running                              | **+1–1.5 GB** | Optional upstream since `docker-compose.logs.yml` (§3.2)                             |
| Observability (Alloy, Loki, Grafana, Prometheus, exporter) | 0.5–0.8 GB    | Measured in #928                                                                     |
| HestiaCP services                                          | 0.5–2 GB      | ClamAV alone is about 1 GB if enabled (§3.2)                                         |
| OS and page-cache headroom                                 | ≥ 2 GB        | Don't budget this away                                                               |
| **LanguageTool** (#878, 1.5 GB heap)                       | ~2 GB         | Java RSS sits above `-Xmx`                                                           |
| **Whisper** base / small, INT8, one job (#885)             | 0.5 / 1.5 GB  | Only while a job runs, if loaded on demand                                           |

**Conclusion:** LanguageTool and a small Whisper model both fit in 12 GB, but **only after
§3.2's trimming and with §3.1's memory limits**. Without them, adding a 2 GB JVM risks the
kernel OOM-killing Postgres during a lesson.

CPU is the tighter limit. Strato vCores are shared, so steal time is real. Cap Whisper at
`cpus: 2` with one job at a time, and add a **CPU steal** panel and alert to #928's host
dashboard (`node_cpu_seconds_total{mode="steal"}`). Without it, "the VPS is slow" and "the
neighbours are busy" look the same.

---

## 3. New recommendations, not in any issue

### 3.1 Guard Postgres from the OOM killer (do before §5's additions)

- `mem_limit` (or `deploy.resources.limits.memory`) on every non-critical container:
  LanguageTool, Whisper, Grafana, Loki, Prometheus, Studio, imgproxy. Then the kernel kills
  the one that overran, not the database.
- `oom_score_adj: -800` on `db`.
- A 2–4 GB swapfile with `vm.swappiness=10`, as a buffer rather than working memory. Check
  first: many VPS images ship with no swap.

Cost: about 20 lines of compose. This is what makes the rest of the list safe.

### 3.2 Remove what isn't needed

- **Logflare (`analytics`) and Vector.** Upstream moved them to an optional
  `docker-compose.logs.yml`, and Studio now ships with `ENABLED_FEATURES_LOGS_ALL: "false"`.
  If your checkout predates that, they are probably still running: a second log pipeline
  next to Alloy and Loki, for 1–1.5 GB. Drop them.
- **HestiaCP extras.** If the VPS doesn't host mail or PHP sites, disable ClamAV,
  SpamAssassin, Exim/Dovecot and MariaDB (check `v-list-sys-services`). Apache is only
  there for `.htaccess` SPA routing. HestiaCP's nginx-only template plus a `try_files` rule
  would retire it too, but that is optional.

Together this frees 1–3 GB, which is the room LanguageTool needs.

### 3.3 Tune Postgres for the box

The Supabase image ships with conservative defaults. Check with `SHOW shared_buffers;`.
For a 12 GB host shared with everything above, start with:

```ini
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 256MB
random_page_cost = 1.1        # SSD
```

Then add a **top queries** panel from `pg_stat_statements` (the Supabase image preloads it)
to #928's Postgres dashboard. It's the cheapest way to find the one slow RLS policy that
will show up when a whole year group takes a test.

### 3.4 Put the production stack in the repository

The live backend (the official compose with its overrides, gateway config, `.env.example`
and the HestiaCP vhost snippets) isn't version-controlled here. Today:

- a restore after losing the VPS starts from memory, not from a file;
- backups, the restore drill and monitoring (§1.4) can't be tested against the real stack;
- Dependabot can't see the image pins. Its config covers only `npm` and `github-actions`,
  so GoTrue, PostgREST, Kong/Envoy and Postgres security releases get no PRs.

**Do:** add `deploy/supabase/` holding the pinned upstream compose plus your override (no
secrets), and add the `docker-compose` ecosystem to `.github/dependabot.yml` for it and for
the two compose files already in the repo. This is the prerequisite for a real disaster
recovery plan, and for §1.4.

### 3.5 Deploy the backend from CI as well

`deploy-hestiacp` ships only `dist/`. Its change filter doesn't even match `supabase/`, and
migrations and edge functions reach production by hand. Two things follow:

- a frontend that needs a new RPC or column can go live before the schema it needs, and
  teachers see sync errors;
- edge-function changes, such as #928's heartbeat helper, don't reach production until
  someone copies files into `volumes/functions/`.

**Do:** a `deploy-backend` job in `ci.yml`, gated like the others, that applies new
migrations over SSH and rsyncs `supabase/functions/` into the stack's functions volume.
It should run **before** `deploy-hestiacp`, using the restricted account from §1.3 plus a
narrow sudo rule. A cheaper interim step is a post-deploy check that compares the newest
file in `supabase/migrations/` with production's applied list and fails the job when they
differ.

### 3.6 Measure the real capacity

The k6 harness and `docs/LOAD_TESTING_STAGING.md` already exist, but the sizing table has
no 6 vCPU / 12 GB row. Run `stress` once from **outside** the VPS, during a quiet
maintenance window or against a cloned VM, and record where p95 bends. That answers
"can we run a test with three classes at once?" before a school finds out during one.

### 3.7 Snapshots for upgrades (verify availability)

Strato sells snapshots and backups as a paid add-on on the VC line. Check the current price
in the panel. A snapshot is a quick rollback before a Postgres major version or HestiaCP
upgrade. It is **not** a backup, because it lives with the same provider, so it complements
§1.4 and doesn't replace it.

### Later, only if needed

- **Point-in-time recovery (WAL-G or pgBackRest to EU object storage).** Nightly dumps mean
  up to 24 hours of grading lost in the worst case, which hurts in report-card weeks. The
  Supabase image does **not** bundle WAL-G, so this is real work (archive and restore
  commands, base backups, a drill). Do it once §1.4 is solid and if 24 hours is too long.
- **Postgres 15 → 17.** Upstream is on 17. 15 is supported until November 2027, so plan
  this for a summer break, with a snapshot (§3.7) and a fresh dump.

---

## 4. Verdicts on the open issues

### Do — and they are worth it

| Issue                      | Verdict                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #867, #868, #869 (PR #928) | **Merge.** Measured, uses little memory, and fixes real gaps (Promtail EOL, disk-full alerts, silent pg_cron failures). Add the CPU-steal panel (§2) and drop Logflare/Vector (§3.2) in the same pass.                                                                                                                                                                                             |
| #872, #926 (PR #925)       | **Merge #926's fixes; finish #872 for the live stack** (§1.4). Off-site target: pick an **EU provider** (Hetzner, Scaleway, OVH, IONOS). The PR's examples (R2, B2, Wasabi) are US companies, which is the objection that closed #877. Encryption softens that, but an EU bucket removes it.                                                                                                       |
| #404                       | **Do now, raise to high** (§1.3).                                                                                                                                                                                                                                                                                                                                                                  |
| #874                       | **Do the re-scoped OIDC wiring** from the triage comment: env vars only, and it removes OTP email from the login path for Entra and Google schools. SAML: keep it low _unless_ a school uses **Entree Federatie** (Kennisnet), the SAML federation many Dutch secondary schools use. That is the one concrete reason to build it.                                                                  |
| #875                       | **Do, smaller.** SPF, DKIM and DMARC plus an SMTP relay is the fix, and it takes an afternoon. Choose an EU provider (Brevo is French; Postmark and Resend are US). **Skip** piping bounce webhooks into Grafana: the provider's dashboard answers "did it bounce?" well enough at this scale.                                                                                                     |
| #878, #879, #880, #881     | **Do.** About 2 GB, fits after §3.2, and keeps student essays on-prem. Fold #881 into #879 (one PR changes the endpoint and the CSP together). The language-routing bug in #880 (every check runs as `en-US`) should ship **now**, separately; it doesn't depend on self-hosting. N-grams: disk isn't the issue on 360 GB, so benchmark them after the baseline works rather than ruling them out. |
| #885                       | **Do, as re-scoped**: stored recordings only, queued, `cpus: 2`, base model for speed and small for overnight batches. The issue's latency estimates assume 4 vCPU; re-measure on this host.                                                                                                                                                                                                       |
| #884                       | **Do**: a few `<meta>`/`<link>` lines.                                                                                                                                                                                                                                                                                                                                                             |
| #880's bug, §1.1           | Bugs; fix regardless of everything else.                                                                                                                                                                                                                                                                                                                                                           |

### Re-scope

| Issue                    | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #870 Sentry / GlitchTip  | **Not as proposed.** Self-hosted Sentry needs far more than this box has. GlitchTip needs its own Postgres, Redis and a worker (third-party guides put a realistic install at 1–2 GB) to show stack traces for a few hundred users. Sentry Cloud EU is still a US company as sub-processor, the same reasoning that closed #877. **The app already captures errors.** `main.tsx` listens for `unhandledrejection` and `ErrorBoundary` calls `logEvent`, into `client_logs`, with the "ids and counts only" rule and the size limits from migration 089. It is just gated behind `VITE_STRESS_TEST_LOGGING`. Add an **errors-only, always-on** mode (category `error` only, no actions or page views), build with `sourcemap: 'hidden'`, keep the `.map` files as a CI artifact (not deployed), and alert in Grafana on the error rate through the Postgres datasource #928 already provisions. Same outcome, no new service, no new sub-processor, and `PRIVACY.md` needs one paragraph rather than a new third party. |
| #886 Read feedback aloud | **No server TTS.** `useTTS` already drives browser `speechSynthesis` in the test player, essays and news flashes. Reuse it on the portal's feedback cards. A server voice would break offline use for no real gain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| #890 Command palette     | Ctrl/Cmd-K already opens `GlobalSearch` (see triage). Small upgrade, not a feature.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| #887 Comment recall      | Agree with the triage: client-side search over past feedback first. A migration only if that proves too slow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Close or don't build

| Issue                                                         | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **#871 Storage on Cloudflare R2**                             | **Close as not planned.** (1) It puts student **recordings**, the most sensitive files in the app, on Cloudflare, the sub-processor already rejected in #877 for _traffic_. (2) Its main argument, zero egress fees, doesn't apply: Strato doesn't meter traffic. (3) Its other argument, disk-full taking Postgres down, is answered by #928's disk alerts and a 360 GB disk (about 7,000 maximum-size recordings). Revisit only if disk use actually trends toward full, and then with a bigger Strato disk or an EU bucket. |
| **#873 pgmq**                                                 | **Close as superseded.** It solves "pg_net fails silently", and #928 already alerts on failed `pg_cron` runs and failed `pg_net` calls (`monitoring.failed_jobs()`) and adds heartbeats. One nightly digest doesn't need a message queue. It also adds `pgmq_public` to `PGRST_DB_SCHEMAS`, exposing queue RPCs through the public REST API: new attack surface for no remaining benefit.                                                                                                                                      |
| **#889 Live co-grading**                                      | **Defer.** Realtime is already running, so the infrastructure cost is small, but the feature isn't: presence scoping, conflict rules, and the duplicate-grade path that #799 only just fixed. Moderation already works asynchronously, and nobody has asked for live co-marking. Build it when a pilot school does.                                                                                                                                                                                                            |
| #876 PostHog, #877 Cloudflare, #888 pgvector (already closed) | Agree with all three closures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Self-hosted LLM (#891's exclusion)                            | **Agree, but the reasoning in #891 is out of date.** On 12 GB an 8B Q4 model _would_ fit in memory. It's still the wrong choice: the "No AI generation" rule in `CLAUDE.md` excludes it, and CPU-only generation on 6 shared vCores would be slow and would take CPU from Postgres during lessons. Update #891 so the exclusion doesn't read as a hardware limit that a bigger VPS removes.                                                                                                                                    |

### Also not worth adding

- **Redis or another cache layer.** PostgREST on a tuned Postgres (§3.3) is not the
  bottleneck at this scale. Measure with §3.6 before adding anything.
- **A Postgres replica or HA on the same host.** A replica on the same VPS fails together
  with the primary. The DR plan is off-site backups plus a rehearsed restore (§1.4).
- **Kubernetes, Nomad, Swarm or a service mesh.** One host and one operator; Compose is the
  right tool.
- **A public status page.** Not until several schools depend on the service; an external
  uptime check (#869) covers the operator's need.

---

## 5. Suggested order

1. **§1.1** camera header, **#880's** language bug: quick bug fixes.
2. **§0** check which stack runs, then **§1.2** port and Studio lockdown, then **#404**.
3. **§1.4 / #872**: backups that actually cover production.
4. **#928** (observability) with the CPU-steal panel; **§3.2** trimming; **§3.1** memory
   guardrails; **§3.3** Postgres tuning.
5. **§3.4** stack in the repo and Dependabot for images; then **§3.5** backend deploy.
6. **#874** OIDC wiring, **#875** email, **#884** iOS meta.
7. **#878–#881** LanguageTool; then **#885** Whisper for stored recordings.
8. **#870** re-scoped as errors-only `client_logs`.
9. **§3.6** load test on the real box before the next exam period.

Close #871 and #873. Update #891's LLM rationale. Defer #889.

---

## Sources

- Upstream Supabase self-hosting compose (services, published ports, optional logs file):
  https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml
- Strato VC 6-12 listing (6 vCores, 12 GB, 360 GB, unmetered traffic, backups not included):
  https://www.whtop.com/de/plans/strato.de/135959
- GlitchTip resource estimates (third-party, ranging from 256 MB to 2 GB):
  https://www.ssdnodes.com/learn/lang/nl/self-hosted-error-tracking-sentry-alternatives,
  https://servercompass.app/templates/glitchtip
- WAL-G with Postgres (not bundled in the Supabase image):
  https://supabase.com/blog/continuous-postgresql-backup-walg.md
