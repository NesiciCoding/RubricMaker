# Phase {N} — EFL test builder: authoring aids & read-aloud accommodation

Plan: `docs/TEST_BUILDER_EFL_EXPANSION_PLAN.md` (§3 A1, A3, A4; §6.2). Pure authoring aids that emit **existing** question types: no schema or scorer change, deterministic, offline.

### Cloze generators (A1)

- [ ] "Generate gaps" menu in the cloze editor, rewriting a pasted passage into `{{…}}` markup
- [ ] Fixed-ratio cloze (every n-th word after sentence 1)
- [ ] C-test (second half of every second word, sentences 2+)
- [ ] Part-of-speech cloze via compromise (prepositions, articles, modals, past-tense verbs), auto-linking the matching grammar item
- [ ] Above-level vocabulary cloze from the CEFR index (`src/data/cefrLevels.ts`)
- [ ] Academic cloze (AWL/NAWL)
- [ ] Teacher reviews and toggles gaps in the existing `ClozeGapEditor`

### Passage level check (A3)

- [ ] Section editor shows `computeTargetVerdict` (suitable / slightly hard / too hard) against the section or test CEFR level
- [ ] Above-level words listed, with one-click glossary note / pre-teaching deck (reuse the Phase 42 deck-seed action)

### Deck / vocabulary list → questions (A4)

- [ ] Generate matching, definition→word MC (same-deck / same-level distractors), cloze from card `example`, categorize by part of speech
- [ ] Output to the question bank, tagged with the deck name

### Per-student read-aloud (TTS) accommodation (§6.2)

- [ ] New per-student setting in the Students add/edit modal: "Read-aloud in tests"
- [ ] When on: read-aloud for passages, prompts and options in every test mode, including assessment and placement
- [ ] When off: read-aloud hidden in graded tests (practice keeps it)
- [ ] Results page flags submissions that used the accommodation
- [ ] Sync the setting through Supabase, and keep it working offline via localStorage

### Done when

- [ ] Unit tests for every generator; all five locales; DocsPage, README and LandingPage updated per CLAUDE.md
