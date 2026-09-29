# Phase 34 — Deterministic Writing Analytics for Essays

**Status:** Implemented (34.1, 34.1b, 34.2) on `claude/kind-meitner-ppgybj`.

**Goal:** Close the stats half of Writing Workshop Feedback Mode with rule-based, no-AI analytics: a per-essay statistics panel in the grading view and a cross-essay weak-criterion trend view. Built on the logic already shipped in vocabkitchen-CLI.

**Scope guardrails:** no AI generation (root `CLAUDE.md`); offline-capable; deterministic; student-facing practice is a later expansion, so the utilities take plain text and are UI-agnostic.

## 34.1 Per-essay text statistics

- `src/utils/essayTextStats.ts` — word/sentence counts, sentence-length mean/variance/std-dev/min/max, transition-word frequency by category, Flesch-Kincaid grade and Flesch Reading Ease.
- Syllable counter, sentence splitter and formulas are ports of `analysis.py` in vocabkitchen-CLI. Shared parity cases live in `sync/writing-fixtures.json` and are asserted by `essayTextStats.test.ts` (and by `test_text_report.py` in the CLI).
- UI: `src/components/Essay/EssayStatsPanel.tsx`, rendered in `DocumentAnalysisPanel` (grading view).

## 34.1b Grammar range (CEFR-J) via a UD parse

- The CLI's `grammar_profile.py` runs rules over a spaCy parse. There is no spaCy for JS, so the rules are ported (`src/utils/grammarProfile.ts`) onto a Universal Dependencies parse from `udpipe-wasm` (UDPipe compiled to WebAssembly).
- `src/utils/udParse.ts` reads the raw CoNLL-U itself because `udpipe-wasm`'s own reader drops the Penn tag and FEATS columns the rules need. UD differences from spaCy handled in the ports: copulas are children (`cop`), infinitival "to" is a `mark`, "when" is an `advmod`, `obj`/`aux:pass`/`acl:relcl` are normalised to the spaCy-style labels.
- `src/data/grammarConstructions.ts` is generated from the CLI's `_CONSTRUCTIONS` registry and the CEFR-J Grammar Profile (Tono Laboratory, TUFS), so levels match the CLI.
- Tests replay recorded CoNLL-U snapshots (`src/utils/__fixtures__/`) so no model or wasm download is needed in CI. All 33 of the CLI's `detect_check` cases pass through the same detectors; get-passive ("The window got broken.") relies on a fallback because UDPipe tags "broken" as an adverb.
- **Model licensing:** the UD 2.5 English model is CC BY-NC-SA, so it is not committed or bundled. Deployments download it into `public/models/` (see `public/models/README.md`); without it the panel is hidden and the compromise-based profile from `grammarChecker.ts` remains the fallback.
- **Known limits:** UDPipe is less accurate than spaCy on some constructions (e.g. tag questions, causatives with unusual attachments). **The panel is a range indicator, not a grade.** It is shown as such in the UI and docs, and its output never feeds an automatic score.

## 34.2 Cross-essay weak-criterion trends

- `src/utils/writingTrendAggregator.ts` follows the `learningPathAggregator` shape. Essays are graded `StudentRubric`s (graded, handed in, not a peer review, not deleted) whose `(rubricId, studentId)` has an `EssayAssignment`. Criteria are matched by name so copied rubrics stay on one line.
- Per criterion: chronological series, least-squares slope, `improving | declining | flat`, and `persistentWeak` (last `minPoints` essays all at or below the threshold; defaults 60% / 3 essays / ±2 points per essay).
- UI: `StudentWritingTrendsCard` on the student profile (Overview) and `ClassWritingTrendsCard` on the Statistics page for the selected class.

## CLI sync

- vocabkitchen-CLI gains `writingStats` (sentence-length stats and transition counts) in `analysis.py`, schema version 1.4, using the same transition list and checked against the same fixtures.
