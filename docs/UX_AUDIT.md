# RubricMaker UX Audit — Desktop & Tablet Pass

**Date:** 27 June 2026
**Method:** Every reachable teacher and student view, walked at desktop (1280×900) and tablet (1024×800) widths, with a realistic dataset loaded via the new dev-only "Load sample data" button (Settings → Administration, `src/utils/seedDemoData.ts`) — 3 classes, 27 students, 6 rubrics (mixed scoring modes, CEFR-tagged across 4 skills), graded submissions, a co-grading dispute, 2 tests with submissions, 2 essay assignments, and comment-bank snippets.

**Scope note:** Marketplace requires a live Supabase connection + school membership, so it only renders its disabled state offline — assessed from code instead. Vocabulary Dashboard needs analysed documents (OCR'd text), which isn't worth faking — only its clean empty state was checked. The four student share-code pages (`/essay/:code`, `/test/:code`, `/feedback/:code`, `/preview/:code`) require a generated code from a teacher-side modal that didn't navigate in the headless preview tool — assessed from source review instead of fresh screenshots.

This is a diagnostic pass only — nothing here has been implemented. Every finding below is tracked as its own GitHub issue, indexed in [#201](https://github.com/NesiciCoding/RubricMaker/issues/201).

---

## Cross-cutting patterns (read this first)

These showed up on multiple views and are worth fixing once rather than per-page.

1. **Repeated per-student-row tables are the app's biggest clutter source.** `StudentsPage`, `StatisticsPage`'s Criterion Heat Map + Student Scores table, and `CefrOverviewPage`'s class matrix all give every student their own row, often with repeated controls per row (Students page repeats *six* full-width "Grade: <rubric name>" pill buttons per student, truncated to illegibility). At 27 students this is already a lot of vertical scroll with low information density per pixel.
2. **Two-tier nav rail mis-highlights on routes outside the six domains.** `Sidebar.tsx`'s `activeDomain` lookup falls back to `domains[0]` (Overview) whenever the current path doesn't match any domain's `matchPrefixes` — which is every dynamic grading/session route: `/rubrics/:id/grade/:studentId`, `/rubrics/:id/peer-review/:studentId`, `/rubrics/:id/self-assess/:studentId`, `/speaking/:rubricId/:studentId`, `/grade-comparative/:classId/:rubricId`, `/peer-analytics/:rubricId`, plus the footer pages `/settings`, `/docs`, `/admin`, `/privacy`. On all of these the rail shows "Overview" highlighted, which is wrong and momentarily disorients wayfinding (am I still in Grading? Did my click register?).
3. **Tablet-width (1024px) column clipping shows up repeatedly, with no horizontal-scroll affordance.** RubricBuilder's 4-level criterion grid clips the 4th column and its own toolbar overflows; `ComparativeGrading`'s 3-column layout (attachments | comparison | attachments) clips the right attachments panel; `CefrOverviewPage`'s 38-column table (Student + 6 skills × 6 CEFR levels + Detail) loses the student-name column entirely once scrolled, since nothing is sticky. None of these show a scrollbar or fade-edge hint that there's more content sideways.
4. **Low-contrast, truncated pill buttons.** The Students page's per-rubric "Grade: …" pills are a pale mint that's hard to read against the cream background, and truncate before the rubric name is recognisable. Worth a contrast pass plus either shortening labels or widening the column.
5. **Text where the design intent was a progress bar.** Essays cards show "Submitted: 0/3" as plain text; a thin progress bar (as already used in Activity Dashboard's matrix cells) would read faster at a glance across a list of essay assignments.
6. **What's already working well, app-wide:** the Warm Scholar palette and CEFR badge colour scale read consistently across every page; the sticky grading footer (score/letter/anchor/feedback-only/next-student) is a genuinely good pattern; "Collapse all" in RubricBuilder's criterion editor is a smart density control that more pages could borrow; the new Reconcile/Nudge/CEFR-evidence features from this session's earlier work render correctly and fit the existing visual language without looking bolted-on.

---

## Overview domain

### Dashboard (`/`)
**Strengths**
- Four colour-coded stat tiles (rubrics, students, grades submitted) give an instant pulse-check.
- "At-Risk Students" banner surfaces real names directly — a good throughline into grading without a separate query.
- Recent Activity feed + Quick Actions + Quick Start Templates is a sensible "everything you need to start the day" layout.

**Improvements**
- Recent Activity is a flat list with no grouping by date ("Today" / "Yesterday") — at high activity volume this will get long fast.
- At-Risk Students banner has no direct per-student action (e.g. "Message" or "Open profile") beyond implicit click-through — worth confirming it's clickable, and if so, making that more visually obvious (cursor affordance, chevron).

### Activity Dashboard (`/activity-dashboard`)
**Strengths**
- The assessments × classes matrix is genuinely the strongest table in the app: compact status pills ("9/9 · Live"), an "Assign" shortcut inline per cell, and it scales cleanly to tablet width without clipping.
- Track/class filter is simple and sits in an obvious place.

**Improvements**
- Tests and Essays sections reuse the same matrix pattern but with different status semantics ("Open" vs "Live") — a one-line legend would help a new user parse the difference at a glance.
- No timeline/list alternative view despite "Activity" being in the name — could pair the matrix with the chronological feed style already used on Dashboard.

---

## Assessments domain

### Rubrics (`/rubrics`)
**Strengths**
- Card view is information-dense in a good way: subject, criteria/levels count, students-graded count, CEFR badge, and three clear actions (Edit/Grade/Compare) all visible without opening the card.
- Search + subject filter + track filter covers the realistic filtering needs of a teacher with many rubrics.

**Improvements**
- At tablet width (1024px), the card grid wraps inconsistently — the first two rows render one card per row while later rows render two, producing a visually uneven layout (not a fixed 2-column grid at this breakpoint; worth checking the grid's `minmax()` value against actual card content width).
- No bulk action (e.g. select multiple rubrics to archive/export) — for a teacher with 20+ rubrics by end of year this will matter.
- The doc-referenced "Cards/List toggle" doesn't appear to exist in the current UI — worth deciding whether to add it or drop the idea, since right now cards are the only view.

### Rubric editor (`/rubrics/:id`, Form View)
**Strengths**
- "Collapse all" on the criterion list is exactly the right density control for a rubric with many criteria.
- Each level card bundles min/max points, description, and a CEFR-level chip row in one place — good locality of related fields.

**Improvements**
- **Tablet clipping (confirmed):** at 1024px the 4th level column in a 4-level criterion is cut off, and the top toolbar (Format/Preview/Export/History/Tour) overflows past the visible area with no wrap or scroll indicator. This is the single worst tablet regression found in the audit.
- Each level repeats the full A1–C2 CEFR chip row (6 chips × 4 levels = 24 chips per criterion) even though typically only one chip per level is ever selected — a single-select dropdown or compact segmented control per level would cut visual noise substantially.
- "Link Learning Goal / Standard" and "Link Descriptor" sit as plain text links above the level grid with no visual separation from the CEFR skill dropdown — easy to miss.

### Grade Student (`/rubrics/:id/grade/:studentId`)
**Strengths**
- The sticky footer (grade/letter, points/criteria-done, feedback-only + anchor checkboxes, prev/next student, Save) is the best piece of chrome in the app — every relevant control in one place, always visible.
- Per-criterion fine-tune points slider (already shipped) gives granularity beyond the 4 discrete levels without adding a separate field.
- Renders correctly at tablet width — the 4-level grid here does *not* clip, unlike the same pattern in the rubric editor (worth porting whatever layout approach this view uses back to RubricBuilder).

**Improvements**
- Top toolbar ("Start Voice Assistant / All linked classes / Attachments / Essay / Import…") truncates the last item at tablet width — same overflow issue as the rubric editor's toolbar, just less severe.
- Comment composer/bank-chip affordance per criterion is a small icon with no visible label — easy to miss its existence on first use.

### Comparative Grading (`/grade-comparative/:classId/:rubricId`)
**Strengths**
- The "A Better / Equal / B Better" three-way per-criterion control is a clean, fast way to do qualitative pairwise comparison without forcing numeric scores.
- Match-count and per-student-limit indicators at the top set expectations well.

**Improvements**
- **Tablet clipping (confirmed):** the 3-column layout (Attachments | criteria comparison | Attachments) doesn't fit at 1024px landscape — the right-hand Attachments panel is clipped with no scroll affordance. `index.css` already has a portrait-specific single-column reflow for this page; it needs a landscape/1024px rule too.
- Both side Attachments panels show "No attachments uploaded" by default and take up roughly a third of the screen each even when empty — collapsing empty attachment panels (or making them a toggle) would free real estate for the actual comparison content.

### Tests (`/tests`)
**Strengths**
- Card metadata (question count, points, date) is exactly what's needed to identify a test at a glance.

**Improvements**
- Each card stacks five full-width action buttons (Edit / Assign / Results / Import / Monitor) — that's a lot of repeated vertical chrome per card. A primary "Edit" button plus an icon-only row or a "⋯" overflow menu for the other four would cut the card height roughly in half.

### Essays (`/essays`)
**Strengths**
- Status/assignment metadata (rubric linked, students assigned, submission count) is clear and compact.

**Improvements**
- "Submitted: 0/3" is plain text where a thin progress bar (matching the pattern already used in Activity Dashboard) would be both faster to scan and more visually consistent with the rest of the app.
- Same action-button stacking issue as Tests, just with fewer buttons (Edit/Monitor) — less severe but the same fix would help.

### Marketplace (`/marketplace`)
*(Assessed from code — requires Supabase + school membership to render its populated state.)*
**Strengths**
- The disabled-state message is clear and tells the teacher exactly what's missing (connect Supabase, join a school) rather than just showing an empty list.
- Publish flow (rubric → attribution → CEFR tags → publish) is a sensible three-step minimum.

**Improvements**
- No filter chips or sort control on the listings grid (noted in the original screen inventory as "shipped" but not actually present in this codebase) — worth deciding whether to build it or drop it from any future spec.

---

## Students domain

### Students & Classes (`/students`)
**Strengths**
- Class list + student roster in one screen, with CSV import/export and bulk "Export Summaries" covers the core admin workflow well.

**Improvements — this is the single clearest "fix this" finding of the audit**
- Each student row repeats one full-width pill button **per rubric** ("Grade: Persuasive E…", "Grade: Reading Comp…", …) — with 6 rubrics that's 6 pale, truncated, low-contrast buttons per student, repeated 27 times. This should collapse into a single "Grade ▾" dropdown or split-button per row, or drop the per-rubric shortcuts from this table entirely (grading is already reachable from the Rubrics page's "Grade Students" action).
- The left-hand Classes panel truncates class names ("VMB…") even at full desktop width — its column is narrower than its content needs.
- No visible "Overall" indicator per student in this table (e.g. average grade, CEFR estimate) — would be a natural addition given the data already exists elsewhere (Statistics, CEFR Overview).

### CEFR Overview (`/cefr-overview`)
**Strengths**
- CEFR badge colour-coding (amber → navy across A1–C2) makes skill/level state scannable once you know the legend.
- The "Detail" link per student is a good throughline into the new per-student evidence view.

**Improvements — second-clearest "fix this" finding**
- This table has **38 columns** (Student + 6 skills × 6 CEFR sub-levels + Detail). At both desktop and tablet width, most of it is off-screen, and — critically — **nothing is sticky**, so scrolling right loses the student name column entirely, making the visible cells unreadable without scrolling back. This needs either a sticky first column, a way to show only the relevant CEFR level per skill (collapsing 6 sub-columns to 1 "current level" badge per skill, expandable on click), or both.
- No "Overall" aggregate column despite it being implied by earlier design references — currently the only per-student summary is the per-skill cells; a single composite CEFR estimate per student would help a teacher scan for outliers faster than reading 36 cells.

### Per-student CEFR detail (`/students/:id/cefr-overview`)
**Strengths**
- Confirmed working as built: the new "Skill Evidence" section renders correctly below the Can-Do grid, with a clear rationale line ("Avg 0% across 1 assessment(s), threshold 70% — developing") and a dated evidence list per skill+level.
- Stat tiles (Skills Assessed / Can-Do Confidence / Standards Covered) at the top frame the detail that follows well.

**Improvements**
- The Can-Do grid's row labels truncate ("Speaking (Producti…", "Speaking (Interacti…") while the Skill Evidence section below spells them out in full — inconsistent labelling for the same skill within one page.
- No link from here to Vocabulary or Learning Path for the same student, despite all three being "Students" domain views about the same person — see cross-cutting note on throughlinks below.

### Learning Path (`/students/:id/learning-path`)
**Strengths**
- Minimal and focused: Rubric Recommendations + Intervention Flags, both clearly labelled as rule-based (no AI), which matches the project's stated no-AI-generation policy and is reassuring to a teacher reading it.

**Improvements**
- Very sparse — two small cards in an otherwise empty page. This is a strong **insertion point**: link to/from CEFR Overview and Vocabulary for the same student (currently three separate, unconnected "about this one student" pages reachable only via the Students table).

### Vocabulary Dashboard (`/vocabulary`)
*(Empty-state only — needs analysed documents to populate, not worth faking for this pass.)*
**Strengths**
- Clear empty-state copy explains exactly what's missing ("Analyse student documents to see CEFR vocabulary distributions here").

**Improvements**
- Same throughlink gap as Learning Path — no cross-link to/from the other two student-detail pages.

### Moderation Queue (`/moderation`)
**Strengths**
- Clean, focused layout: threshold control, one card per dispute, original-vs-second-marker table, and (now) three clear actions including the new Reconcile (average) button, which renders correctly and is sensibly the visually primary action.

**Improvements**
- The original-grading score showed as flat "0" across all three criteria in testing — worth double-checking the moderation-queue aggregation handles partially-graded or override-points entries correctly, since a baseline of literally zero across every criterion looks more like a display bug than a real dispute.

### Peer Review (`/rubrics/:id/peer-review/:studentId`)
**Strengths**
- Same level-grid + comment-per-criterion pattern as grading, which keeps the interaction model consistent for students doing peer review.

**Improvements**
- "Round 1" badge and "+ Add round" sit in a thin header bar that's easy to miss — for multi-round peer review this is an important piece of context that could be more prominent.

### Peer Review Analytics (`/peer-analytics/:rubricId`)
**Strengths**
- Feedback heatmap (comment frequency per criterion) + reviewer consistency/leniency-bias table is a genuinely useful pair of metrics for moderating peer-review quality.

**Improvements**
- Heatmap's criterion labels are rotated ~45° and sit close to the title above — slightly cramped, would read easier horizontal or abbreviated.

---

## Insights & Library domains

### Statistics (`/statistics`) — see dedicated section below for chart-level recommendations
**Strengths**
- Summary tiles (avg/median/highest/lowest) + grade distribution + per-criterion average bar/radar toggle is a strong "first screen" — exactly what a teacher wants to know first.
- "By Student" and "Compare" view modes are clean, focused, and uncluttered — noticeably better information density than "By Rubric" mode's lower sections.

**Improvements**
- See Statistics-specific section below.

### Export (`/export`)
**Strengths**
- Four distinct export types (rubric, essay, period report, report card) are clearly separated into their own cards rather than one overloaded form.

**Improvements**
- Four stacked dense forms on one page is a lot of vertical scroll to find the one export type you need — collapsible sections (closed by default, like RubricBuilder's "Collapse all") would let a teacher jump straight to the export they want.

### Comment Bank (`/comments`)
**Strengths**
- Confirmed working well: add-snippet form, tag filter chips, and a clean card grid with colour-coded tag badges (green=positive, yellow=improvement, blue=other). Good empty-state CTA ("Create your first snippet") when genuinely empty.

**Improvements**
- None significant — this is one of the better-executed simple views in the app.

### Attachments (`/attachments`)
**Strengths**
- N/A — not enough seedable content to assess fairly.

**Improvements**
- Unlike Comment Bank, the empty state here showed no visible messaging or upload CTA in testing — worth confirming it has an empty-state treatment consistent with the rest of the app.

---

## Student-facing views

### Student Portal (`/portal/:studentId`)
**Strengths**
- Single continuous scroll (stats → grade history chart → CEFR progress → peer reviews → full grade history with per-criterion comments) covers everything a student needs without forcing navigation.
- Per-rubric grade cards include inline per-criterion feedback and a "Self-assess" shortcut — good throughline from feedback to reflection.

**Improvements**
- As a student accumulates a full year of grades, this single-scroll page will get very long with no in-page navigation (anchor links, a sticky mini-nav, or the tabbed Home/Assignments/Feedback/Progress structure referenced in earlier design discussions) to jump between sections.
- When viewed by a teacher (not the student themself), the page renders inside the full teacher two-tier nav shell — worth confirming that's intentional (a "preview as student" mode) rather than an accidental leak of teacher chrome into a student-facing view.

### Essay/Test/Feedback/Preview share-code pages
*(Assessed from source, not fresh screenshots — see Scope note above.)*
**Strengths**
- Focus-mode framing (no nav chrome) is appropriate for a timed writing/test-taking context.
- The live-monitor Nudge feature (added this session) plumbs through correctly: the realtime channel, the toast on the student side, and the teacher-side button all exist and are wired consistently.

**Improvements**
- Nothing new to add beyond what's already known from the implementation work — a fresh look at these once they can be reached directly (e.g. a dev-only "open as student" link next to each EssayAssignment/Test card) would be worth a follow-up pass.

---

## Statistics — chart-by-chart recommendations (criterion 7)

The page renders up to 10 distinct chart/table types depending on view mode. A few specific calls:

1. **"Criterion Heat Map" isn't really a heatmap.** With discrete red/yellow/green bands rather than a continuous colour gradient, each row in testing rendered as one solid colour per student (since all criteria scored similarly) — it reads more like a traffic-light status grid than a heatmap showing *variation*. A true gradient (e.g. interpolated colour by percentile) would better reveal which specific criterion is the outlier for a given student, which is the actual point of a heatmap.
2. **The heatmap and the "Student Scores" table below it show overlapping information** — both are a full per-student roster, one colour-coded by criterion, one as a plain score/grade table. Consider merging them: make the heatmap the primary view with a click-to-expand row (revealing the score/grade/criteria-done detail inline) instead of two separate full-height tables stacked on one page.
3. **Two histograms, one underlying distribution.** "Grade Distribution" (by letter) and "Score Distribution" (by % bucket) are the same data viewed two ways, stacked directly on top of each other. A single chart with a letter/percentage toggle (mirroring the existing bar/radar toggle for per-criterion average) would say the same thing in half the vertical space.
4. **Heatmap column headers are rotated and cramped** against the chart title above — horizontal or abbreviated criterion labels would be easier to scan, especially at tablet width where there's less horizontal room to begin with.
5. **What's working well:** the bar/radar toggle for per-criterion average is a good model — it lets the same data serve both "which criterion is weakest" (bar, easy to rank) and "shape of performance across criteria" (radar, easy to spot lopsidedness) without cluttering the page with both permanently. The Compare mode's class-average bars + per-criterion comparison + progress trend, all in one focused view, is the best-executed multi-chart screen in the app and could be a template for tightening up "By Rubric" mode's lower half.

---

## Summary: where to focus first

If only fixing a handful of things:
1. **Students page action-column clutter** — highest-frequency view, worst clutter.
2. **CEFR Overview's 38-column non-sticky table** — currently close to unusable past the first few visible columns.
3. **Sidebar's Overview fallback for dynamic grading routes** — a small code fix (extend `matchPrefixes` matching, or default to the *previous* domain instead of always Overview) that removes a confusing wayfinding glitch app-wide.
4. **Tablet clipping in RubricBuilder and ComparativeGrading** — both have an existing portrait-only reflow rule in `index.css` that just needs a landscape/1024px companion.
5. **Statistics' heatmap + redundant table** — biggest "could be represented differently" win for the page the user specifically flagged.
