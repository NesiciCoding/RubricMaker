# Phase 42 (near-term) — VocabKitchen vocabulary-engine integration

**Status:** Proposed. This is the concrete implementation plan for the first,
self-contained slice of Phase 42 as scoped in
`docs/OPTION_B_PHASE_36-42_PLAN.md` → _"Phase 42 — Vocabulary insights
consolidation"_ and its "Forward-looking: integrate the VocabKitchen-CLI
analysis tools" table.

**Source repo:** `https://github.com/NesiciCoding/vocabkitchen-CLI` (a
rule-based, no-AI EFL profiler; MIT/CEFR-J/AWL/NAWL data, see licensing below).

**One-line scope:** replace RubricMaker's two hand-maintained CEFR word
dictionaries with VocabKitchen's single validated **64k-word CEFR index**, add
**Academic Word List (AWL/NAWL)** scoring and an **off-list %**, and add a
teacher-facing **"is this reading right for my class?" target-level verdict** —
all client-side, offline-capable, deterministic, no new runtime dependency.

---

## 0. Scope decision — what is in, and what is deliberately out

VocabKitchen has two engines. They integrate very differently against this
repo's hard constraints (`CLAUDE.md`: **no AI, no paid deps, offline-capable,
deterministic, client-side**):

| VocabKitchen engine | Runtime | Verdict for this slice |
| --- | --- | --- |
| **Vocabulary profiler** (`vocab_profile.py`) | Python **stdlib only** — the engine is really just the `WordLists/CEFR/levels.json` data (64,166 words → `{level, pos}`) + AWL/NAWL `.txt` lists | **IN.** The value is data, not code. It ports to the browser as a bundled JSON asset; our existing TS profiler becomes a thin scorer over it. |
| **Grammar profiler** (`grammar_profile.py`) | Requires **spaCy + `en_core_web_sm`** (a ~12 MB ML model) | **OUT (this slice).** Cannot run in the browser; only reachable via a server-side edge function, which breaks offline-capable/deterministic-client and is a separate, larger decision. Our existing regex/`compromise` grammar profiler (`grammarChecker.ts`) stays as-is. |

So this plan upgrades **only the vocabulary half**. It also intentionally does
**not** build the full "Vocabulary Insights hub" tab shell or the cross-deck
flashcard consolidation — those remain the rest of Phase 42. This slice makes
the vocabulary engine correct and richer; the hub work sits on top of it later.

**Data volume note (drives the architecture below):** the CEFR index is
**3.5 MB raw / ~271 KB gzipped** — 6× the word coverage of today's dictionaries.
It must be treated like the repo already treats a heavy dependency (mammoth,
pdfjs, tesseract, jszip are all `await import()`-ed), i.e. loaded on demand, not
eagerly bundled into a route chunk.

---

## 1. Deliverables

1. **CEFR index upgrade** — 64,166-word validated `{level, pos}` index replaces
   `cefrjVocabulary.ts` (~8.6k words) + `openCefrVocabulary.ts` (~3.7k words,
   self-described "APPROXIMATE" bands). Exact surface-form matching (the lists
   are pre-inflected) replaces today's heuristic stemming.
2. **Academic Word List scoring** — AWL (Coxhead, 570 families / ~3.1k forms) +
   NAWL (~2.1k forms) membership + an academic-coverage % the app cannot report
   today at all.
3. **Off-list %** — share of content words outside the CEFR index (proper
   nouns, typos, rare/technical), surfaced in the analysis panel and dashboard.
4. **Target-level verdict** — port of `text_report.py --target-level` logic: for
   a chosen class CEFR level, report coverage %, which words exceed the level,
   and a one-line "suitable / slightly hard / too hard" verdict. This is
   VocabKitchen use-case #1 ("Is this reading right for this class's CEFR?")
   and the single highest-value teacher feature in the set.
5. **One-click deck seed** — "above-target words → new flashcard deck" action
   (use-case #2), reusing the existing deck-authoring flow.
6. **Drops** — remove the two superseded dictionaries + the stemming heuristic +
   the aggregator's re-profiling hot path (see §6).

Grammar, the hub tab shell, and cross-deck flashcard consolidation are **out of
this slice** (§9 Out of scope).

---

## 2. Architecture & bundling (the load-path decision)

Today `profileText()` is **synchronous** and its data is **eagerly imported** at
module scope; it is called synchronously in three places
(`vocabProfileAggregator.getLevelCounts`, `collectVocabExportRows`, and the
`DocumentAnalysisPanel` `cefrProfile` useMemo). Eagerly bundling a 271 KB-gz
index into those chunks would bloat the grading/essay and dashboard routes and
trip the bundle-analysis CI job.

**Decision: lazy-load the index and persist computed distributions on the
analysis record**, mirroring the philosophy already documented on
`DocumentAnalysisResult.vocabEstimatedLevel` ("precomputed at analysis time so
the CEFR aggregator doesn't have to load the NLP profilers"):

- `cefrVocabularyProfiler.ts` gains `async ensureVocabularyIndex()` that
  `await import('../data/cefrLevels.json')` (+ academic lists) once and memoises
  a module singleton. The pure scoring stays sync internally; the public
  `profileText` becomes **async** (`await`s the singleton, then scores).
- Vocabulary profiling runs **only inside the async `handleAnalyse` path** in
  `DocumentAnalysisPanel`, where extraction and grammar checks are already
  awaited. The full distribution (level counts, off-list %, academic coverage,
  capped highlight list) is written onto the `DocumentAnalysisResult` and
  persisted through the normal storage path (§5, storage rule respected).
- `vocabProfileAggregator` and `collectVocabExportRows` **read the persisted
  distribution** off each result instead of re-profiling — so the dashboard and
  CSV export pull in **zero** vocabulary data and stay fast. Records analysed
  before this field exists are handled exactly like the existing
  `vocabEstimatedLevel` back-compat note (omit the badge / lazily backfill).
- The `DocumentAnalysisPanel`, when re-opened on an **old** result lacking the
  stored distribution, backfills once via an async effect
  (`ensureVocabularyIndex()` → compute → nothing persisted unless re-analysed).

Net effect: the 271 KB-gz index loads only when a teacher actually runs an
analysis, and never on the dashboard, export, or app boot. This is the same
on-demand pattern the repo already uses for every heavy asset.

**Alternative considered (rejected):** keep `profileText` sync and eager-import
the index. Simpler diff, but permanently adds 271 KB-gz to the grading/essay and
dashboard chunks and contradicts the documented precompute philosophy. Rejected
on bundle grounds.

---

## 3. Data assets to vendor

Vendor the generated VocabKitchen artifacts (we do **not** run Python at build
time — same posture as the already-vendored `cefrjVocabulary.ts`):

| New file | Source (VocabKitchen) | Shape | Approx size |
| --- | --- | --- | --- |
| `src/data/cefrLevels.json` | `WordLists/CEFR/levels.json` (`.words`) | `{ [word]: { level: CefrLevel; pos: string } }` | 3.5 MB raw / 271 KB gz |
| `src/data/academicWordLists.json` | `WordLists/AWL/awl.txt` + `WordLists/NAWL/nawl.txt` | `{ awl: string[]; nawl: string[] }` | ~55 KB |
| `docs/VOCAB_WORDLISTS_PROVENANCE.md` | `WORDLISTS.md` | provenance + licence + source commit SHA | — |

- **Conversion:** a one-off `scripts/build-cefr-index.mjs` (Node, dev-only, not
  in the app bundle) that reads the three VocabKitchen files and emits the two
  JSON assets, so the vendoring is reproducible and re-runnable when VocabKitchen
  updates. Record the source repo commit SHA in the provenance doc.
- **Licensing (all permit bundling with attribution — same posture as today's
  CEFR-J data):** CEFR core = MIT (Words-CEFR-Dataset); CEFR gap-fill = CEFR-J /
  Octanove (free commercial **with citation**); AWL = Coxhead (research/education
  use); NAWL = CC BY. Keep the existing CEFR-J attribution line in
  `DocumentAnalysisPanel` and extend it to name the AWL/NAWL sources; the
  provenance doc carries the full text.
- **`pos` field:** retained — it feeds the deck-seed part-of-speech and aligns
  with the flashcard `phonetic`/`partOfSpeech` fields (Phase 41.2b). It is not
  used for leveling.

---

## 4. Type changes — `src/types/index.ts`

Extend the CEFR profiling types (keep every existing field for back-compat):

```ts
export interface CefrWordHit {
    word: string;
    level: CefrLevel;
    pos?: string;            // NEW — from the index, used by the deck seed
}

export interface AcademicCoverage {
    awlPercent: number;      // % of content words on the AWL
    nawlPercent: number;     // % on the NAWL
    academicWords: string[]; // capped, de-duplicated, for display/seed
}

export interface CefrVocabProfile {
    levelCounts: Record<CefrLevel, number>;
    highlightWords: CefrWordHit[];
    estimatedLevel: CefrLevel;
    offListPercent: number;      // NEW
    academic: AcademicCoverage;  // NEW
}

// text_report.py --target-level port
export interface TargetLevelVerdict {
    targetLevel: CefrLevel;
    coveragePercent: number;        // share of content words at/below target
    aboveTargetWords: CefrWordHit[]; // capped
    verdict: 'suitable' | 'slightly_above' | 'too_hard';
}
```

Extend `DocumentAnalysisResult` with the persisted distribution (all optional,
back-compat; lists capped to keep the synced payload small):

```ts
    vocabLevelCounts?: Record<CefrLevel, number>;
    vocabOffListPercent?: number;
    vocabHighlightWords?: CefrWordHit[];   // cap 30 (as today's highlightWords)
    academicCoverage?: AcademicCoverage;   // academicWords cap ~40
```

`CefrGrammarProfile` / `CefrGrammarHit` / `CefrTextProfile` are **unchanged**
(grammar is out of scope).

---

## 5. Code changes — file by file

### 5.1 `src/utils/cefrVocabularyProfiler.ts` (rewrite core)
- Replace the two static dict imports + `MERGED_VOCABULARY` with a lazily
  imported index singleton: `async ensureVocabularyIndex()`.
- **Drop `normalise()` stemming** — the index is pre-inflected and expects exact
  case-insensitive surface-form matching (per VocabKitchen `WORDLISTS.md`
  "Accuracy notes"). Keep only lowercase + possessive strip in `tokenise()`.
  Keep `SKIP_WORDS` (function words) for the content-word estimate.
- `profileText` becomes `async` and returns the enriched `CefrVocabProfile`
  (adds `offListPercent`, `academic`). Off-list = content tokens not in the
  index. Academic % = content tokens whose surface form is in AWL/NAWL.
- Keep the existing `estimatedLevel` 5%-share heuristic and 30-cap highlight
  behaviour so downstream UI/thresholds are stable.

### 5.2 `src/utils/academicWordList.ts` (new)
- Loads `academicWordLists.json` (via the same lazy singleton), exposes
  `classifyAcademic(word)` → `'awl' | 'nawl' | null` and
  `academicCoverage(tokens)` → `AcademicCoverage`. Pure, unit-tested.

### 5.3 `src/utils/textLevelVerdict.ts` (new)
- Port of `text_report.py --target-level`: `computeTargetVerdict(profile,
  target)` → `TargetLevelVerdict` (deterministic; coverage %, above-target
  words from `highlightWords`, thresholded verdict). No AI, no network.

### 5.4 `src/utils/vocabProfileAggregator.ts`
- `getLevelCounts` reads `result.vocabLevelCounts` when present; **remove the
  `profileText` import and the module-level `profileCache`** (no more
  re-profiling on the dashboard). Aggregate academic/off-list across results.
- `collectVocabExportRows` reads `result.vocabHighlightWords` instead of calling
  `profileText`; add an optional `academic` column to the CSV.

### 5.5 `src/components/Essay/DocumentAnalysisPanel.tsx`
- `handleAnalyse`: `await ensureVocabularyIndex()`, compute the full profile,
  and store `vocabLevelCounts` / `vocabOffListPercent` / `vocabHighlightWords` /
  `academicCoverage` on the new `DocumentAnalysisResult` (alongside the existing
  `vocabEstimatedLevel`/`grammarEstimatedLevel`).
- `cefrProfile` useMemo → render from the stored distribution; if absent (old
  record), backfill via an async effect. Grammar rendering unchanged.
- Add an **Off-list %** stat and an **Academic (AWL/NAWL)** row to
  `CefrProfilePanel`, plus a **target-level selector → verdict** line
  (`textLevelVerdict`). Extend the attribution footer to cite AWL/NAWL.

### 5.6 `src/pages/VocabularyDashboardPage.tsx`
- Add an **off-list %** and **academic coverage** column to the per-student
  drill-down table (read from the aggregated persisted data).
- Add a **class target-level selector** that runs the verdict over the class's
  pooled distribution ("VWO 4's readings sit at ~B1; 8% above target").
- Add a **"Seed a flashcard deck from above-target words"** button →
  pre-fills the existing deck-create flow with `{ word, pos }` from
  above-target `highlightWords` (respects `isOffline()`/StorageSync — no direct
  localStorage). Ties into use-case #2 / Phase 41.2b.

---

## 6. What can be dropped (the user's explicit ask)

| Dropped | Why it's safe | Replacement |
| --- | --- | --- |
| `src/data/openCefrVocabulary.ts` (~3.7k words) | Imported **only** by `cefrVocabularyProfiler.ts` (verified). Its own header calls the bands "APPROXIMATE" (frequency-heuristic). | Fully subsumed by the validated 64k index. |
| `src/data/cefrjVocabulary.ts` (~8.6k words) | Imported **only** by the profiler + its own test. The index already **includes** the CEFR-J profile (gap-fill) plus the MIT core, so cefrj is a strict subset. | Subsumed by the index; CEFR-J **attribution is retained** in the panel + provenance doc. |
| `src/data/cefrjVocabulary.test.ts` | Tests data being removed. | Replaced by `cefrLevels.test.ts` index-integrity test (§7). |
| `normalise()` stemming in the profiler | Index is pre-inflected; stemming now *causes* false matches rather than fixing misses. | Exact surface-form matching. |
| `profileCache` + `profileText` calls in the aggregator | Distribution is now persisted on the record; re-profiling is dead weight. | Read persisted `vocabLevelCounts`. |

**Net:** ~12.3k lines / ~235 KB of hand-maintained, partly-approximate TS
**source** removed, replaced by one reproducible, validated, larger index that
is lazy-loaded. Source LOC drops even though on-demand data size grows.

**Explicitly NOT dropped:** `grammarChecker.ts` (grammar engine — out of
scope), `cefrjGrammar.ts` (grammar standards data), `freeDictionaryApi.ts` /
`cambridgeApi.ts` (they supply **definitions + phonetics**, which the CEFR index
does not carry; the index only newly covers CEFR level + POS offline).

---

## 7. Tests (adapt & add) — keep coverage ≥ 65/60/58

- **`cefrVocabularyProfiler.test.ts`** — adapt to `async profileText`; keep the
  estimated-level and 30-cap assertions; add cases for `offListPercent`,
  `academic`, and surface-form matching (a stemming false-positive that used to
  match must now not). Await `ensureVocabularyIndex()` in `beforeAll`.
- **`academicWordList.test.ts`** (new) — AWL/NAWL membership + coverage %.
- **`textLevelVerdict.test.ts`** (new) — verdict thresholds at/around each band;
  above-target word extraction; empty-text edge case.
- **`cefrLevels.test.ts`** (new, replaces `cefrjVocabulary.test.ts`) — index
  integrity: every entry has a valid `CefrLevel`; spot-check known words
  (`cat`→A1, `phenomenon`→B2-ish); no empty keys.
- **`vocabProfileAggregator.test.ts`** — feed results carrying persisted
  distributions; assert no `profileText` call; add academic/off-list aggregation
  cases and a back-compat case (result without the new fields).
- **`DocumentAnalysisPanel` tests** (`__tests__` + `.coverage.test.tsx`) —
  update for stored-distribution rendering, the off-list/academic UI, the
  target-level verdict, and the deck-seed button; mock the lazy JSON import.
- **Data-size guard:** the two big JSON assets are `import()`-ed, so they don't
  count against function/branch coverage; keep them out of the coverage globs if
  Istanbul tries to instrument them.
- Run `npm run check` (typecheck + lint + format + unit) before every push;
  no new e2e specs are required (no new route), so `playwrightProjects.test.ts`
  is unaffected.

---

## 8. i18n — all five locales (parity test enforces it)

Add keys under the existing `vocabProfile.*` and `analysis.*` namespaces to
**en, nl, fr, de, es** (the `src/locales/__tests__` parity test fails otherwise):
`analysis.off_list`, `analysis.off_list_tooltip`, `analysis.academic_coverage`,
`analysis.awl` / `analysis.nawl`, `analysis.target_level`,
`analysis.verdict_suitable` / `_slightly_above` / `_too_hard`,
`analysis.awl_nawl_attribution`, and `vocabProfile.seed_deck`,
`vocabProfile.column_off_list`, `vocabProfile.column_academic`,
`vocabProfile.target_level_label`. Never hardcode English in JSX.

---

## 9. Documentation surfaces (mandatory per root `CLAUDE.md`)

1. **`src/pages/DocsPage.tsx`** — extend the vocabulary/analysis coverage
   (currently no dedicated profiler entry) in `AnalyticsTab`/`GradingTab`: what
   the CEFR/AWL/off-list profile shows, the target-level "right for my class?"
   verdict, and the deck-seed action. No new route → `ROUTE_TREE` unchanged.
2. **`README.md`** — add `cefrVocabularyProfiler` / `academicWordList` /
   `textLevelVerdict` to the **Key utility modules** table; note the vendored
   index + provenance doc in the data section. Routes table unchanged.
3. **`src/pages/LandingPage.tsx`** — update the existing "Vocabulary & Grammar"
   teacher card (line ~69) to mention academic-vocabulary and reading-level
   screening; no new card needed.

---

## 10. Standards checklist (`CLAUDE.md` conformance)

- [x] **No AI generation** — pure rule-based lookup/aggregation; the grammar
      (spaCy) engine is explicitly excluded.
- [x] **Offline-capable / no paid deps** — bundled JSON, `await import()`, no
      network. (The unrelated LanguageTool grammar call is unchanged.)
- [x] **Deterministic** — surface-form matching, fixed thresholds.
- [x] **Storage rule** — distributions persist through the normal dispatch →
      `storage.ts` path gated by `isOffline()`; **no direct `localStorage`
      writes**; no new full-array snapshot writes; sync payload lists are capped.
- [x] **Domain hooks** — dashboard keeps consuming `useAssessment` /
      `useAuthoring` / `useStudents` / `useClasses`; no `useApp()` revival.
- [x] **Types centralised** in `src/types/index.ts`; no ad-hoc inline shapes.
- [x] **Styling** via existing CSS custom properties / inline style; dataviz
      palette for any new chart (load the `dataviz` skill if a chart is added).
- [x] **i18n parity** across five locales; **docs trio** updated in the same PR.
- [x] Comments only where the _why_ is non-obvious.

---

## 11. Suggested PR sequencing (small, reviewable, each green on its own)

1. **PR-1 — data + engine (no UI):** vendor the two JSON assets + provenance +
   `scripts/build-cefr-index.mjs`; rewrite `cefrVocabularyProfiler` (async,
   index-backed, off-list, academic); add `academicWordList` + `textLevelVerdict`
   utils; **drop the two dicts + stemming**; full unit tests. Types extended.
2. **PR-2 — persistence + aggregator:** extend `DocumentAnalysisResult`; store
   the distribution in `handleAnalyse`; switch `vocabProfileAggregator` /
   `collectVocabExportRows` to persisted data; back-compat handling + tests.
3. **PR-3 — UI + docs:** off-list/academic/target-verdict in the panel and
   dashboard; deck-seed action; i18n ×5; DocsPage/README/LandingPage.

Sequencing keeps PR-1 shippable behind the existing surfaces (the panel still
awaits the async profiler) and isolates the bundle-size change for the
bundle-analysis CI job to vet on its own.

---

## 12. Risks & open decisions

- **Bundle CI:** confirm the 271 KB-gz index registers as an on-demand chunk,
  not an entry-chunk regression, in the `ci.yml` bundle-analysis job.
- **Async ripple:** making `profileText` async touches the panel's `cefrProfile`
  memo and any test that called it sync — enumerated in §7; no other production
  caller exists (verified).
- **Synced payload growth:** capping `vocabHighlightWords` (30) and
  `academicWords` (~40) keeps `DocumentAnalysisResult` small; confirm against the
  Supabase row-size expectations in `supabase/CLAUDE.md` before PR-2.
- **Estimate stability:** keeping the 5%-share heuristic means existing
  CEFR-estimate snapshots/tests stay valid even though the underlying dictionary
  is larger — but the larger index _will_ shift some estimates; snapshot-style
  assertions should use band ranges (as the current tests already do), not exact
  levels.
- **Open micro-decision:** whether the target-level selector defaults to the
  class's configured CEFR target (from `cefrTrackYearTargets`) or to "none" —
  recommend defaulting to the class target when available.

## 13. Out of scope (later Phase 42 / separate phases)

- Grammar profiler (spaCy) — only via a future edge function; separate decision.
- The full "Vocabulary Insights hub" tab shell + cross-deck flashcard
  consolidation (`computeDeckInsights` aggregation) — the rest of Phase 42.
- VocabKitchen use-cases #5–#8 (material comparison, batch/curriculum) — build
  on this engine once the hub exists.
