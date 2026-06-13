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
- **Rubric versioning**: Automatic snapshots on save; restore any previous version.
- **Tests & quizzes**: Build multiple-choice, short-answer, and open-question tests with a duration, optional Safe Exam Browser requirement, and grade scale. Link standards and CEFR descriptors per question, then assign tests to a class — each student gets a unique share link.
- **Live monitoring**: While a test or essay is in progress (cloud sync enabled), watch a live presence/progress view per student — response grid for tests, live word count and draft preview for essays, plus advisory proctoring flags (tab switches, copy/paste, battery, Safe Exam Browser status).

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

### 3. CEFR & Language Assessment

- **Speaking sessions**: Structured speaking assessments with six pre-built dimensions aligned to Dutch VO CEFR targets (VMBO-BB through VWO). Audio (and, with cloud sync, video) recordings can be attached and play back from the student's portfolio.
- **CEFR overview**: Per-student and whole-class proficiency dashboards showing progress across Reading, Writing, Speaking, and Listening.
- **Student self-assessment**: Students rate themselves against Can-Do descriptors; reflection text is stored alongside teacher scores.
- **Cambridge English exam mapping**: Optional setting shows the Cambridge English Qualification (A2 Key, B1 Preliminary, B2 First, C1 Advanced, C2 Proficiency) alongside CEFR level badges; vocabulary items can be enriched with CEFR level and definition via an optional Cambridge Dictionary API key.

### 4. Essay Writing
- **Essay assignments**: Teachers create prompts with optional CEFR-linked rubrics.
- **Rich text editor**: TipTap (ProseMirror) editor with formatting toolbar.
- **Submission codes**: Anonymous essay access via shareable codes — students submit without logging in.
- **Document analysis**: OCR via Tesseract.js and DOCX parsing via Mammoth; vocabulary and grammar checking on uploaded documents.
- **Essay import**: Import student essay text from uploaded DOCX or PDF files.
- **Peer review**: Classmates leave structured feedback on submissions.

### 5. Analytics & Reporting
- **Statistics dashboard**: Class performance with Average, Median, Highest, and Lowest scores; grade distribution charts; per-criterion performance breakdown.
- **Vocabulary Profile dashboard**: Per-class and per-student CEFR vocabulary distribution (A1–C2), aggregated from document analysis results, with CSV export of vocabulary lists filtered by CEFR band.
- **Student profiles**: Individual progress view across all rubrics, CEFR levels, and essays. A **Portfolio** tab shows a unified chronological timeline of grades, speaking sessions, and self-assessments.
- **Overdue tracking**: Highlights students with assignments past due dates.
- **Export options**:
  - **PDF**: Individual student reports or bulk class export.
  - **Word (.docx)**: Raw export or mail-merge templates with field substitution.
  - **CSV**: Raw data for Excel or other gradebooks.
  - **Period report**: Aggregated CEFR progress report for a class over a date range.

### 6. Student Portal
- **Shareable links**: Each student gets a unique portal link; no login required.
- **View feedback**: Students see their grades, teacher comments, and attached files.
- **Submit essays**: Anonymous essay submission via submission codes.
- **Self-assessment**: Students complete CEFR self-assessments from their portal.

### 7. Customisation & Accessibility

- **Theme bundles**: Six named bundles (Academy, Nature, Midnight, Warm, Slate, Rose) set accent colour, UI font, and export header colour in one click. Eight quick accent-colour presets are also available.
- **WCAG 2.1 AA**: Icon-only buttons carry `aria-label`; tab navigation uses `role="tablist"` / `role="tab"` with `aria-selected`; axe-core audits run in CI on key pages and components.

### 8. Data Management

- **Offline-first**: All data lives in the browser's `localStorage`. No account required.
- **Cloud sync** (optional): Supabase backend for multi-device access and multi-teacher collaboration. Sync hydrates `localStorage` from Supabase on load and after reconnect; per-record conflicts resolve last-write-wins (newest `updatedAt` wins), and offline edits queued in the pending-sync queue are protected from being clobbered by stale cloud data until they are pushed (see `src/utils/syncMerge.ts`).
- **Backup & restore**: Export the entire dataset to JSON; restore from any prior backup.
- **Admin panel**: School-level management — user roles, onboarding, student anonymisation, data-retention policies.

---

## Documentation

- [HestiaCP setup](docs/HESTIACP_SETUP.md) — shared hosting / cPanel-style VPS
- [Virtualmin setup](docs/VIRTUALMIN_SETUP.md) — Virtualmin VPS deployment
- [Magister integration](docs/MAGISTER_INTEGRATION.md) — importing students from Magister SIS

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

| Path | Page |
|---|---|
| `/` | Dashboard |
| `/rubrics` | Rubric list |
| `/rubrics/new` | New rubric |
| `/rubrics/:id` | Rubric builder |
| `/rubrics/:rubricId/grade/:studentId` | Grade a student |
| `/rubrics/:rubricId/peer-review/:studentId` | Peer review view |
| `/peer-analytics/:rubricId` | Peer review analytics (consistency, feedback heatmap, reviewer trends) |
| `/rubrics/:rubricId/self-assess/:studentId` | Student self-assessment |
| `/essays/:assignmentId/monitor` | Live essay monitor (presence, live word counts, draft preview) |
| `/speaking/:rubricId/:studentId` | Speaking session |
| `/grade-comparative/:classId/:rubricId` | Comparative grading |
| `/tests` | Test list |
| `/tests/new` | New test |
| `/tests/:id` | Test builder |
| `/tests/:testId/results/:studentTestId` | Test results, manual grading, and class-average adjustment |
| `/tests/:testId/monitor` | Live test monitor (presence, response grid, proctoring flags) |
| `/students` | Students list |
| `/students/:id` | Student profile |
| `/students/:id/cefr-overview` | Per-student CEFR overview |
| `/cefr-overview` | Whole-class CEFR overview |
| `/vocabulary` | Vocabulary Profile dashboard (CEFR vocabulary distribution per class/student, CSV export) |
| `/portal/:studentId` | Student portal (public) |
| `/test/:code` | Take a test (public, no login — answer questions, optional timer, submit) |
| `/attachments` | Attachment manager |
| `/comments` | Comment bank |
| `/statistics` | Statistics dashboard |
| `/export` | Export page |
| `/settings` | Settings |
| `/admin` | Admin panel (admin role only) |
| `/privacy` | Privacy statement |

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
