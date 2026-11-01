# VO-Track Matrix Rubric — design draft

Status: **draft, not implemented.** No source files changed.

## 0. Decisions (answered 2026-10-26)

| # | Question | Decision |
|---|---|---|
| 1 | What is the "Mavo" column? | **VMBO-T (`vmbo-tl`)**. VMBO-BB / VMBO-KB are not used. Default column set = `vmbo-tl`, `havo`, `vwo`. |
| 2 | Are there always three bands? | **No — 1 to n bands**, configurable per rubric (practically 1–5; more allowed, e.g. a sheet spanning groep 7 *and* 8). Bands are therefore a **data list, not a union type**. |
| 3 | Weighting | **Equal** — every criterion weighs the same; no weighting UI for matrix rubrics by default. |
| 4 | Band points | **Exposed once per rubric** (band config), not edited per criterion. |
| 5 | Mixed-track comparative view | **Band-only compact, expandable** to per-track wording. |

Decision 2 is the structural one: it removes the `MasteryBand` union from the design and makes
`criterion.levels` a *projection* of a rubric-level band list. Everything below reflects that.

## 1. What the source rubric actually is

`Rubric grote opdracht Y1 P1 26-27.docx` (attached) is not a points rubric. Its structure is:

```
header:  Naam leerling: ______   Niveau: M | H | V   Eindbeoordeling: IO | B | E

┌──────────────────────────┬────────────────┬────────────────┬────────────────┐
│ Onderdeel                │ Mavo           │ Havo           │ VWO            │
├──────────────────────────┼────────────────┼────────────────┼────────────────┤
│ Spelling en woordenschat │ IO: …          │ IO: …          │ IO: …          │
│                          │ B:  …          │ B:  …          │ B:  …          │
│                          │ E:  …          │ E:  …          │ E:  …          │
├──────────────────────────┼────────────────┼────────────────┼────────────────┤
│ Interpunctie             │ IO: … B: … E: …│ …              │ …              │
└──────────────────────────┴────────────────┴────────────────┴────────────────┘

Verplichte eisen: 1. … 2. … 3. …      (IO bij niet voldoen hieraan)
```

So the axes are inverted compared to everything RubricMaker does today:

| | RubricMaker today | This rubric |
|---|---|---|
| Row | criterion | criterion (*same*) |
| Column | performance **level** | **VO track** (Mavo / Havo / VWO) |
| Cell content | one descriptor | one descriptor **per band** (IO / B / E, or 1–5 bands) |
| Grade unit | points from a level | **band** |
| Hard gate | — | "Verplichte eisen" → verdict capped at IO |

Key realisation: **a student is graded in exactly one column.** The track is chosen by the
student, not by the teacher — and the column set comes from `VO_TRACKS`
(`src/data/voTracks.ts`), which the app already models per class and per student
(`getEffectiveVoTrack(student, cls)`); a per-student override must be one of the class's own
tracks (`getClassVoTracks` / `classHasVoTrack`).

That means the track dimension is *presentation + descriptor selection*, and it must **not**
enter the scoring math. Only the band enters the math — and a band list of length n is
structurally an n-level rubric, which the app already supports.

## 2. Design decision: bands are levels, tracks are a descriptor overlay

Three candidate models were considered.

**Option A — flatten to (track × band) levels.** `criterion.levels` gets
`Mavo-IO, Mavo-B, Mavo-E, Havo-IO, …`. Rejected: `ScoreEntry.levelId` would encode the track,
a student's track change would invalidate saved grades, exports would need 3n columns, and
`calcEntryPoints`/`criterionMaxPoints` would see meaningless max points. Large blast radius.

**Option B — a parallel `TrackRubric` entity with its own storage, grading page and export
path.** Rejected: duplicates `StorageSync`, `syncMerge`, `student_rubrics`, rubric versions,
share codes, marketplace, and every export. Weeks of work and two grade models to maintain.

**Option C (recommended) — additive overlay on the existing model.**
`criterion.levels` is *derived* from the rubric's band list (one level per band, stable ids),
so grading, `gradeCalc`, `ScoreEntry.levelId`, comparative grading
(`GradingGrid.tsx:144` matches on `level.id`), snapshots and sync are untouched. The track
dimension is added as:

- `Rubric.trackMatrix` — declares "this rubric is a track matrix", its columns and its bands.
- `RubricCriterion.trackDescriptors` — per-track text, keyed by **band id**.

Both are optional fields on the existing interfaces. `data jsonb` in `rubrics` /
`student_rubrics` absorbs them, so **no Supabase migration and no sync change**.

## 3. Type sketch (`src/types/index.ts`)

```ts
/**
 * One mastery band of a VO-track rubric. Ordered worst → best in
 * TrackMatrixConfig.bands. 1..n bands, so this is data, not a union type.
 */
export interface MasteryBandDef {
    /** Stable id, and the RubricLevel.id every criterion's level for this band uses. */
    id: string;
    /** Short chip label shown on the grading button and export cell: 'IO', 'B', 'E'. */
    code: string;
    /** Full name: 'In Ontwikkeling', 'Beheerst', 'Expert'. */
    label: string;
    /** Points awarded for this band on every criterion (decision 4). */
    points: number;
    /** Percentage cutoff for the OVERALL verdict; defaults to an even spread. */
    minPercentage?: number;
    /** Optional chip colour; falls back to an accent ramp by band index. */
    color?: string;
}

export interface TrackColumn {
    track: VoTrack;
    /** Header override so a vmbo-tl column can read "Mavo" like the source sheet. */
    label?: string;
}

export interface TrackMatrixConfig {
    /** Columns to render, left to right. Default: vmbo-tl / havo / vwo (decision 1). */
    tracks: TrackColumn[];
    /** 1..n bands, worst → best. Default: IO / B / E. */
    bands: MasteryBandDef[];
    /** What to show when a criterion has no text for the student's track. */
    fallback: 'nearest-track' | 'blank';
    /** "Verplichte eisen" — an unmet requirement caps the verdict at the lowest band. */
    requirements?: { id: string; text: string }[];
    /** When true the teacher has opted into per-criterion weights; default false (equal). */
    weighted?: boolean;
}

export interface RubricCriterion {
    /* …existing fields unchanged… */

    /**
     * Per-track text, keyed by MasteryBandDef.id. Only present on a track-matrix rubric.
     * Keyed by band id (not array index) so inserting or deleting a band never shifts text.
     */
    trackDescriptors?: Partial<Record<VoTrack, Record<string, string>>>;
}

export interface Rubric {
    /* …existing fields unchanged… */

    /** Present ⇒ this rubric is a VO-track matrix. Absent ⇒ ordinary rubric (all current code paths). */
    trackMatrix?: TrackMatrixConfig;
}

export interface StudentRubric {
    /* …existing fields unchanged… */

    /** Checklist state for trackMatrix.requirements; an unmet one caps the verdict. */
    requirementsMet?: Record<string, boolean>;
}
```

Nothing here is required by any existing type, so every current rubric, snapshot, share code
and export keeps compiling and rendering unchanged.

### 3.1 `criterion.levels` is derived, and that is deliberate

For a matrix rubric the level array is a projection of `bands`:

```ts
{ id: band.id, label: band.code, minPoints: band.points, maxPoints: band.points,
  description: '' /* text lives in trackDescriptors */, subItems: [] }
```

Consequences, all of them good:

- `calcEntryPoints`, `criterionMaxPoints`, `calcWeightedScore` need **zero changes**: bands are
  single-point levels, which the engine already handles (it is the `single-point` path today).
- `ScoreEntry.levelId` holds a band id, so a student's band is already persisted.
- Editing band points once in the rubric header updates every criterion (`applyBandPoints`).
- Inserting a band inserts a level in every criterion; **existing ids are preserved**, so
  saved grades stay attached. Deleting a band leaves dangling `levelId`s, which
  `calcEntryPoints` already treats as ungraded (returns 0) — the builder warns first if that
  band has recorded scores.
- One invariant to enforce in tests: `syncBandLevels` never rekeys an existing level.

## 4. New module: `src/utils/trackMatrix.ts` (pure, testable)

Single source of truth for every consumer (builder, grading, exports, analytics). No React,
no context import — same shape as `gradeCalc.ts`.

```ts
export function isTrackMatrix(rubric: Pick<Rubric, 'trackMatrix'>): boolean;

/** Columns in canonical VO order, filtered to the declared tracks. */
export function matrixTracks(rubric: Rubric): TrackColumn[];

/** Header text for a column: label override ?? VO_TRACK_LABELS[track]. */
export function trackLabel(column: TrackColumn): string;

/** Bands in display order, honouring rubric.format.levelOrder. */
export function matrixBands(rubric: Rubric): MasteryBandDef[];

/**
 * Descriptor text for one band in the grading column.
 * Fallback chain: exact track → nearest adjacent track in VO_TRACKS order that has text
 * for this band → '' (or the level description, for hand-migrated rubrics).
 */
export function resolveTrackText(
    criterion: RubricCriterion,
    bandId: string,
    track: VoTrack | undefined,
    rubric: Rubric
): string;

/** The accessor every renderer/export uses instead of reading level.description directly. */
export function describeBand(
    criterion: RubricCriterion,
    level: RubricLevel,
    track: VoTrack | undefined,
    rubric: Rubric
): string;

/** Idempotent: keep levels aligned with bands; never rekeys levels, never touches text. */
export function syncBandLevels(criterion: RubricCriterion, bands: MasteryBandDef[]): RubricCriterion;

/** Adds/removes track columns in one pass across all criteria. */
export function syncTrackColumns(rubric: Rubric, columns: TrackColumn[]): Rubric;

/** One rubric-wide edit of band points → every criterion (decision 4). */
export function applyBandPoints(rubric: Rubric, bands: MasteryBandDef[]): Rubric;

/** Equal weights (decision 3): the same constant on every criterion. */
export function equalizeWeights(criteria: RubricCriterion[]): RubricCriterion[];

/** Builds a matrix criterion: one level per band + empty descriptor grid. */
export function newMatrixCriterion(bands: MasteryBandDef[], columns: TrackColumn[]): RubricCriterion;

/** Band presets for the builder: 1..5 bands, worst → best. */
export function bandPreset(count: number): MasteryBandDef[];

/** Per-criterion verdict: the band id selected for that criterion, or null. */
export function criterionBand(entry: ScoreEntry): string | null;

/** Overall verdict, honouring requirement gates; returns the winning band. */
export function overallBand(
    percentage: number,
    requirementsMet: Record<string, boolean> | undefined,
    config: TrackMatrixConfig
): MasteryBandDef;
```

`bandPreset` supplies the Dutch defaults and the equal-spread `minPercentage` cutoffs:

| Bands | Codes | Default labels | Default points | Default cutoffs |
|---|---|---|---|---|
| 1 | `B` | Beheerst | 0 | 0 |
| 2 | `IO`, `B` | In Ontwikkeling, Beheerst | 0, 1 | 0, 55 |
| 3 | `IO`, `B`, `E` | In Ontwikkeling, Beheerst, Expert | 0, 1, 2 | 0, 55, 80 |
| 4 / 5 / n | `IO`, `B`, `E`, `I`, `X` … | teacher-editable | 0…n−1 | even spread |

All four columns are editable; the preset is just a starting point. Codes and labels are
stored on the band, so a school using `O` / `V` / `G` instead of IO/B/E types it once and every
criterion, export and verdict follows.

## 5. Authoring UI

### 5.1 Rubric type selector + band config

Mirror the existing scoring-mode radio group (`RubricBuilder.tsx:1249`), directly above it:

```
Rubric type
  ( ) Standard levels        (•) VO-track matrix

Tracks as columns:  [x] Mavo (VMBO-T)   [x] HAVO   [x] VWO   [+ track]
                    └ label editable per column (decision 1)

Bands:  (1) (2) (•3) (4) (5)          ⓘ bands are the rows inside each cell
  code   label                 points   verdict ≥
  [IO]   [In Ontwikkeling]      [0]      [ 0]%
  [B ]   [Beheerst]             [1]      [55]%
  [E ]   [Expert]               [2]      [80]%
  [+ band]                              reset cutoffs to even spread

Weights:  (•) Equal  ( ) Let me weight criteria
```

- Adding a band with `+ band` inserts a column of textareas in every criterion (`syncBandLevels`).
- Removing a band is allowed but warns when any `StudentRubric` has a grade on it.
- Points edit goes through `applyBandPoints` — one dialog, n criteria updated (decision 4).
- `Weights: Equal` is the default and hides the per-criterion weight input; switching to
  *Let me weight criteria* sets `trackMatrix.weighted = true` and reveals it (decision 3).
  Equal is implemented as the same constant weight on every criterion — since
  `calcWeightedScore` normalises by total weight, that is mathematically equal weighting with
  **no engine change**.

### 5.2 Criteria editor

New component `src/components/Rubric/TrackMatrixEditor.tsx`, rendered by `RubricBuilder`
instead of `CriterionCard` when `rubric.trackMatrix` is set (keeps `CriterionCard` — already
~1100 lines — untouched rather than growing a third layout branch).

Per criterion, an editable grid, one row per band, one column per track:

```
┌ Spelling en woordenschat ─────────────────────────── ⋮ ⧉ 🗑 ┐
│ Band        │ Mavo (VMBO-T)         │ HAVO                  │ VWO            │
│ ────────────┼───────────────────────┼───────────────────────┼────────────────│
│ IO (0 pt)   │ [>8 spelfouten      ] │ [>6 spelfouten      ] │ [>3 spelfouten]│
│ B  (1 pt)   │ [4–8 spelfouten     ] │ [3–6 spelfouten     ] │ [2–3 spelfouten│
│ E  (2 pt)   │ [0–3 spelfouten     ] │ [0–2 spelfouten     ] │ [0–1 spelfout ]│
│                                                                              │
│ ⋯ CEFR · standards · subitems                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

- One shared `onUpdateBand(cid, bandId, track, text)`, one `onToggleTrack(track)`.
- Collapsed state shows band chips (`IO` / `B` / `E`) like `CriterionCard` does today.
- Drag/reorder criteria, duplicate and delete reuse the existing callbacks 1:1.
- CEFR badges, linked standards and sub-items keep their current per-criterion behaviour — a
  matrix rubric is still a first-class rubric (a band can still carry a checklist if wanted,
  via the existing `subItems` on the derived level).
- Duplicating a rubric or using a template must deep-copy `trackDescriptors` and `bands`
  (verify how `criteria` is copied today and match it).

### 5.3 "Verplichte eisen"

A rubric-level list of requirements (the three rules in the attached sheet). Rendered as a
checkbox strip at the top of the grading page: `[x] ID-kaart volledig  [x] Zelf geschreven
[x] Op tijd gewerkt`. Stored on `StudentRubric.requirementsMet`.

## 6. Grading UI

`GradeStudent.tsx` + `GradingGrid.tsx` need less work than expected, because
`ScoreEntry.levelId` already points at the band:

1. Resolve the student's column once:
   `const track = getEffectiveVoTrack(student, classes.find(c => c.id === student.classId))`.
2. Render a track badge in the header so the teacher sees which column is active
   (`trackLabel`, `VO_TRACK_COLORS[track]`). A single-column rubric hides it.
3. Feed `describeBand(criterion, level, track, rubric)` into the grid wherever
   `level.description` is used today. That one substitution is what makes cell text
   track-aware.
4. Bands render as **n** buttons labelled `band.code` with `band.label` in the tooltip and the
   band points beside them. The existing per-level button row already does this; only the
   label source changes. Keyboard chords `1..n` map to bands — verify the current chord code
   indexes `criterion.levels` and needs no change for n ≠ 4.
5. Optional "compare all columns" toggle: read-only expansion showing every track side by
   side (useful when a teacher wants the HAVO wording while looking at VWO anchor evidence).
6. Header line matching the source sheet: `Naam · Niveau · Eindbeoordeling: B`, computed with
   `overallBand(percentage, requirementsMet, config)`, with a small "capped at IO —
   requirement 2 not met" hint when the gate is what limited the verdict.

Keyboard chords, comment bank, voice feedback, override points and evidence attachments are
untouched — they operate on `criterionId`/`levelId`, both unchanged.

## 7. Exports and preview

- `src/utils/pdfExport.ts` — add `buildTrackMatrixGridHtml(rubric, sr)`, dispatched next to
  the existing `if (rubric.scoringMode === 'single-point')` branch (`pdfExport.ts`, the
  `buildSinglePointGridHtml` dispatch). Columns are
  tracks, each cell stacks bands in order with the achieved band emphasised (bold + accent
  background), unselected bands muted. Renders correctly for n bands because it iterates
  `matrixBands()`. Include the header row and the requirement checklist.
- `src/utils/docxExport.ts` — same table shape through the `docx` library, reusing the existing
  header-colour styling. Points column hides when `band.points` are all 0 (a purely ordinal
  rubric, as the source sheet is).
- `src/pages/RubricPreviewPage.tsx` — the grid is already `repeat(auto-fit, minmax(140px,
  1fr))`, but it maps over `criterion.levels` (`RubricPreviewPage.tsx:126–132`), so swap the
  axis to tracks and stack bands inside each cell; `criterion.levels.length` is now the band
  count, so the current code would silently render bands as columns.
- Blank/printable variant (`buildEmptyRubricHTML`) is the *most useful* export here — it is
  exactly the sheet teachers hand out.
- Share codes / marketplace: pass `trackMatrix` through `handleImportFromCode`
  (`RubricList.tsx:246`) and the share-code encoder; both are JSON passthrough, so it is one
  field each plus a test. A shared matrix rubric opened by a school with different tracks still
  renders, thanks to the nearest-track fallback.

## 8. Comparative grading

Per decision 5, `ComparativeGrading.tsx` gets a **compact band view by default**: one cell per
(criterion, student) showing that student's band chip and percentage, which is valid across a
mixed-track class because bands are the common scale. An "expand wording" toggle reveals each
student's own track descriptor inline. No change to the aggregation logic — it already works
on points and percentages.

## 9. What deliberately does **not** change

| Area | Why it is safe |
|---|---|
| `gradeCalc.ts` | Bands are single-point levels; every function already works |
| `ScoreEntry` | `levelId` already carries the band id |
| `StudentRubric` jsonb | Only additive `requirementsMet` |
| Supabase schema, RLS, migrations | `data jsonb` absorbs the new fields |
| `syncMerge` / `syncDiff` | Operate on whole records, keyed by `updatedAt` |
| `rubric_versions` snapshots | Snapshot is a full `Rubric`, so it already carries the matrix |
| CEFR aggregation | Bands may optionally carry `cefrLevel`; untouched otherwise |
| Statistics/analytics | Consume percentages, not descriptors |

## 10. File inventory and rough effort

| Phase | Files | Effort |
|---|---|---|
| 1. Model + pure logic | `types/index.ts` (+~55), `utils/trackMatrix.ts` (new ~240), `utils/trackMatrix.test.ts` (new ~300) | 0.5 day |
| 2. Authoring | `pages/RubricBuilder.tsx` (+~140), `components/Rubric/TrackMatrixEditor.tsx` (new ~340), `components/Rubric/BandConfigPanel.tsx` (new ~180), `locales/*` (5 files, ~25 keys), tests | 2 days |
| 3. Grading | `pages/GradeStudent.tsx`, `components/Grading/GradingGrid.tsx` (+~90 combined), verdict chip, tests | 1 day |
| 4. Comparative view | `pages/ComparativeGrading.tsx` (compact + expand) | 0.5 day |
| 5. Exports + docs | `pdfExport.ts`, `docxExport.ts`, `RubricPreviewPage.tsx`, `DocsPage.tsx`, `README.md`, `LandingPage.tsx` | 1 day |
| 6. Requirement gate | `GradeStudent.tsx`, `StudentRubric.requirementsMet`, builder list editor | 0.5 day |
| 7. (follow-up) DOCX import | `components/Rubric/ImportRubricModal.tsx`, new `utils/parseTrackMatrixDocx.ts` via Mammoth | 1 day |

Phases 1–3 are the shippable MVP: create a matrix rubric, grade a student in their track.
Phase 5 is required by the repo's documentation-maintenance rule (`DocsPage`, `README`,
`LandingPage` must be updated in the same task as any user-facing feature).

## 11. Import from the teacher's existing sheet (phase 7, high value)

Mammoth already ships in the project and the text is machine-splittable: each table cell is a
sequence of `<CODE>:` markers followed by bullet paragraphs, and the header row is
`Onderdeel | Mavo | Havo | VWO`. A parser that

1. maps the header cells to tracks (`Mavo` → `vmbo-tl`, `Havo` → `havo`, `VWO` → `vwo`) while
   keeping the printed label as `TrackColumn.label`,
2. derives the band list from the markers it finds (`IO:`, `B:`, `E:` → `bandPreset(3)`),
3. splits each cell's bullets on those markers into `trackDescriptors[track][bandId]`,

would let a teacher open their existing sheets instead of retyping them — which is the real
adoption blocker, since these documents already exist in bulk. Keep it best-effort with a
preview table and manual correction, matching how `ImportRubricModal` already previews.

## 12. Tests

- `utils/trackMatrix.test.ts` — `resolveTrackText` fallback chain (exact → nearest → `''`);
  `syncBandLevels` idempotency, band insert/delete/reorder, and the invariant that existing
  level ids never change; `applyBandPoints` updates every criterion; `equalizeWeights`;
  `overallBand` across n bands, including the requirement gate and a 1-band rubric;
  `bandPreset(1..5)` shape.
- `components/Rubric/__tests__/TrackMatrixEditor.test.tsx` — typing in a cell updates only
  that (criterion, band, track); toggling a track adds a column without losing text; adding a
  band adds a row everywhere; collapsing works.
- `pages/__tests__/RubricBuilder.test.tsx` — switching a standard rubric to matrix derives
  levels from bands; switching back does not destroy the standard levels.
- `pages/__tests__/GradeStudent.coverage.test.tsx` — a havo student on a 3-track rubric sees the
  havo text; a student with no track falls back and shows a hint; a 1-band and a 5-band rubric
  both render the right number of buttons; the chord keys map correctly.
- `pages/__tests__/ComparativeGrading.test.tsx` — compact band view across mixed tracks.
- `utils/pdfExport.test.ts` — matrix grid emits one column per track and marks the achieved band
  for n = 1…5.
- Locale parity test already enforces the new keys in all five locales.
- One e2e spec: author a 3-track/3-band rubric → link to a class with a havo student → grade →
  check the verdict chip.

## 13. Risks

1. **Band deletion with grades.** Dangling `levelId` silently scores 0. Mitigation: count
   affected `StudentRubric` entries before deletion and warn; rubric version history
   (`rubric_versions`) makes it recoverable.
2. **Levels are now derived.** Any code that *writes* `criterion.levels` on a matrix rubric
   (importers, templates, the single-point descriptor editor) must go through
   `syncBandLevels`, or band and level will disagree. Guard with a dev-only invariant check in
   `RubricBuilder` save.
3. **Very wide grids.** 5 bands × 5 tracks = 25 textareas per criterion. Mitigation: only the
   selected tracks render, plus a per-column collapse, and the editor is scrollable
   horizontally like the current level strip.
4. **`n ≠ 4` chord assumptions.** The numeric grading chords assumed up to 4–5 levels; verify
   rather than assume, and test 1 and 5 bands.
