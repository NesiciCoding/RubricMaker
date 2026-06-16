# RubricMaker — Claude Code Guide

## Project overview

RubricMaker is an **offline-first** rubric and grading application for teachers. All data lives in browser `localStorage`; an optional Supabase backend provides cloud sync and multi-device access. The app targets static hosting (no server required in offline mode) and can also be self-hosted with Docker.

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
npm run build        # Production build → dist/
npm run typecheck    # tsc --noEmit (run before commits)
npm run lint         # ESLint check
npm run format       # Prettier
npm test             # Vitest unit tests (watch mode)
npm run coverage     # Coverage report (thresholds: 50% lines/statements)

# Supabase local dev
npm run db:start     # Start local Supabase stack
npm run db:stop      # Stop it
npm run db:reset     # Reset and re-apply all migrations
```

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript 6 (strict) |
| Build | Vite 8 |
| Routing | React Router v7 (lazy-loaded pages) |
| State | React Context (`AppContext`) + `useReducer` |
| Persistence | `localStorage` primary; Supabase optional sync |
| Rich text | TipTap 3 (ProseMirror) |
| Charts | Recharts |
| Export | `docx`, `pdfjs-dist`, `file-saver` |
| OCR | Tesseract.js |
| i18n | i18next (EN, NL, FR, DE, ES) |
| Auth | Supabase Auth (email OTP) — optional |
| Tests | Vitest + Testing Library |

## Architecture

### Data flow

```
User action → AppContext dispatch → useReducer → new state
                                               → storage.ts (localStorage write)
                                               → StorageSync (optional Supabase write)
```

`src/store/storage.ts` is the single write point for persistence. Never write to `localStorage` directly from components or hooks.

### Offline-first rule

LocalStorage is always the source of truth. Supabase is an **optional sync layer** — the app must work completely without it. The `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars are optional; if absent, all database sync is silently skipped.

### State management

All app state lives in `AppContext` (`src/context/AppContext.tsx`). Pages and components consume it via `useContext(AppContext)`. Do not introduce Redux, Zustand, or any other state library — the existing pattern is intentional.

Secondary contexts: `ToastContext` (notifications), `MobileMenuContext` (nav state).

### Routing

Pages are lazy-loaded from `src/pages/`. Key routes:

| Path | Page |
|---|---|
| `/` | LandingPage |
| `/rubrics` | RubricList |
| `/rubrics/:id` | RubricBuilder |
| `/rubrics/:id/grade/:studentId` | GradeStudent |
| `/grade-comparative/:classId/:rubricId` | ComparativeGrading |
| `/students` | StudentsPage |
| `/students/:id` | StudentProfilePage |
| `/students/cefr-overview` | StudentCefrOverviewPage |
| `/statistics` | StatisticsPage |
| `/export` | ExportPage |
| `/settings` | SettingsPage |

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

Write no comments unless the *why* is non-obvious. Never describe what the code does; the identifiers do that.

### Testing

- Unit tests live alongside the file they test (`foo.ts` → `foo.test.ts`) or in a `__tests__/` subdirectory.
- Use `src/test-utils/renderWithProviders.tsx` to render components that need context.
- Do not mock `localStorage` globally; tests use the jsdom implementation.
- Keep coverage above the thresholds: 50% lines/statements, 37% functions/branches.

## Directory structure

```
src/
  context/        React contexts (state)
  store/          localStorage + Supabase persistence wrapper
  services/       External integrations (Supabase adapters, Standards API)
  utils/          Pure business logic (grade calc, CEFR aggregation, export, etc.)
  hooks/          Custom React hooks
  components/     Reusable UI (modals, editor, charts, CEFR, layout, auth)
  pages/          Route-level page components
  data/           Static reference data (CEFR descriptors, templates)
  types/          Domain model types
  locales/        i18n JSON files (en, nl, fr, de, es)
supabase/
  migrations/     SQL migrations (numbered, sequential)
  functions/      Edge functions (Deno)
```

## Environment variables

```bash
VITE_SUPABASE_URL=       # optional — Supabase project URL
VITE_SUPABASE_ANON_KEY=  # optional — public anon key
```

When both are unset, all sync is disabled and the app runs fully offline.

## Deployment

| Method | Notes |
|---|---|
| Static hosting | `npm run build` → deploy `dist/`. GitHub Pages, Netlify, Vercel, SharePoint all work. |
| Docker | `docker-compose.yml` includes frontend + Supabase. Caddy handles HTTPS. |
| Traditional | Apache/Nginx configs in `deploy/`. HestiaCP and Virtualmin guides in repo root. |

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

| File | Purpose |
|---|---|
| `src/utils/gradeCalc.ts` | Score aggregation and weighted scoring engine |
| `src/utils/cefrStudentAggregator.ts` | CEFR level computation across assessments |
| `src/utils/learningGoalsAggregator.ts` | Learning goal progress tracking |
| `src/utils/docxExport.ts` | DOCX generation via `docx` library |
| `src/utils/docxTemplateExport.ts` | Mail-merge DOCX with field substitution |
| `src/utils/pdfExport.ts` | PDF report generation |
| `src/utils/textExtraction.ts` | OCR (Tesseract) + DOCX parsing (Mammoth) |
| `src/utils/essayShareCode.ts` | Shareable codes for essay access (no auth needed) |
| `src/utils/pinHash.ts` | PIN hashing for student self-assessment locks |
| `src/utils/clozeParse.ts` | Parses `{{...}}` cloze gap syntax and `[[...]]` hot-text fragment syntax for test questions |
| `src/services/standardsApi.ts` | Common Standards Project API (CCSS, NGSS) |
