# Export page redesign

**Status:** Mockup for review. Nothing wired up yet.
**Mockup:** the exploratory HTML mockup (self-contained, light/dark, desktop and phone) was used for review and is not committed — `docs/mockups/` is gitignored apart from the test-creator spec.
**Route:** `/export` (`src/pages/ExportPage.tsx`)

## Why

The export page grew one section at a time. Today it is a stack of six collapsible cards (all closed on load), each with its own form, repeated student lists and repeated primary buttons:

1. **No entry point.** Everything is collapsed on arrival, so the page opens as six headers and no visible task. The UX audit already flagged this (#201): "four stacked dense forms on one page is a lot of vertical scroll".
2. **Export type is buried.** "Rubric grades", "exam booklet", "essays", "period report" and "report card" are peers, but nothing presents them as a choice — the teacher has to know which card to open.
3. **Duplicate pickers.** The rubric student table and the period/report-card class + student pickers do the same job in two different visual languages (table checkboxes vs. name buttons).
4. **Actions float in the middle of long forms.** The PDF/DOCX buttons sit above the table; the report buttons sit at the bottom of a collapsed card. There is no consistent "here is what will be produced" bar.
5. **Dense chrome wins over content.** Preset selects, decimal selects, template selects, orientation, padding and bulk actions are all expanded at once, even when only one output is being made.

## Proposed design — "one output at a time"

The page becomes a **type chooser + one workbench**, instead of six stacked accordions.

### 1. Context strip

A short header states what the page can see: the term summary (graded grades, classes, saved templates). It replaces the missing orientation the collapsed accordions caused. No new data — counts already computed today.

### 2. Export type chooser

Four large, selectable cards, one active at a time:

| Type             | Replaces                       | What it makes                                  |
| ---------------- | ------------------------------ | ---------------------------------------------- |
| Rubric grades    | Rubric Export + Students + CSV | PDF/DOCX per student, CSV gradebook            |
| Progress reports | Period Report + Report Card    | DOCX period report or consolidated report card |
| Exam booklets    | Exam Booklet                   | Exam paper, attachments, grading key           |
| Essays           | Essay Export                   | PDF/DOCX/Markdown submissions, `.ics`          |

Active card = accent border + soft accent surface + `aria-pressed`. This is the whole navigation model: no collapsed-by-default sections, no hunting.

### 3. Workbench

For the active type, a single card with three zones:

- **Header** — title, one-line description, the output's key state (e.g. "18 graded with this rubric").
- **Body** — two columns on desktop:
    - **Source & options** (left, wider): rubric + class scope, then one clearly labelled row per output: "Word document", "Spreadsheet", with its own options and its own secondary action.
    - **Students** (right): the shared picker pattern — search, select all/clear, scrollable checklist with name, class, grade chip and score. Reused visually by rubric grades and progress reports.
- **Sticky footer** — what is selected, bulk actions (mark not handed in / add comment) and the primary export action with the live count. The primary button never scrolls out of view.

### 4. Progress reports merge

Period Report and Report Card are the same operation with different sections, sharing one class + date-range + student picker. They become one workbench with a `Period report | Report card` segmented toggle. The report-card section checkboxes appear only in report-card mode; the period label and date range stay shared. This removes a duplicated picker and a duplicated "uses the picker above" explanation.

### 5. States

- **Nothing selected:** footer primary disabled with "Select students to export"; students panel explains what is selectable.
- **No grades / no rubric:** the workbench body is one empty state with the next action (e.g. "Open grading queue"), not a disabled button at the bottom of a hidden section.
- **Selection > 0:** footer gains the bulk actions and the counts update in the type card, the header and the button label.
- **Busy:** the active export button shows a loader and the rest of the footer's actions disable together.

### 6. Mobile

- Type chooser stays a 2-column grid, with compact cards (icons and titles, descriptions hidden) down to 360px.
- Workbench columns stack: source/options first, students second.
- Footer becomes a full-width sticky bar with the count beside the primary button; bulk actions collapse into the same bar above it.
- Students list caps at ~7 visible rows with its own scroll, so the footer stays reachable.
- 44px minimum targets on chips, checkboxes and row actions.

## What stays the same

Every export, option and side action is preserved: Word template picker + sample download, CSV gradebook presets and decimal separator, class scope from `?class=`, feedback-only/anchor badges, per-row PDF, copy feedback link, dev preview link, pad-for-double-sided and orientation, mark-not-handed-in and bulk comment, test select and the existing `ExamBookletExportPanel`, essay format/batch/analysis and `.ics`, period date range + label, report-card sections, single and batch report cards, the export tour, audit logging and all toasts.

No data model, storage or export-generation changes. This is a layout + interaction redesign of one page plus its CSS/i18n/test updates.

## Implementation outline (after sign-off)

1. Add the chooser and workbench structure to `ExportPage.tsx`, keeping the existing handlers and state; move the rubric student list and period picker into shared presentational pieces.
2. Add a small set of `export-*` classes in `src/index.css` for the chooser, workbench, student rows and footer (the page currently uses inline styles for this chrome).
3. Add new keys to all five locales (en/nl/fr/de/es); keep existing keys where the copy is unchanged.
4. Update `ExportPage` unit tests and the export Page Object Model/e2e selectors; add coverage for type switching, the report-card toggle and empty states. Run `npm run typecheck`, `npm test -- src/pages/__tests__/ExportPage.test.tsx`, `npm run lint`.
5. Update `DocsPage`'s Data tab, README routes/features and the landing feature card only if the copy actually changes.

## Open questions for the feedback round

1. **Single active type vs. all four visible?** Proposed: one active workbench (fast to scan, no state loss). Alternative: a page with four cards and all panels below it.
2. **Merge Period Report + Report Card?** Proposed: yes, via the output toggle. Alternative: keep them separate to avoid moving report-card settings.
3. **Students always visible in the rubric workbench?** Proposed: yes, as the right column. Alternative: a "Choose students" drawer so the source card gets full width.
4. **Card chooser vs. left rail?** Proposed: cards; a 260px rail was the other shortlisted direction.
