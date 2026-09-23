# Phase {N} — EFL test builder: matrix/grid & word-bank cloze question types

Plan: `docs/TEST_BUILDER_EFL_EXPANSION_PLAN.md` (§4 B1, B2). The two new types with the biggest authoring-time savings for Cambridge-style papers. Requires the scoring parity test from the previous phase.

### Matrix / grid (`matrix`, B1)

- [ ] N statements × shared option columns (Right / Wrong / Doesn't say; A/B/C; multiple matching of texts à la FCE Part 7)
- [ ] Per-row scoring with partial credit
- [ ] Editor, student view, results, ResponsesGrid, answer text/export, bank import, both edge-function scorers

### Word-bank cloze (`cloze-bank`, B2)

- [ ] Cloze markup + draggable word/sentence tiles, extra distractor tiles, "each tile used once" option
- [ ] Covers A1–B1 word boxes and FCE Part 6 gapped text (sentence tiles)
- [ ] Keyboard / click fallback for drag-and-drop
- [ ] Same touchpoint checklist as above

### Done when

- [ ] Item analysis reports per-row / per-gap accuracy; five locales; docs updated
