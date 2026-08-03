# Option B Mockup Follow-Ups — Implementation Plan (Phases 36–42)

**Status:** Phases 36, 37 (37.1 + 37.2), 38, and 40 implemented (40 = grading Cards/Grid toggle, criterion×level grid with focused-criterion detail panel, settings-cog header menu, sub-item chips + override control, comment quick-chips, criterion-letter+number chords). Phases 41–42 remain proposed.
**Source of truth for design:** the "Option B" mockup (Claude Design project) as distilled in the wiki's `Architecture.md` → _"Design System — Option B UI Conventions"_. The mockup's foundation (Warm Scholar palette, fonts, two-tier nav) already shipped in Phase 9.5; everything below is page-content work.
**Resolved decisions (this planning pass):**

- Full spec written for all of 36–42 **before** implementation; user approves the plan first.
- **Phase 38 roster navigation → cohort chips** (combined roster), not per-class tabs.
- Visual cross-reference is taken from the repo's `Architecture.md` design-system section (canonical, decision-resolved), not per-screen from the live canvas.

**Guardrail (from the mockup's own design document): never regress a shipped feature; every phase below carries an explicit regression checklist.**

---

## 0. Shared foundation — `SegmentedToggle` (built in Phase 36, reused by later phases)

`src/components/ui/SegmentedToggle.tsx` **was introduced in Phase 36** as the reusable segmented/toggle control (before Phase 36 there was none — `src/components/ui/` had Modal, Avatar, EmptyState, ConfirmDialog, HelpPopover but nothing for this). Phases 38/41 reuse it.

**File:** `src/components/ui/SegmentedToggle.tsx`

- Generic, controlled: `options: { value: T; label: string; icon?: ReactNode }[]`, `value: T`, `onChange: (v: T) => void`, `ariaLabel: string`.
- Visual per Architecture spec: pill container; **active** option `background: var(--accent)` + `color: var(--accent-fg)`; **inactive** transparent + `color: var(--text-muted)`.
- A11y: `role="tablist"` semantics were flagged as risky in Phase 31 (needs matching `role="tab"` + `aria-selected`); use a `role="group"` of toggle buttons with `aria-pressed` instead, matching how the codebase settled the SettingsPage/StudentProfile tab a11y work. **Confirm with existing `pages.a11y.test` patterns before finalizing.**
- Unit test: `SegmentedToggle.test.tsx` (renders options, calls onChange, reflects active state).

**i18n:** add to all five locales (`en, nl, fr, de, es`): `common.view_cards`, `common.view_list`.

---

## Phase 36 — Rubrics & Tests: List/Card view parity _(small–medium)_

### 36.1 Rubrics Cards/List toggle — `src/pages/RubricList.tsx`

**Current:** cards-only. The grid is a `@hello-pangea/dnd` **flex-wrap** layout (not CSS grid — dnd needs flex to compute displacement). Filters already exist (cohort/subject/track). Cards already compute badges: criteria count, levels, students-graded, CEFR/CCSS.

**Target:**

- `SegmentedToggle` (Cards | List) in the controls row (line ~311, next to the existing filters).
- New `view` state (`'cards' | 'list'`), default `'cards'`. Persist per-page in `localStorage`? → **No**: keep it component state only (avoid a new storage key; the toggle is cheap to re-select). _(Open micro-decision, defaulting to non-persistent.)_
- **List view** = a `data-table` (reuse the existing `.data-table` class already used on StudentsPage) with columns: Name · Subject · Criteria · Levels · CEFR · Graded · Actions (Edit/Grade/Compare). Reuse the **existing** badge computations — **do not** adopt the mockup's scoring-mode/updated-date badge set (Architecture: keep existing badges, they carry real info surfaced elsewhere).
- **Drag-to-reorder stays Cards-view-only.** List view rows are static (sortable later if wanted, out of scope here).

**Regression checklist:** card view unchanged; dnd reorder still works in card view; all three actions reachable in both views; filters apply to both views; empty state still renders.

### 36.2 Tests Cards/List toggle + surfaced results — `src/pages/TestListPage.tsx`

**Current:** cards-only; submitted-count and average-score are already computed but hidden behind a per-card expandable panel (`aria-expanded`, line ~394).

**Target:**

- Same `SegmentedToggle` (Cards | List).
- Surface **submitted count** and **average score** on the **card front** (not only in the expandable panel). The expandable panel keeps its richer per-submission detail.
- **List view** columns: Name · Subject · Questions · Submitted · Avg score · Actions. No new aggregation — reuse what the expandable panel already computes.

**Regression checklist:** expandable per-card detail still works; share/assign actions intact; dnd reorder (if present) card-view-only; empty state intact.

---

## Phase 37 — CEFR Overview & Statistics polish _(small)_

### 37.1 CEFR Overview summary cards — `src/pages/CefrOverviewPage.tsx`

**Current:** class-wide matrix + legend already match the mockup. `SKILLS` array (reading, writing, speaking-production, speaking-interaction, listening) and aggregators (`highestLevelForSkill`, per-cell data) already imported; `CefrBadge` already used.

**Target:** add a row of **5 summary cards above the matrix** — one per skill: skill label + a single class-representative level badge. Derive the level from the existing aggregation (e.g. modal/median achieved level across students for that skill — **confirm which statistic** the mockup implies; default to "most common achieved level"). Reuse `CefrBadge`; no new color source (Architecture: keep the app's `CEFR_LEVEL_COLORS`, do not fork the mockup palette).

**Regression checklist:** matrix + legend + per-student drill-down unchanged; horizontal scroll behavior of the wide matrix unchanged; summary cards are additive above it.

### 37.2 Statistics — graph usefulness audit & refinement _(medium; was cosmetic, now a real review)_

**Scope change (per user):** this is no longer just "move the CSV button." It's a deeper dive into **how each graph is displayed and whether it earns its place**, then targeted refinements. Header/CSV alignment is folded in as a minor sub-item.

**Implementation step 0 (mandatory first):** run the app with **Load sample data** (Settings → Administration, dev-only) and screenshot every chart in all three view modes at desktop **and** tablet (1024px) widths. The review below is from source; the visual pass confirms/prioritizes it before any edit.

**Chart-by-chart review** (`src/components/Statistics/` + inline charts in `StatisticsPage.tsx`):

| Chart                                                                                          | Where                      | Verdict                                                                                                                                  | Refinement                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CriterionHeatmap** (red→yellow→green, expandable)                                            | rubric view                | **Keep — strongest table in the app** (UX-audit agrees)                                                                                  | Red/green is colorblind-hostile: add a value label or texture, verify AAA contrast (`contrastCheck.ts`); sticky first column at tablet width (currently loses student names on scroll).                                                                   |
| **EloProgressChart** (line + CEFR band `ReferenceArea`)                                        | student/placement          | **Keep — genuinely useful** (real time-series of placement)                                                                              | Minor: label the bands on the axis; confirm empty/1-point state.                                                                                                                                                                                          |
| **LearningGoalChart** (line + target, %/raw toggle)                                            | goals                      | **Keep — useful**                                                                                                                        | Legend/tooltip polish; ensure target line is visually distinct.                                                                                                                                                                                           |
| **ScoreHistogram** (distribution bars)                                                         | rubric view                | **Keep — useful**                                                                                                                        | Fine; align palette to dataviz tokens.                                                                                                                                                                                                                    |
| **CriterionRadarChart** (radar, toggle vs bar)                                                 | rubric view                | **Keep as an option only** — radar is hard to read past ~6 criteria and its area overstates differences                                  | Keep the existing **bar/radar toggle**; default to **bar**; cap/scroll radar when criteria are many.                                                                                                                                                      |
| **ClassTrendChart** (avg+median line, x = rubric name)                                         | student view               | **Questionable — mislabeled**                                                                                                            | It's called a "trend" but the x-axis is _rubrics_, not time — rubrics aren't chronologically ordered, so the line implies a progression that isn't real. Either **order by date** (making it a true trend) or **switch to grouped bars** (no false line). |
| **MultiClassTrendChart** (compare classes over rubrics)                                        | compare view               | Same caveat as ClassTrendChart                                                                                                           | Same fix — order by date or de-line.                                                                                                                                                                                                                      |
| **BloomsPyramidChart** (custom pyramid, % labels)                                              | rubric view                | **Weak encoding** — the pyramid _shape_ is fixed decoration; the value only appears as a % label, so the visual doesn't encode the data  | Replace the pyramid with a **horizontal bar per Bloom level** (value = bar length), keep the level ordering; or keep the pyramid but make band width/fill encode the %.                                                                                   |
| **FrameworkRoseChart** (custom SVG nightingale/rose)                                           | rubric view (IB/framework) | **Perceptually misleading** — value maps to **radius**, but the eye reads **area**, which grows quadratically, overstating large sectors | Prefer a **radial/regular bar chart** where length encodes value linearly; if the rose is kept for aesthetics, annotate values and note the caveat.                                                                                                       |
| **Custom Views gallery** (`STATS_PRESETS`: criterionAverages, gradeDistribution, testAverages) | rubric view                | **Keep**                                                                                                                                 | Ensure preset colors come from the dataviz palette, not ad-hoc hex (`#6366f1`/`#10b981`/`#f59e0b` today).                                                                                                                                                 |
| **Grade distribution / Criterion averages** (inline BarCharts)                                 | rubric view                | **Keep**                                                                                                                                 | Already have export/fullscreen; unify tooltip/axis styling with the rest.                                                                                                                                                                                 |

**Cross-cutting refinements:**

- **One palette:** several charts hardcode hex (`#6366f1`, `#10b981`, `#f59e0b`, heatmap ramp). Route all through shared dataviz tokens for a coherent light/dark system. _(Load the `dataviz` skill when implementing.)_
- **Tablet clipping:** wide charts/heatmap need a horizontal-scroll affordance (recurring UX-audit finding).
- **Empty/single-point states:** confirm every chart degrades gracefully with sparse seed data.
- **Header/CSV (the old 37.2):** move the CSV button next to Print in the header — minor, do alongside.

**Deliverable of this phase:** a short screenshot-backed audit note + the prioritized refinements above, implemented chart-by-chart (lowest-risk first: palette unification, then ClassTrend/Bloom/Rose re-encoding).

**Regression checklist:** all three view modes; CSV export contents; Print; fullscreen/export-chart actions; every picker; heatmap expand-on-click.

---

## Phase 38 — Students roster redesign → **cohort chips** _(small–medium)_

**Decision resolved:** switch from per-class tabs to a **combined roster filtered by cohort chips**.

**Current:** `src/pages/StudentsPage.tsx` — left-hand vertical `nav-item` list of classes (draggable, each with a voTrack badge + student count), single `activeClass` state persisted to `settings.activeClassId`. Roster is a `.data-table` filtered to `activeClass` with columns Name · Email · (sortable) · Overall · Actions.

**Target:**

- Replace the left class nav-list with a **horizontal cohort chip row** at the top of the roster (chips = classes; plus an **"All"** chip). Chip visual follows the filter-chip convention already shown on the mockup's Rubrics screen (All cohorts / VWO 4 / HAVO 5 / …).
- **Chip interaction & a11y (keyboard-first):** each chip is an **independently keyboard-operable toggle** — a focusable `<button>` in the tab order with `aria-pressed` reflecting its selected state, toggled by **Enter/Space** as well as click. Do **not** rely on Ctrl/Cmd-click for multi-select (pointer-only, inaccessible); modifier-click may stay as an optional pointer affordance but must never be the _only_ way to multi-select. **"All" vs individual:** selecting a cohort clears "All"; selecting "All" (or deselecting the last active cohort) returns to the all-state. **Default = single-select** (one cohort, or "All") so the common case reads focused; multi-select is additive by toggling more chips on. Wrap the row in a `role="group"` with an aria-label.
- Roster becomes **combined**: when >1 cohort is active (or "All"), add a **Class** column so rows stay attributable.
- **38.2 column/badge additions (independent of the nav change):**
    - Avatar-initials circle per row (reuse `src/components/ui/Avatar.tsx`).
    - **CEFR·Writing** badge column (reuse `CefrBadge`) — pull from existing CEFR student aggregation.
    - **Trend arrow** (up/flat/down) from existing score history.
    - **Last-active** column (from `updatedAt`/latest activity already on the record).

**Migration concerns / regressions to preserve:**

- **`settings.activeClassId` is singular** and existing readers treat it as exactly one class or unset ("all") — grading defaults and other class-scoped defaults among them. **Contract to preserve:** leave `activeClassId` **unset for "All" or when multiple cohorts are selected**, and write it **only when exactly one cohort is selected**. Do **not** write an arbitrary "last-selected" value or an aggregate — that would make dashboard/grading averages and class-scoped defaults target the wrong class. **Audit every reader of `activeClassId`** (grading defaults, class-scoped actions) before changing the writer, or migrate those readers to a multi-class contract first.
- Class reorder (dnd) and voTrack badges must survive the move to chips.
- "Link rubrics to class", add/edit/merge/delete-class, CSV import/export of the roster must all still work — they currently key off `activeClassData`; with multi-select decide which class those class-scoped actions target (**default: enable them only when exactly one chip is selected**).

**Regression checklist:** add/edit/transfer/delete student; class create/merge/delete; link-rubrics modal; CSV import & export; sortable columns; `activeClassId` downstream defaults.

---

## Phase 39 — intentionally not used

Phase 39 is **deliberately skipped** — the two smaller mockup-driven items that would have filled it were folded into their sibling phases 28.5 and 29.6 instead (see the wiki Roadmap's "Option B Mockup Follow-Ups" section). It is listed here only so the 36–42 range has no silent gap; there is no work planned under this number.

---

## Phase 40 — Grading page redesign _(large, high-risk — design spike)_

**This is the app's most complex page and the highest-risk item; the roadmap flags it for its own design spike before code. This section is the written target spec that spike produces — no code until it's signed off separately.**

**Current:** `src/pages/GradeStudent.tsx` (~2,117 lines). Stacked **card per criterion** (`criterionCardsRef`). Scoring model: `ScoreEntry { criterionId, levelId }` updated via `updateEntry`; levels come from `sharedOrderedLevels(criterion, rubric.format)`. Rich behavior sits on this layout:

- `rubric.scoringMode === 'single-point'` (no level grid — single point per criterion).
- Keyboard nav: arrow/shift-arrow cycles `focusedCriterionIdx`; number keys 1..n pick a level for the focused criterion.
- `feedbackOnly` mode; `notHandedIn` state (`not_handed_in_comment`).
- Audio comments (`useMediaRecorder`).
- Co-grading / anchor comparison (`isAnchor`, `coGraderName`) — Supabase + school gated.
- Comment bank via `CommentBankModal`.
- Sub-item scoring, overrides, grade summary (`calcGradeSummary`).

**Mockup target:**

- Literal **criterion × level grid** (criteria = rows, levels = columns; each cell clickable to set `levelId`). Replaces stacked cards.
- Slimmer **header**: avatar + class/rubric/index + CEFR badge, replacing the ~12-icon-button strip.
- Two side-by-side panels: a **fine-tune slider** (point score) and a **comment composer** with inline comment-bank quick-insert **chips** (replacing the modal-first flow — modal can remain as "browse all").

**Design directives (resolved by user — the spike implements these, not re-decides them):**

1. **Single-point mode keeps its current functionality and look** (it does not become a level grid — there are no levels to column-ize). Re-skin it to the updated aesthetic only; behavior unchanged. The criterion×level grid applies to multi-level rubrics.
2. **Preserve keyboard behavior where possible.** The current focused-criterion + number-key scheme should carry over; where a grid needs disambiguation, move to **criterion-letter + level-number chords** (e.g. `A+1`, `B+2` = criterion A, level 1). Document the scheme and keep single-key level-select for the focused row.
3. **Move the header control cluster into a "settings-cog" (or similarly fitting icon) menu** — `feedbackOnly`, not-handed-in, audio comment, co-grading/anchor, notify-on-grade, etc. collapse behind one menu button, decluttering the ~12-icon strip. (Frequent actions may stay surfaced; rarely-used ones go in the menu.)
4. **Keep both** the inline comment-bank quick-insert **chips** _and_ the existing `CommentBankModal` ("browse all"). Chips = fast common inserts; modal = full search/manage.
5. **Sub-items become sub-cells / chips inside the criterion cell:**
    - If a sub-item has a **point range**, its chip **expands** to a small scorer (slider/stepper) for that range.
    - If a sub-item is a **single point**, it stays a plain sub-cell/chip (no expansion).
    - The **override control lives at the bottom of the criterion cell**.

**Spike must still resolve (layout mechanics, not policy):**

- Grid behavior at tablet width when a rubric has many levels (horizontal-scroll affordance — recurring UX-audit issue).
- Exact chord-capture implementation without breaking existing single-key flow or text inputs.
- Slider ↔ level-cell synchronization (clicking a cell vs. dragging the fine-tune slider must stay consistent).

**Regression checklist (exhaustive — grading correctness lives here):** every scoring mode; keyboard scoring; feedback-only; not-handed-in; audio record/playback; co-grading & anchor comparison; sub-item scores; overrides; grade summary math; save + student-notify; next-student flow.

---

## Phase 41 — Student portal & focus-mode redesign _(large — plan pass)_

**Current:** `src/pages/StudentPortalPage.tsx` (~1,913 lines) is a single **scroll-jump** page: `scrollToSection(id)` + a `sections[]` array (`portal-section-work`, `-flashcards`, `-news-flashes`, `-messages`, …) each `{id,label,visible}`. Essay writing (`/essay/:code`, `StudentEssayPage`) and test-taking (`/test/:code`, `StudentTestPage`) are **separate top-level routes reached via share-links**, not portal tabs.

### 41.1 Portal header & tab bar

- Add app logo, theme toggle, student avatar to the portal header (currently text-only name/class).
- Convert the scroll-jump section nav into a real **Home / Assignments / Feedback / Progress** tab bar (map existing sections onto the four tabs; can reuse `SegmentedToggle` or a dedicated tab bar).
- **Hard constraint (roadmap risk flag):** `/essay/:code` and `/test/:code` are reached from **outside** the portal shell and must keep working exactly as deep-links. Do **not** move essay/test into portal tabs; the tab bar is IA for the portal landing only. Verify deep-link entry before/after.

### 41.2 Focus-mode restyle

- **Essay** (`StudentEssayPage` + shared `components/Editor/EssayEditor.tsx`): add an exit control + saved-indicator badge to the header (currently a plain text line); add a prompt + meta + "Tip" **sidebar** (currently a plain banner above the editor). _(EssayEditor is a shared TipTap component; header/prompt chrome lives at the page level — restyle the page, not the shared editor.)_
- **Test** (`StudentTestPage`): the `QuestionTimeline` sticky footer today shows answered/unanswered only. Add a **flagged / unseen** question palette with a legend. **Preserve:** adaptive staircase/generator runs have no fixed question set and show no timeline — keep that branch.
- **Vocabulary** (`components/Flashcards/FlashcardStudySession.tsx`): make study full-screen with a **progress bar** (currently `cards_remaining` count text); surface **phonetic / part-of-speech** fields on the card; add a right-sidebar deck word-list. **Preserve:** queue building (`buildStudyQueue`), `onExit`, states-change callback, FSRS scheduling.

**41.2b — Flashcard model + teacher & student authoring (per user):**

- **Data model:** add optional `phonetic` and `partOfSpeech` fields to the flashcard/card type in `src/types/index.ts` (back-compat, optional). These are the fields the focus-mode study view surfaces.
- **Teacher side:** the deck editor (`FlashcardDeckPage.tsx`) must let teachers **enter phonetic + part-of-speech** when creating/editing cards — the study-view features are only meaningful if the authoring side captures them. Add the fields to the card-edit rows; keep CSV/bulk import back-compat (new columns optional).
- **Students can create their own decks:** add a student-facing "create deck" flow (owned by the student, distinct from teacher-assigned decks). Decide ownership/visibility: student-owned decks are private to that student unless shared; do **not** let a student-created deck leak into a teacher's class deck list. Storage follows the existing `isOffline()`/StorageSync rules (no direct localStorage writes). This is a **new user-facing capability** → confirm scope in Phase 41's own planning before building.

**Regression checklist:** essay/test share-link deep-links; draft autosave; test submit + timeline jump; adaptive test runs; flashcard queue/FSRS/exit; existing deck assignment + per-deck insights; CSV deck import with and without the new columns; existing decks with no phonetic/POS render fine.

---

## Phase 42 — Vocabulary insights consolidation _(medium — plan pass)_

**Current:** cross-deck teacher analytics is scattered, not absent:

- `src/pages/VocabularyDashboardPage.tsx` — essay-derived **CEFR word-level** profiles (not flashcard performance).
- Per-deck flashcard progress — `computeDeckInsights` (`src/utils/flashcardInsights.ts`) + `FlashcardInsightsPanel`, rendered **inline per-deck** in `FlashcardDeckPage.tsx` as a roster list.

**Immediate target (this phase):** one **cross-deck** teacher view showing flashcard-performance trends across all decks, **reusing both existing computations** (`computeDeckInsights` per deck, aggregated; the essay word-level profile stays as-is) rather than a third aggregation path. Natural home: a tab/section on `VocabularyDashboardPage`, or a new sibling route — decide in this phase's own planning. Structure the page as a **"Vocabulary Insights" hub** with room for the profiling tools below to slot in as tabs later.

**Forward-looking (per user): integrate the VocabKitchen-CLI analysis tools** (`https://github.com/NesiciCoding/vocabkitchen-CLI/wiki`). VocabKitchen is a **rule-based, no-AI** EFL profiler (compatible with this project's "no AI generation" constraint) with two engines — a **Vocabulary Profiler** (CEFR A1–C2 + Academic Word List) and a **Grammar Profiler** (grammatical structures → CEFR). _(Both are also available in this session as the `vocab-profiler` and `grammar-profiler` skills.)_ The app already does a slice of this (`VocabularyDashboardPage` = essay-derived CEFR word levels). Map its 10 use-cases to RubricMaker surfaces so the hub is designed to grow into them:

| VocabKitchen use case                             | RubricMaker home                            | Notes                                                                                  |
| ------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1. Text-difficulty screening                      | Document analysis / reading assignment flow | "Is this reading right for this class's CEFR?" before assigning.                       |
| 2. Pre-teaching word lists                        | Vocabulary Insights hub → deck seed         | Extract above-level words → one-click into a flashcard deck (ties to 41.2b authoring). |
| 3. Student-writing assessment (grammatical range) | Essay grading / Phase 34 writing analytics  | Grammar profiler complements the deterministic essay stats.                            |
| 4. Lexical–grammar mismatch detection             | Reading/essay analysis panel                | Flag "simple words, complex grammar" texts.                                            |
| 5. Textbook / material comparison                 | Document analysis                           | Rank competing readings by CEFR.                                                       |
| 6. Graded-reader development                      | (teacher tooling, lower priority)           | Iterative simplification loop.                                                         |
| 7. Curriculum validation                          | Standards / curriculum mapping              | Confirm taught structures appear in unit readings.                                     |
| 8. Batch document analysis                        | Document analysis (already OCR/Mammoth)     | Profile many files.                                                                    |
| 9. Natural-language / Claude Code integration     | out of app scope                            | CLI-side.                                                                              |
| 10. Automated CSV reporting                       | Export (already have CSV infra)             | Shareable reading-library summaries.                                                   |

**Integration approach to decide in Phase 42 planning (do NOT build yet):** whether to port the profilers' word/grammar taxonomies into TS utilities under `src/utils/` (client-side, offline-capable, matching the rule-based `masteryProfileAggregator`/`learningPathAggregator` pattern) vs. call out to the CLI/an edge function. Constraints hold: **no AI, no paid deps, offline-capable, deterministic.** The near-term deliverable is only the cross-deck flashcard consolidation + a hub shell scoped to accept these tools; the profiler integration is a **separate, later phase** this plan just prepares the ground for.

**Regression checklist:** per-deck insights panel on `FlashcardDeckPage` unchanged; essay word-level dashboard unchanged; new view is additive.

---

## Suggested sequencing

1. **Shared `SegmentedToggle`** (foundation).
2. **Phase 36** (Rubrics + Tests) — proves the toggle, lowest risk.
3. **Phase 37.1** (CEFR summary cards) — tiny, additive.
4. **Phase 38** (roster → chips + columns) — self-contained but touches `activeClassId`; needs the reader-audit.
5. **Phase 37.2** (Statistics CSV move) — optional, only if wanted.
6. **Phase 42** (vocab consolidation) — medium, isolated.
7. **Phase 41** (portal + focus modes) — large, share-link risk.
8. **Phase 40** (grading grid) — largest, highest risk, its own signed-off spike last.

## Cross-cutting, every phase

- i18n keys added to **all five** locales (parity test enforces it).
- Update the three doc surfaces per the root `CLAUDE.md` rule when user-facing behavior changes: `DocsPage.tsx`, `README.md`, `LandingPage.tsx`.
- axe a11y test coverage exists for these pages (Phase 31) — keep them green; segmented control a11y pattern must match the settled `aria-pressed` approach.
- Tablet-width (1024px) horizontal-scroll affordance is a recurring UX-audit finding — new tables/grids (36 list views, 38 roster, 40 grid) should not clip silently.
