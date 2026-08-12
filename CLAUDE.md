# RubricMaker — Claude Code Guide

## Project overview

RubricMaker is a rubric and grading application for teachers. It is **self-hostable with full functionality** (Supabase backend for persistence, sync, multi-device and multi-teacher features) and **offline-capable with reduced capabilities**: without a Supabase connection the app still runs from browser `localStorage`, but cloud-dependent features (collaboration, student portal, multi-device access) are unavailable. The app targets static hosting and can also be self-hosted with Docker.

Key domains:

- **Rubric Builder** — create/edit rubrics with criteria, levels, scoring modes
- **Grading** — interactive grading with comment bank, voice feedback, attachments
- **Analytics** — per-class and per-student charts, CEFR proficiency tracking
- **CEFR / Language assessment** — proficiency levels, speaking sessions, self-assessment
- **Essay writing** — TipTap rich-text editor, submission codes, peer review
- **Export** — PDF, DOCX (with mail-merge templates), CSV
- **Document analysis** — OCR via Tesseract.js, DOCX parsing via Mammoth

## Commands

```bash
npm run dev          # Vite dev server at http://localhost:5173
npm run build        # tsc && vite build → dist/
npm run typecheck    # tsc --noEmit (run before commits; also runs in the pre-push hook)
npm run check        # Full pre-push gate: typecheck + lint + format:check + unit tests
npm run lint         # ESLint check (src only)
npm run format       # Prettier write
npm test             # Vitest, single run (NOT watch mode — use `npx vitest` for watch)
npm run coverage     # Coverage report (thresholds: 65% lines/statements, 60% functions, 58% branches)

# Single test file / single test
npx vitest run src/utils/gradeCalc.test.ts
npx vitest run -t "test name substring"

# Playwright e2e (testDir: e2e/specs, baseURL http://localhost:5173 — needs `npm run dev` running separately)
npm run e2e              # all specs, chromium + firefox projects
npm run e2e:chromium      # chromium only, faster local loop
npm run e2e -- e2e/specs/04-grading.spec.ts   # single spec
npm run e2e:ui            # Playwright UI mode
npm run e2e:supabase      # the Supabase-dependent specs excluded from the default projects (needs `npm run db:start` first)

# Supabase local dev
npm run db:start     # Start local Supabase stack
npm run db:stop      # Stop it
npm run db:reset     # Reset and re-apply all migrations
npm run db:status     # Print local stack connection info/ports
```

A pre-commit hook runs `lint-staged` (ESLint --fix + Prettier on staged files); pre-push runs `npm run typecheck`.

## Tech stack

| Layer       | Choice                                                                    |
| ----------- | ------------------------------------------------------------------------- |
| Framework   | React 19 + TypeScript 6 (strict)                                          |
| Build       | Vite 8                                                                    |
| Routing     | React Router v7 (lazy-loaded pages)                                       |
| State       | React Context (`AppContext`) + `useReducer`                               |
| Persistence | Supabase primary when configured; `localStorage` offline-capable fallback |
| Rich text   | TipTap 3 (ProseMirror)                                                    |
| Charts      | Recharts                                                                  |
| Export      | `docx`, `pdfjs-dist`, `file-saver`                                        |
| OCR         | Tesseract.js                                                              |
| i18n        | i18next (EN, NL, FR, DE, ES)                                              |
| Auth        | Supabase Auth (email OTP) — optional                                      |
| Tests       | Vitest + Testing Library                                                  |

## Architecture

### Data flow

```
User action → AppContext dispatch → useReducer → new state (always)
                                               → storage.ts (localStorage write — only while offline/disconnected)
                                               → StorageSync (Supabase write — only while connected)
```

`src/store/storage.ts` is the single write point for persistence. Never write to `localStorage` directly from components or hooks.

### Storage rule (Supabase-primary, offline-capable)

Supabase is the primary store whenever a connection is configured. The app must still start and run without Supabase — the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars are optional, and if absent, all database sync is silently skipped and `localStorage` is the sole, permanent store — but this local mode is a reduced-capability fallback, not the primary design target.

When a Supabase connection is live, `localStorage` is no longer a permanent duplicate copy — it's only a temporary buffer:

- The reducer (`src/context/AppContext.tsx`, `isOffline()`) only writes an entity to `localStorage` when `!navigator.onLine || !storageSync.isConnected()`. While connected, persistence is the Supabase push (`StorageSync.pushOne`, fired from the delta-sync effect after each dispatch).
- If a push fails while otherwise "connected" (RLS error, transient failure), it falls back to the pending-sync queue (`rm_pending_sync` in `storage.ts`) as a per-record retry buffer — this is the only copy of that edit in `localStorage` until the retry succeeds, at which point it's cleared.
- On reconnect, `StorageSync.flushPendingQueue()` retries the queue; on initial connect/login, `hydrate()` pulls from Supabase and writes a merged snapshot back to `localStorage` purely as an offline-readiness cache for the next boot — not as a live mirror of every edit.

Do not reintroduce code that writes a full entity array to `localStorage` unconditionally — gate it through `isOffline()` (or the existing pending-queue mechanism) so a connected session doesn't keep a redundant local copy.

Conflict resolution for concurrent edits from different devices lives in `src/utils/syncMerge.ts` (per-record conflicts resolve last-write-wins by `updatedAt`, with in-flight pending-queue edits protected from being clobbered by a stale hydrate) and `src/utils/syncDiff.ts` (diffs a collection before/after a merge). Do not hand-roll merge logic elsewhere.

`src/services/database/` (adapters, `StorageSync`, `@supabase/supabase-js` itself) is dynamically imported via `loadDb()`/`getDb()` in `src/services/database/lazyDb.ts` rather than imported at module scope everywhere — this keeps the Supabase client chunk (~450KB) out of routes/components that never need a DB connection (e.g. `LoginButtons`). Route-level pages that always need sync (`RubricList`, `AdminPage`, etc.) can import `services/database` directly since they're already code-split by React Router lazy-loading. Prefer `loadDb()`/`getDb()` for anything rendered outside a specific lazy-loaded route.

`supabase/CLAUDE.md` has the full schema/migrations/RLS/edge-function reference — read it before touching anything under `supabase/`.

### State management

All app state lives in `AppContext` (`src/context/AppContext.tsx`). Do not introduce Redux, Zustand, or any other state library — the existing pattern is intentional.

`AppContext` splits its value into seven domain contexts so a dispatch that touches one collection only re-renders consumers that read that domain:

- `useRoster()` — students, classes, student rubrics, attachments
- `useAuthoring()` — rubrics, grade scales, comment bank, question bank, templates
- `useAssessment()` — tests, student tests, peer reviews, self-assessments, speaking sessions, analysis results
- `useEssays()` — essay assignments/submissions/templates, messages, news flashes
- `useFlashcards()` — flashcard decks/assignments/reviews, standard mastery targets
- `useSettings()` — settings, `updateSettings`, `getActiveGradeScale`
- `usePlatform()` — auth, landing/session, database connection, schools, backup

**Consume the domain hook for the data you read.** The old `useApp()` merged view — which spread every domain into one value and re-rendered on any change — is deleted, and a surface test (`src/context/AppContext.surface.test.tsx`) pins that it must not come back. Components that need several domains call each hook, e.g. `const { students } = useRoster(); const { rubrics } = useAuthoring();`. Pages and tests that need slices from many domains should subscribe via `useStoreSelector` (`src/context/useStore`) so they re-render only when one of the selected slices changes; tests composing domain hooks inside a single `renderHook` are capped at three by the `max-domains-in-render-hook` lint rule.

Secondary contexts: `ToastContext` (notifications), `MobileMenuContext` (nav state).

### Routing

Pages are lazy-loaded from `src/pages/`. Key routes:

| Path                                    | Page                    |
| --------------------------------------- | ----------------------- |
| `/`                                     | LandingPage             |
| `/rubrics`                              | RubricList              |
| `/rubrics/:id`                          | RubricBuilder           |
| `/rubrics/:id/grade/:studentId`         | GradeStudent            |
| `/grade-comparative/:classId/:rubricId` | ComparativeGrading      |
| `/students`                             | StudentsPage            |
| `/students/:id`                         | StudentProfilePage      |
| `/students/cefr-overview`               | StudentCefrOverviewPage |
| `/statistics`                           | StatisticsPage          |
| `/export`                               | ExportPage              |
| `/settings`                             | SettingsPage            |

## Code conventions

### TypeScript

Strict mode is on. All domain types live in `src/types/index.ts`. Do not create ad-hoc inline types for data shapes already defined there.

### i18n

All user-visible strings must use the `useTranslation` hook and a key from `src/locales/en.json`. Never hardcode English text in JSX. When adding features, add translation keys to **all** locale files (en, nl, fr, de, es).

### Styling

The app uses CSS custom properties defined globally (`--accent`, `--text`, `--bg-elevated`, `--bg-panel`, etc.). Components use inline `style` props with these variables. There is no CSS-in-JS library; do not introduce one. Dark/light theme support is handled via class on `<html>`.

### No AI generation

Do not add AI/LLM content-generation features (auto-grading, auto-feedback, rubric generation by prompt, etc.). These are explicitly out of scope for this project.

### Comments

Write no comments unless the _why_ is non-obvious. Never describe what the code does; the identifiers do that.

### Testing

- Unit tests live alongside the file they test (`foo.ts` → `foo.test.ts`) or in a `__tests__/` subdirectory.
- Use `src/test-utils/renderWithProviders.tsx` to render components that need context.
- Do not mock `localStorage` globally; tests use the jsdom implementation.
- Keep coverage above the thresholds: 65% lines/statements, 60% functions, 58% branches (`vite.config.ts`).
- `src/locales/__tests__/` asserts every non-English locale has the same key set as `en.json` for at least the `cambridge` namespace — new locale keys that are only added to `en.json` will fail this test.
- E2E specs (`e2e/specs/*.spec.ts`, Playwright) use a Page Object Model in `e2e/pages/` and shared fixtures/factories in `e2e/fixtures/`. Specs that require a live Supabase connection are excluded from the default `chromium`/`firefox` projects in `playwright.config.ts` and only run via `npm run e2e:supabase`.
- `src/__tests__/playwrightProjects.test.ts` guards the Playwright wiring: every spec in `e2e/specs/` must be run by at least one project, and `npm run e2e:*` scripts may only reference projects that exist. Keep `playwright.config.ts` project lists and this test in sync when adding/renaming specs or projects.
- **Flaky-spec quarantine**: a spec that flakes intermittently should be added to `e2e/quarantine.json` (`[{ "spec": "04-grading.spec.ts", "since": "2026-08-11", "reason": "…" }]`) rather than deleted — it is then excluded from every gating project (see `playwright.config.ts`) so it can't block CI, and the weekly `Quarantine Check` workflow re-tests it (3 clean runs, `--project=quarantine`) and opens a PR to unquarantine it once it's stable. Quarantine is only validated against the default browser projects; don't quarantine a spec that needs the Supabase stack unless it's debugged.
- **Flaky unit-test quarantine**: the same idea for vitest tests. Add the test to `quarantine-unit.json` (`[{ "id": "detects Arabic", "file": "src/utils/rtlLanguages.test.ts", "since": "2026-08-11", "reason": "…" }]`) and wrap the test as `it.skipIf(isQuarantined('detects Arabic'))('detects Arabic', fn)` from `src/test-utils/quarantine.ts` — it is then skipped in every run (local, CI, coverage). The `id` must be a regex-safe substring of the test title (the weekly re-check runs `vitest run <file> -t <id>`); the guard test `src/__tests__/quarantineUnit.test.ts` enforces all of this. `QUARANTINE_DISABLED=1 npm test` runs quarantined tests too (used by the weekly job). Both quarantine lists require a `since` date (YYYY-MM-DD) — the weekly report uses it to show how long each item has been quarantined.

## CI/CD

- `ci.yml` is the single gate: typecheck/lint/format, unit tests + coverage, sharded e2e (chromium/firefox/webkit/fake-media/mobile, merged reports), Supabase e2e, and bundle analysis. It runs on PRs, main pushes, a weekly schedule, manual dispatch, and the merge queue (`merge_group` event).
- **Deploys are gated on CI**: the `deploy-pages` / `deploy-hestiacp` / `deploy-vps` jobs live inside `ci.yml` and only run when every verification job passed on a push to `main` — and only when the push changed app files (docs/CI-only pushes skip them via a `compare` of the pushed range). The standalone `deploy-*.yml` workflows are manual-only (`workflow_dispatch`) — use them to deploy without waiting on CI.
- Production-VPS deploys run in the `production` GitHub environment; add protection rules (e.g. required reviewers) there in Settings → Environments if manual approval is wanted.
- **Merge queue**: `ci.yml`, `codeql.yml` and `lighthouse.yml` listen for `merge_group` so their checks run on the merge queue's temporary branch. Enabling the queue is a branch-rule setting — see `docs/BRANCH_PROTECTION.md` → Merge queue.
- **Quarantine Check workflow** (`e2e-quarantine.yml`, weekly + dispatch): unquarantines stable e2e specs and unit tests, proposes quarantining e2e specs **and unit tests** that keep failing, and maintains a single **Flaky test quarantine report issue** (`scripts/flaky-report.py`). The dispatch input `dry_run` reports candidates without opening a PR.
- **Auto-quarantine detection**: `scripts/ci-quarantine-detect.py --kind e2e` (default) scans recent CI runs' `playwright-results` JUnit artifacts; `--kind unit` scans the `unit-results` artifact that the `ci` job uploads (emitted by the junit reporter in `vite.config.ts`). Thresholds: ≥ `--min-failures` (default 3) distinct failed runs AND ≥ `--min-ratio` (default 20%) of examined runs — tune via the dispatch inputs `min_failures`/`window`, or `--min-ratio`/`--days` on the script. Unit candidates are applied by `scripts/apply-unit-quarantine.py`, which appends to `quarantine-unit.json` **and** wraps the `it()` call with the `it.skipIf(isQuarantined('id'))` marker (adding the `isQuarantined` import) — the marker is what actually skips a quarantined test, so a JSON-only entry does nothing. Only regex-safe leaf titles are proposed (titles with quotes/metacharacters need a manual entry); the auto-quarantine PR is a normal PR, so the guard tests validate every proposal before merge.
- **`AUTO_QUARANTINE_TOKEN` secret (recommended)**: the three PR-creating steps in `e2e-quarantine.yml` (unquarantine, unquarantine-unit, auto-quarantine) use `secrets.AUTO_QUARANTINE_TOKEN || secrets.GITHUB_TOKEN`. PRs opened with the plain `GITHUB_TOKEN` do **not** trigger workflow runs — GitHub suppresses events caused by that token — so without this secret the auto-PRs sit with no CI and can never pass the required checks on `main`. Set it to a **fine-grained personal access token** (Settings → Developer settings → Fine-grained tokens):
    - Repository access: **only** `NesiciCoding/RubricMaker`.
    - Permissions (the minimum — nothing else): **Contents → Read and write** (pushes the `ci/unquarantine-*` / `ci/quarantine-*` branches via an `x-access-token` URL) and **Pull requests → Read and write** (creates the PRs).
    - Add it as a repository secret: Settings → Secrets and variables → Actions → `AUTO_QUARANTINE_TOKEN`.
    - Behavior: when set, auto-PRs run CI like any normal PR. When unset or expired, the workflow silently falls back to `GITHUB_TOKEN` — the PR is still created but its checks never start; close & reopen it to kick CI. Fine-grained PATs expire (max 1 year), so budget a calendar reminder or the automation will silently stop triggering checks.

## Directory structure

```
src/
  context/        React contexts (state): AppContext, ToastContext, MobileMenuContext
  store/          localStorage + Supabase persistence wrapper (storage.ts is the single write point)
  services/       External integrations — services/database/ (Supabase adapters, StorageSync, lazyDb),
                  services/logging/ (client logger), standardsApi, cambridgeApi, mediaStore
  utils/          Pure business logic (grade calc, CEFR/placement/mastery aggregation, sync merge, export, etc.)
  hooks/          Custom React hooks
  components/     Reusable UI, grouped by domain (CEFR, Editor, Essay, Flashcards, Tests, Vocabulary,
                  Monitor, Recordings, Standards, Students, Statistics, auth, ui, Modals, Layout, ...)
  pages/          Route-level page components (lazy-loaded by React Router)
  data/           Static reference data (CEFR descriptors, templates)
  types/          Domain model types
  locales/        i18n JSON files (en, nl, fr, de, es) + a key-parity test
supabase/
  migrations/     SQL migrations (numbered, sequential) — see supabase/CLAUDE.md
  functions/      Edge functions (Deno)
e2e/
  specs/          Playwright test specs
  pages/          Page Object Model classes
  fixtures/       Shared fixtures, data factories, storage helpers
```

## Environment variables

```bash
VITE_SUPABASE_URL=       # optional — Supabase project URL
VITE_SUPABASE_ANON_KEY=  # optional — public anon key
```

When both are unset, all sync is disabled and the app runs fully offline. `.env.docker.example`, `.env.observability.example`, and `.env.production.example` are for the Docker/self-hosted deployment stack (Caddy, backups, Loki/Promtail/Grafana), not the frontend build — see `docs/` and the README's Deployment section rather than this file for those.

## Deployment

| Method         | Notes                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| Static hosting | `npm run build` → deploy `dist/`. GitHub Pages, Netlify, Vercel, SharePoint all work. |
| Docker         | `docker-compose.yml` includes frontend + Supabase. Caddy handles HTTPS.               |
| Traditional    | Apache/Nginx configs in `deploy/`. HestiaCP and Virtualmin guides in repo root.       |

The build uses `base: './'` in `vite.config.ts` so the app works from any sub-path without server-side routing config.

## Documentation maintenance

When you add, change, or remove any user-facing functionality, you **must** update all three of the following in the same task — not as a follow-up:

### 1. `src/pages/DocsPage.tsx` (in-app docs)

The docs page is the primary user-facing reference. For any feature change:

- **New feature** — add it to the relevant tab (`RubricsTab`, `GradingTab`, `CefrTab`, `EssaysTab`, `AnalyticsTab`, `DataTab`, or `GettingStartedTab`). Include what the feature does, how to reach it, and any relevant notes for teachers or students.
- **New route** — add an entry to the `ROUTE_TREE` array in `RouteMapTab` with the correct `path`, `label`, `description`, `color`, and optional `badge` (`'Public'`, `'Student'`, `'Admin only'`). Nest it under its parent node if applicable.
- **Removed feature** — delete or update the corresponding entry.

### 2. `README.md` (developer/deployment reference)

- Keep the **Routes** table in sync with `App.tsx`. Add or remove rows when routes change.
- Update the **Features** section if a major capability is added or significantly changed.
- Update **Key utility modules** if new utility files are introduced.

### 3. `src/pages/LandingPage.tsx` (public landing page)

The landing page's feature grid targets both teachers and students. Update it when:

- A significant new teacher feature is added → update or add a card in `TEACHER_FEATURES`.
- A significant new student-facing feature is added → update or add a card in `STUDENT_FEATURES`.
- A feature is removed → remove the corresponding card.

Keep card descriptions short (one sentence, no jargon) and written from the user's perspective.

---

## Key utility modules

Non-exhaustive — pointers to the modules most likely to matter across files. For the complete, currently-maintained list see README.md's "Key utility modules" table (kept in sync per the documentation-maintenance rule above).

| File                                                                  | Purpose                                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/utils/gradeCalc.ts`                                              | Score aggregation and weighted scoring engine                                                         |
| `src/utils/cefrStudentAggregator.ts`                                  | CEFR level computation across assessments                                                             |
| `src/utils/syncMerge.ts` / `syncDiff.ts`                              | Cloud/local conflict resolution (last-write-wins) and collection diffing — see the Storage rule above |
| `src/utils/placementRouting.ts` / `placementResult.ts`                | Placement-test section routing and provisional CEFR estimate                                          |
| `src/utils/masteryProfileAggregator.ts` / `learningPathAggregator.ts` | Cross-domain grammar mastery and rule-based (no AI) learning-path recommendations                     |
| `src/utils/globalSearch.ts`                                           | Token-aware (`type:`/`class:`/`year:`/`track:`) app-wide search                                       |
| `src/utils/docxExport.ts` / `docxTemplateExport.ts` / `pdfExport.ts`  | Export generation (raw and mail-merge DOCX, PDF)                                                      |
| `src/utils/textExtraction.ts`                                         | OCR (Tesseract) + DOCX parsing (Mammoth)                                                              |
| `src/utils/flashcardScheduler.ts`                                     | Thin `ts-fsrs` wrapper (FSRS spaced repetition)                                                       |
| `src/services/standardsApi.ts`                                        | Common Standards Project API (CCSS, NGSS)                                                             |
