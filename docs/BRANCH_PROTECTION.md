# Branch protection & production environment

Recommended settings for `main` and for the `production` GitHub Environment.
`main` is the production branch: every merge there triggers CI + e2e and then
the gated deploys (see `ci.yml` and CLAUDE.md → CI/CD).

## 1. Branch protection rule for `main`

**Where:** repository **Settings → Branches → Add branch protection rule**, branch pattern `main`.

### Recommended toggles

| Setting                                                          | Value          | Why                                                   |
| ---------------------------------------------------------------- | -------------- | ----------------------------------------------------- |
| Require a pull request before merging                            | ✅, 1 approval | No direct pushes to production                        |
| Dismiss stale pull request approvals when new commits are pushed | ✅             | Approvals stay valid for what was actually reviewed   |
| Require conversation resolution                                  | ✅             | Threads must be resolved before merge                 |
| Require status checks to pass before merging                     | ✅             | The CI gate below                                     |
| Require branches to be up to date before merging                 | ✅ (strict)    | Merged content was tested together with latest `main` |
| Require linear history                                           | ✅             | Works with the repo's squash-merge workflow           |
| Restrict who can push to matching branches                       | ✅ (as needed) | Limit write access to the team                        |
| Allow force pushes / Allow deletions                             | ❌ (defaults)  | No history rewriting on `main`                        |

Do **not** enable "Require deployments to succeed before merging": the deploy
jobs (`Deploy to GitHub Pages`, `Deploy to HestiaCP VPS`, `Deploy to VPS`) are
push-only — on pull requests they are skipped, and requiring them adds no merge
signal. GitHub treats a skipped required check as success, so it wouldn't block
merges — it would only add confusion.

### Required status checks (the merge gate)

Check runs are named after the workflow **job names**. Add these exact names
(case-sensitive) under "Require status checks to pass before merging":

| Required check                    | Workflow / job              | Runs                                                          |
| --------------------------------- | --------------------------- | ------------------------------------------------------------- |
| `Dependency Review`               | ci.yml → Dependency Review  | Supply-chain review of new deps                               |
| `Type-check, Lint & Test`         | ci.yml → ci                 | tsc, ESLint, Prettier, unit tests + coverage thresholds       |
| `E2E (1/2)` and `E2E (2/2)`       | ci.yml → e2e (shards)       | Cross-browser e2e (chromium/firefox/webkit/mobile/fake-media) |
| `E2E Report`                      | ci.yml → e2e-merge-reports  | Merged HTML/JUnit report (runs even when a shard fails)       |
| `E2E — Supabase Integration`      | ci.yml → e2e-supabase       | e2e against a fresh local Supabase stack                      |
| `Bundle Analysis`                 | ci.yml → bundle             | Production build + bundle-size check                          |
| `Analyze (javascript-typescript)` | codeql.yml → analyze        | CodeQL security analysis                                      |
| `Lighthouse Audit`                | lighthouse.yml → lighthouse | Perf/a11y budgets (optional — only if you want it blocking)   |

Two shortcuts:

- **Wildcards are supported** in check names, so `E2E (*)` covers both shards
  with one entry instead of listing them separately.
- Once you add a check, GitHub remembers it; if you later **rename a job**,
  update the rule — a stale name shows as "Expected — Waiting for status to be
  reported" and blocks merges forever.

Not required (deliberately): the three deploy checks — they only run on pushes
to `main` (skipped on PRs), so they never gate a merge.

## 2. Production environment: required reviewers

The `deploy-hestiacp` and `deploy-vps` jobs (in `ci.yml`) run in the
`production` environment; the standalone `deploy-*.yml` workflows use it too.

**Where:** repository **Settings → Environments → production**.

### Recommended settings

- **Required reviewers** — add the people/teams who must approve before a
  deploy can run. Anyone listed can approve.
- **Deployment branches → Selected branches: `main`** — deploys may only run
  for `main`. This blocks accidental manual deploys of feature branches.
- **Deployment timeout** — leave the default (30 min) or lower it; deploys are
  quick rsyncs.
- **Environment secrets** — `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`,
  `VPS_DOMAIN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `SUPABASE_PUBLIC_URL` (HestiaCP only) live here and are only injected into
  jobs that use this environment.

### How approval interacts with the pipeline

- On a push to `main`, CI + e2e run; once they pass, the deploy jobs start and
  **wait at the environment gate** — the check shows "Waiting" until a reviewer
  approves. Nothing deploys automatically without approval.
- The **entire deploy job waits**, including its build step, so the approved
  run builds from the exact commit that was approved.
- The `github-pages` environment used by `deploy-pages` is managed by GitHub
  itself and has no review gate — Pages deploys fire automatically once CI
  passes (as `deploy-pages` is push-only inside `ci.yml`).
- Manual deploys (`workflow_dispatch` on `deploy.yml` / `deploy-hestiacp.yml` /
  `deploy-vps.yml`) are also subject to the environment's required reviewers —
  approval is required even though the run was started by hand.

## 3. Merge queue for `main`

The merge queue makes PRs merge **only after CI passes against the latest
`main`** — queued PRs are combined onto a temporary branch, re-tested, and then
merged in order, so nobody has to manually update their branch.

### What's already wired up

The workflows are ready for the queue — **no repo change needed besides the
branch rule below**:

- `ci.yml`, `codeql.yml`, and `lighthouse.yml` all listen for the `merge_group`
  event, which is how GitHub re-runs checks on the queue's temporary branch.
  A workflow without it would never run in the queue and its required check
  would hang forever.
- The deploy jobs stay **off** during queue runs: they only fire on a real
  `push` to `main`, so the queue's temporary branch never triggers a deploy.
  The final merge into `main` is a normal push, which runs the gated deploys as
  usual (they wait on the `production` environment's reviewers).
- Concurrency is per-ref, so queued PRs each get their own CI run.

### Settings to enable it

In the **main branch protection rule** (Settings → Branches):

1. Check **Require merge queue** (it appears once "Require status checks" is on).
2. **Build concurrency** — start with `1` (one PR tested at a time; raise it
   only if queue throughput matters).
3. **Merge method** — keep **Squash and merge** (matches the repo's history).
4. Leave the merge queue's default limits (merge time limit 1 hour, max queued
   PRs 5).
5. You can now **uncheck "Require branches to be up to date"** — the queue
   re-tests against the latest `main` itself, so the strict check is redundant.
6. Click **Create** / **Save changes**.

### How it flows

1. A PR with a passing review and all required checks enters the queue
   ("Merge queue" button in the merge box, or auto-queued by the merge queue's
   "Merge automatically" setting in the PR).
2. GitHub creates `gha-merge-queue/...`, merges the latest `main` + the queued
   PRs into it, and re-runs the required checks (via `merge_group`).
3. If green, the PRs merge in order; the merge pushes to `main`, which fires
   the gated deploys.
4. If a check fails, the PR is removed from the queue and GitHub comments why.

### If you add or change a required check later

Make sure the workflow that produces it also listens for `merge_group` —
otherwise the queue will wait for a check that can never run.

## 4. If you change CI later

- Keep job names **unique across all workflows** — duplicate names cause
  ambiguous status checks.
- After renaming a job that is a required check, edit the branch rule.
- When adding a new job that should gate merges, add its check name to the rule
  in the same change (see CLAUDE.md → CI/CD for what the gate must cover).
