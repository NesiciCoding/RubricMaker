# Rubric Maker

A comprehensive, offline-first rubric creation and grading tool built with React and TypeScript. Designed for educators who need to design complex rubrics, grade students efficiently, and analyse performance — including language proficiency tracking aligned to the Common European Framework of Reference (CEFR).

## Features

### 1. Rubric Builder

- **Flexible structure**: Create rubrics with custom criteria and performance levels.
- **Scoring modes**: Total Points (raw score), Weighted Percentage, and Single-Point Rubric.
- **Advanced level options**: sub-item checklists within a level, point ranges (min/max), and score modifiers.
- **Standards integration**: Link criteria to CCSS, NGSS, and other state/national standards via the Common Standards Project API.
- **CEFR descriptors**: Attach CEFR Can-Do statements to individual criteria.
- **Framework descriptors**: Link criteria to IB Learner Profile attributes or Bloom's Taxonomy levels.
- **Grammar linker**: Tag criteria with English grammar standards grouped by topic (e.g. Past Simple → regular/irregular verbs), each with a CEFR level (levels follow the CEFR-J Grammar Profile). Linked grammar is auto-checked in scanned essays during grading — a per-criterion pass/fail breakdown that can be applied as a comment (rule/NLP-based detection, no AI).
- **Rubric versioning**: Automatic snapshots on save; restore any previous version.
- **Tests & quizzes**: Build multiple-choice, multiple-response (select all that apply), true/false, short-answer, open, fill-the-gap (with optional dropdown), matching, ordering, categorize, and hot text tests with a duration, optional Safe Exam Browser requirement, and grade scale. Link standards and CEFR descriptors per question, then assign tests to a class — each student gets a unique share link. Every question type has an in-context help button explaining how to author and answer it.
- **Test summary export**: From a test's Results panel, export a PDF or Word summary for one student or the whole class with per-question accuracy and a strong/developing/weak breakdown by linked standard or CEFR descriptor.
- **Live monitoring**: While a test or essay is in progress (cloud sync enabled), watch a live presence/progress view per student — response grid for tests, live word count and draft preview for essays, plus advisory proctoring flags (tab switches, copy/paste, battery, Safe Exam Browser status).
- **Rubric Marketplace**: Publish a rubric for colleagues at your school to browse, clone, and upvote (requires cloud sync and a school).
- **Department sharing**: Mark a rubric (or a Comment Bank item) read-only-visible to every teacher in your school with one toggle — unlike the Marketplace, this shares the live rubric, not a cloned snapshot.
- **Manual reordering**: Drag-to-reorder rubrics, tests, essays, and classes in their respective lists and on the Activity Dashboard (per teacher, persists across reloads).
- **Cohort filtering**: Filter the Rubrics, Tests, and Essays lists by year/track cohort — a student counts as in-cohort via their current class or any past class they've transferred from, so items stay visible to a cohort across a class change.

### 2. Grading Interface

- **Student management**: Manage students and organise them into classes, with Dutch VO track (VMBO/HAVO/VWO) support.
- **Interactive grading**: Click levels, toggle sub-items, or use the slider for point ranges.
- **Score modifiers**: Apply percentage, point, or level adjustments with a reason.
- **Comment Bank**: Tag and insert reusable feedback snippets while grading.
- **Voice grading**: Dictate comments hands-free using speech recognition.
- **Overall feedback**: Add general comments and file attachments per graded rubric.
- **Comparative grading**: Grade two students side-by-side for consistency.
- **Peer review**: Students review each other's work against the same rubric.
- **Peer review analytics**: Compare peer grades against the teacher baseline (consistency and leniency bias per reviewer), a feedback heatmap of which criteria attract the most peer comments, and round-over-round trends.
- **Self-assessment**: Students self-assess against CEFR Can-Do statements.
- **Co-grading & moderation**: Send a graded submission to a colleague for an independent second marking (reuses the peer review screen and math, applied teacher-to-teacher). Disputes above a configurable point threshold surface in a Moderation queue with a per-criterion delta breakdown and a keep/accept resolution.
- **Grading task assignment**: From the Activity Dashboard, batch-assign a class's ungraded submissions for a rubric to a specific colleague; pending tasks list above the grid and clear automatically once graded.

### 3. CEFR & Language Assessment

- **Speaking sessions**: Structured speaking assessments with six pre-built dimensions aligned to Dutch VO CEFR targets (VMBO-BB through VWO). Audio (and, with cloud sync, video) recordings can be attached and play back from the student's portfolio.
- **CEFR overview**: Per-student and whole-class proficiency dashboards showing progress across Reading, Writing, Speaking, and Listening.
- **Student self-assessment**: Students rate themselves against Can-Do descriptors; reflection text is stored alongside teacher scores.
- **Cambridge English exam mapping**: Optional setting shows the Cambridge English Qualification (A2 Key, B1 Preliminary, B2 First, C1 Advanced, C2 Proficiency) alongside CEFR level badges; vocabulary items can be enriched with CEFR level and definition via an optional Cambridge Dictionary API key.
- **Learning paths & interventions**: Rule-based (no AI) rubric recommendations for CEFR skills where a student trails the class average, plus flags for three or more consecutive low scores on the same criterion or CEFR skill — available from each student's profile.

### 4. Essay Writing

- **Dedicated workspace**: A standalone "Essays" section (parallel to Tests) lists every essay assignment, with a builder for the prompt, rubric link, word/time limits, assigning to a class, copying per-student share links, importing submission codes, and a live monitor link.
- **Essay assignments**: Teachers create prompts with optional CEFR-linked rubrics.
- **Rich text editor**: TipTap (ProseMirror) editor with formatting toolbar.
- **Submission codes**: Anonymous essay access via shareable codes — students submit without logging in.
- **Document analysis**: OCR via Tesseract.js and DOCX parsing via Mammoth; vocabulary and grammar checking on uploaded documents.
- **Essay import**: Import student essay text from uploaded DOCX or PDF files.
- **Peer review**: Classmates leave structured feedback on submissions.
- **Essay export**: From the Export page, export a student essay (or several at once) as Markdown, DOCX, or PDF — as separate files or combined into one document — optionally with the rubric grade and grammar/vocabulary analysis attached.

### 5. Analytics & Reporting

- **Statistics dashboard**: Class performance with Average, Median, Highest, and Lowest scores; grade distribution charts; per-criterion performance breakdown. A **Compare** tab lets you select up to 4 classes side-by-side — grouped average bars, per-criterion gap chart, multi-class trend overlay, and a collapsible Insights panel that flags struggling classes, weak criteria, and inter-class divergence.
- **Activity Dashboard**: Grid of every rubric, test, and essay against every class — see submitted/total counts at a glance and take quick actions (link/unlink rubrics, bulk-assign essays, open test builder, assign ungraded students to a colleague, drag-reorder rows). Filter by school year and VO track.
- **Vocabulary Profile dashboard**: Per-class and per-student CEFR vocabulary distribution (A1–C2), aggregated from document analysis results, with CSV export of vocabulary lists filtered by CEFR band.
- **Student profiles**: Individual progress view across all rubrics, CEFR levels, and essays. A **Portfolio** tab shows a unified chronological timeline of grades, speaking sessions, and self-assessments.
- **Overdue tracking**: Highlights students with assignments past due dates.
- **Export options**:
    - **PDF**: Individual student reports or bulk class export.
    - **Word (.docx)**: Raw export or mail-merge templates with field substitution.
    - **CSV**: Raw data for Excel or other gradebooks.
    - **Period report**: Aggregated CEFR progress report for a class over a date range.
    - **Report cards**: A single consolidated DOCX per student combining rubric grades, standards coverage, learning goals, and CEFR overview, with toggleable sections; export one student or batch-export a whole class.

### 6. Student Portal

- **Shareable links**: Each student gets a unique portal link; no login required.
- **View feedback**: Students see their grades, teacher comments, and attached files.
- **Submit essays**: Anonymous essay submission via submission codes.
- **Self-assessment**: Students complete CEFR self-assessments from their portal.

### 7. Customisation & Accessibility

- **Theme bundles**: Six named bundles (Academy, Nature, Midnight, Warm, Slate, Rose) set accent colour, UI font, and export header colour in one click. Eight quick accent-colour presets are also available.
- **WCAG 2.1 AA**: Icon-only buttons carry `aria-label`; tab navigation uses `role="tablist"` / `role="tab"` with `aria-selected`; axe-core audits run in CI on key pages and components.
- **Dyslexia-friendly reading mode**: Optional Settings toggle increases line-height and letter-spacing app-wide for dyslexic readers.
- **In-app help**: A Joyride guided tour runs on first login and can be restarted from Settings. Page-specific tours are available on the Rubric Builder, Statistics, and Export pages via the "Tour this page" button.
- **Global search**: A search icon in the Topbar (or `Ctrl`/`Cmd`+`K` from anywhere) opens a quick search across rubrics, tests, students, classes, and essays, with `type:` and `class:` filter tokens.

### 8. Installation

- **Installable PWA**: RubricMaker can be installed to a device's home screen or desktop (look for the install icon in the browser address bar) for an app-like, browser-chrome-free launch — useful for shared classroom devices. This only affects installability of the static app shell; it does not change the offline-first localStorage data model, and the service worker never caches Supabase API requests (`/rest/`, `/auth/`, `/realtime/`, `/storage/`, `/functions/` paths are always network-only).

### 9. Data Management

- **Offline-first**: All data lives in the browser's `localStorage`. No account required.
- **Cloud sync** (optional): Supabase backend for multi-device access and multi-teacher collaboration. Sync hydrates `localStorage` from Supabase on load and after reconnect; per-record conflicts resolve last-write-wins (newest `updatedAt` wins), and offline edits queued in the pending-sync queue are protected from being clobbered by stale cloud data until they are pushed (see `src/utils/syncMerge.ts`).
- **Backup & restore**: Export the entire dataset to JSON; restore from any prior backup.
- **Admin panel**: School-level management — user roles, onboarding, student anonymisation, data-retention policies.

---

## Documentation

- [HestiaCP setup](docs/HESTIACP_SETUP.md) — shared hosting / cPanel-style VPS
- [Virtualmin setup](docs/VIRTUALMIN_SETUP.md) — Virtualmin VPS deployment
- [Observability on a HestiaCP subdomain](docs/OBSERVABILITY_HESTIACP.md) — Loki/Promtail/Grafana behind a dedicated HTTPS subdomain
- [Grafana dashboards](docs/OBSERVABILITY_DASHBOARDS.md) — what the provisioned dashboards show and how to customize them
- [Magister integration](docs/MAGISTER_INTEGRATION.md) — importing students from Magister SIS
- [Self-hosting operations](docs/SELF_HOSTING_OPS.md) — backup/restore, upgrades, resource sizing, pg_cron setup, troubleshooting

---

## Development

To run the project locally:

1. **Install dependencies**:

    ```bash
    npm install
    ```

2. **Start the development server**:

    ```bash
    npm run dev
    ```

3. Open [http://localhost:5173](http://localhost:5173) in your browser.

**Other useful commands:**

```bash
npm run typecheck    # TypeScript check (run before commits)
npm run lint         # ESLint
npm run test         # Vitest unit tests
npm run coverage     # Coverage report

# Supabase local dev (optional)
npm run db:start     # Start local Supabase stack
npm run db:reset     # Reset and re-apply all migrations
```

---

## Routes

| Path                                        | Page                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/`                                         | Dashboard                                                                                                       |
| `/rubrics`                                  | Rubric list                                                                                                     |
| `/rubrics/new`                              | New rubric                                                                                                      |
| `/rubrics/:id`                              | Rubric builder                                                                                                  |
| `/rubrics/:rubricId/grade/:studentId`       | Grade a student                                                                                                 |
| `/rubrics/:rubricId/peer-review/:studentId` | Peer review view                                                                                                |
| `/peer-analytics/:rubricId`                 | Peer review analytics (consistency, feedback heatmap, reviewer trends)                                          |
| `/rubrics/:rubricId/self-assess/:studentId` | Student self-assessment                                                                                         |
| `/essays`                                   | Essay list                                                                                                      |
| `/essays/new`                               | New essay                                                                                                       |
| `/essays/:teacherKey`                       | Essay builder (prompt, rubric link, assign students, import submissions)                                        |
| `/essays/:teacherKey/monitor`               | Live essay monitor (presence, live word counts, draft preview)                                                  |
| `/speaking/:rubricId/:studentId`            | Speaking session                                                                                                |
| `/grade-comparative/:classId/:rubricId`     | Comparative grading                                                                                             |
| `/marketplace`                              | School rubric marketplace (browse, publish, clone, upvote)                                                      |
| `/tests`                                    | Test list                                                                                                       |
| `/tests/new`                                | New test                                                                                                        |
| `/tests/:id`                                | Test builder                                                                                                    |
| `/tests/:testId/results/:studentTestId`     | Test results, manual grading, and class-average adjustment                                                      |
| `/tests/:testId/monitor`                    | Live test monitor (presence, response grid, proctoring flags)                                                   |
| `/students`                                 | Students list                                                                                                   |
| `/students/:id`                             | Student profile                                                                                                 |
| `/students/:id/cefr-overview`               | Per-student CEFR overview                                                                                       |
| `/students/:id/learning-path`               | Per-student learning path — rule-based rubric recommendations and intervention flags                            |
| `/cefr-overview`                            | Whole-class CEFR overview                                                                                       |
| `/vocabulary`                               | Vocabulary Profile dashboard (CEFR vocabulary distribution per class/student, CSV export)                       |
| `/portal/:studentId`                        | Student portal (public)                                                                                         |
| `/test/:code`                               | Take a test (public, no login — answer questions, optional timer, submit)                                       |
| `/attachments`                              | Attachment manager                                                                                              |
| `/comments`                                 | Comment bank                                                                                                    |
| `/statistics`                               | Statistics dashboard (by-rubric, by-student, multi-class compare with insights)                                 |
| `/activity-dashboard`                       | Activity Dashboard — rubric/test/essay × class grid with link/assign/reorder actions, pending grading-task list |
| `/moderation`                               | Moderation queue — disputed co-graded submissions, per-criterion delta, keep/accept resolution                  |
| `/export`                                   | Export page                                                                                                     |
| `/settings`                                 | Settings                                                                                                        |
| `/admin`                                    | Admin panel (admin role only)                                                                                   |
| `/privacy`                                  | Privacy statement                                                                                               |

---

## Key utility modules

| File                                    | Purpose                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/utils/gradeCalc.ts`                | Score aggregation and weighted scoring engine                                               |
| `src/utils/cefrStudentAggregator.ts`    | CEFR level computation across assessments                                                   |
| `src/utils/learningGoalsAggregator.ts`  | Learning goal progress tracking                                                             |
| `src/utils/docxExport.ts`               | DOCX generation via `docx` library                                                          |
| `src/utils/docxTemplateExport.ts`       | Mail-merge DOCX with field substitution                                                     |
| `src/utils/pdfExport.ts`                | PDF report generation                                                                       |
| `src/utils/textExtraction.ts`           | OCR (Tesseract) + DOCX parsing (Mammoth)                                                    |
| `src/utils/essayShareCode.ts`           | Shareable codes for essay access (no auth needed)                                           |
| `src/utils/pinHash.ts`                  | PIN hashing for student self-assessment locks                                               |
| `src/utils/clozeParse.ts`               | Parses `{{...}}` cloze gap syntax and `[[...]]` hot-text fragment syntax for test questions |
| `src/utils/learningPathAggregator.ts`   | Rule-based rubric recommendations and intervention flagging                                 |
| `src/utils/testSummaryAggregator.ts`    | Per-question/per-skill strong-weak test breakdown                                           |
| `src/utils/reportCardAggregator.ts`     | Composes CEFR, learning-goals, and test-summary data into one report card                   |
| `src/utils/globalSearch.ts`             | Token-aware search (`type:`/`class:` filters) across rubrics, tests, students, classes, essays |
| `src/utils/coGradingModerationQueue.ts` | Flags disputed co-graded submissions (delta above threshold) for the Moderation queue       |
| `src/utils/displayOrder.ts`             | Shared sort/reorder helpers for manually-orderable list views                               |
| `src/utils/cohortAggregator.ts`         | Derives a cohort's student set from current + past class memberships by year/track          |
| `src/services/standardsApi.ts`          | Common Standards Project API (CCSS, NGSS)                                                   |

---

## Deployment

RubricMaker works in two modes:

- **Offline-only** — data lives in the browser's local storage. No server needed. Works on GitHub Pages, SharePoint, or any static host.
- **With database sync** — add an optional Supabase backend for multi-device sync, email login, and rubric sharing between teachers. Hosted on your own infrastructure.

---

### Docker (recommended — includes database sync)

The easiest way to run the full stack. Requires [Docker](https://docs.docker.com/get-docker/).

**Your own laptop or school LAN:**

```bash
cp .env.docker.example .env   # defaults work as-is for localhost
docker-compose up -d --build
```

Open [http://localhost:8080](http://localhost:8080). To make it accessible to other teachers on the network, set `SITE_URL=http://<your-ip>:8080` in `.env` first.

**VPS with a domain name (HTTPS):**

```bash
cp .env.docker.example .env
# Edit .env:
#   DOMAIN=rubricmaker.school.nl
#   SITE_URL=https://rubricmaker.school.nl
#   JWT_SECRET=<random 64-char string>   ← change this!
#   POSTGRES_PASSWORD=<strong password>  ← change this!
docker-compose --profile https up -d --build
```

Caddy obtains a free Let's Encrypt certificate automatically. Open ports 80 and 443 on your firewall.

**Enabling email login (OTP):**

Without SMTP, teachers log in anonymously. To allow email-linked accounts:

```bash
# In .env:
MAILER_AUTOCONFIRM=false
SMTP_HOST=smtp.office365.com   # or smtp.gmail.com, smtp-relay.brevo.com
SMTP_USER=rubricmaker@school.nl
SMTP_PASS=your-app-password

docker-compose up -d --force-recreate auth
```

Teachers receive an 8-digit sign-in code by email. The bundled GoTrue config sends a code-only template (`public/email-templates/otp-code.html`, served by the `app` container at `/email-templates/otp-code.html`) with no clickable confirmation link — some email security scanners (e.g. Microsoft Safe Links) automatically open links in incoming mail, which would consume the one-time token before the teacher can enter the code, causing "Token has expired or is invalid" errors.

**Backup and restore:**

```bash
./scripts/backup.sh              # saves to ./backups/YYYYMMDD_HHMMSS/
./scripts/restore.sh backups/20260515_120000
```

**Updating to a new version:**

```bash
git pull
docker-compose up -d --build    # rebuilds the app image, restarts services
# Migrations run automatically on next startup
```

**Nightly attachment cleanup (recommended):**

Attachment files and their database rows are deleted automatically when they age past the owner's school retention period (default: 7 years for users not linked to a school). Schedule the bundled script with `crontab -e`:

```cron
0 2 * * *  cd /path/to/rubricmaker && ./scripts/delete-old-attachments.sh >> /var/log/rubricmaker-cleanup.log 2>&1
```

The script uses the Storage HTTP API — it does **not** delete rows directly from `storage.objects` (which Supabase blocks). It calls `public.get_overdue_attachments()` to find eligible rows, removes each file via `DELETE /storage/v1/object/attachments/{path}`, then cleans up the metadata rows. A 404 from storage is treated as success so orphaned DB rows are always removed.

On Supabase Cloud, schedule the `delete-old-attachments` edge function instead (see [Supabase Dashboard → Edge Functions](https://supabase.com/dashboard/project/_/functions)).

**Stress-test logging (optional):**

Before a school-wide rollout, you can enable a diagnostic event stream to a
`client_logs` table for both the teacher and student portals — useful for
running a full-class pilot and catching errors or sync failures afterwards.

```bash
# Apply migration 035_client_logs.sql (included with db:reset / docker-compose db_migrate)
# In .env:
VITE_STRESS_TEST_LOGGING=true
docker-compose up -d --build
```

Logged events cover user actions (by type and id only), Supabase sync results
and latency, and JS errors — never free-text content such as essay text,
comments, or grades. Query `client_logs` via the Supabase SQL editor
(`select * from client_logs order by created_at desc`). When the stress-test
window is over, unset `VITE_STRESS_TEST_LOGGING` and rebuild.

---

### Observability (optional, for pilot/stress-test windows)

A standalone Loki + Promtail + Grafana stack for filtering server logs during
a class pilot. Works independently of how RubricMaker itself is deployed —
the combined Docker stack above, or a traditional Apache/Nginx +
HestiaCP/Virtualmin server. Only Docker is required on the host running this
stack.

```bash
cp .env.observability.example .env.observability
# edit RUBRICMAKER_LOG_DIR (and SUPABASE_DB_* if querying client_logs)
docker-compose -f docker-compose.observability.yml --env-file .env.observability up -d
```

Open [http://localhost:3001](http://localhost:3001) (default login `admin` /
`admin`, change via `GRAFANA_ADMIN_PASSWORD`). Grafana is bound to
`127.0.0.1:3001` only — for remote access during a pilot, put it behind a
reverse proxy (see [Observability on a HestiaCP subdomain](docs/OBSERVABILITY_HESTIACP.md)
for a worked example with HTTPS).

Two dashboards are auto-provisioned into a **RubricMaker** folder: "Web &
Container Logs" (Loki — always available) and "Client Diagnostics
(`client_logs`)" (Postgres — populated when `SUPABASE_DB_*` and
`VITE_STRESS_TEST_LOGGING=true` are set). See
[Grafana dashboards](docs/OBSERVABILITY_DASHBOARDS.md) for what each panel
shows and how to customize them.

**Log sources:**

- **Web server logs** — Promtail scans `RUBRICMAKER_LOG_DIR` for
  `*access*.log` / `*error*.log` files. Set it to your panel's log directory:
  `/var/log/virtualmin` (Virtualmin), `/var/log` (HestiaCP — per-domain logs
  under `/var/log/apache2/domains/` or `/var/log/nginx/domains/`).
- **Combined Docker stack containers** — Promtail also scrapes container
  stdout/stderr for the `rubricmaker` compose project directly (no extra
  config needed); `docker/nginx.prod.conf` writes access/error logs to
  stdout/stderr for this.
- **`client_logs` table** (see "Stress-test logging" above) — set
  `SUPABASE_DB_HOST`/`SUPABASE_DB_NAME`/`SUPABASE_DB_USER`/`SUPABASE_DB_PASSWORD`
  to provision a Postgres datasource in Grafana for querying app-level events.
  This is the one log source available regardless of deployment style,
  including managed Supabase Cloud projects.
- **Managed Supabase Cloud** — there are no local containers/files for the
  Supabase services themselves; use the Supabase dashboard's Log Explorer for
  those. This stack still covers your web server logs and `client_logs`.

---

### Static hosting (offline mode only)

No database sync — all data stays in the browser. Works on any static host.

**Build:**

```bash
npm run build   # output in dist/
```

Deploy the `dist/` folder to GitHub Pages, Vercel, Netlify, or any web server.

**SharePoint:**

1. Run `npm run build`
2. In `dist/`, rename `index.html` → `index.aspx`
3. Upload the entire `dist/` folder to a SharePoint Document Library
4. Click `index.aspx` to launch

> For Standards Integration on SharePoint, add the SharePoint domain to your Common Standards Project API key's allowed origins.
