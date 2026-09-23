# Test Builder — EFL expansion exploration

**Status:** Exploration / proposal. No code yet. This surveys the tech the app already
ships, what it can build on top of or combine into for the test builder, and only
then branches out into new avenues. Everything is scoped to **EFL** first.

**Hard constraints carried over from `CLAUDE.md`:** no AI/LLM content generation or
auto-grading, deterministic and client-side where possible, offline-capable, all
five locales, Supabase optional.

---

## 1. What the test builder has today

13 question types (`TestQuestionType`, `src/types/index.ts`):
multiple-choice, multiple-response, true-false, short-answer, open, cloze,
cloze-dropdown, matching, ordering, categorize, hot-text, numeric, audio-response.

Plus test-level structure that is already EFL-shaped: sections with a
reading passage (`content`) or shared listening clip (`audioUrl`), per-section CEFR
level, three placement engines (MST routing, staircase, live generator), practice vs
assessment mode, question bank with CEFR/skill/tag facets, grammar-item linking,
item analysis with top-distractor reporting, SEB + proctoring, read-aloud of
passages (`PassageReadAloud`).

### Cost of a new question type (touchpoints)

Adding a type is not cheap — it touches ~11 places, three of which duplicate
scoring logic:

| Area               | File(s)                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Type + data fields | `src/types/index.ts`                                                                                                    |
| Authoring          | `src/components/Tests/QuestionEditor.tsx` (`QUESTION_TYPES`, `changeType`, editor block)                                |
| Student rendering  | `src/pages/StudentTestPage.tsx`                                                                                         |
| Review / grading   | `src/pages/TestResultsPage.tsx`, `src/components/Monitor/ResponsesGrid.tsx`                                             |
| Scoring (client)   | `src/utils/testCalc.ts`                                                                                                 |
| Scoring (server)   | `supabase/functions/submit-test/index.ts`, `supabase/functions/next-placement-question/index.ts` (hand-mirrored copies) |
| Answer text/export | `src/utils/testAnswerText.ts`                                                                                           |
| Bank import        | `src/utils/questionBankImport.ts`                                                                                       |
| i18n + docs        | 5 locale files, `DocsPage.tsx`, README, possibly `LandingPage.tsx`                                                      |

**Implication:** prefer _authoring aids that emit an existing type_ (zero schema,
zero scorer changes) over new types wherever the student experience is the same.
The three scorer copies have since been merged into one shared module (§6.4), so
a new type's scorer is written once.

---

## 2. Available tech inventory (what can be built on)

| Tech already in the repo                                      | Where                                                                                    | Relevance to tests                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **64k-word CEFR index** (surface forms → level)               | `src/data/cefrLevels.ts`, `cefrVocabularyProfiler.ts`                                    | Level-aware gap selection, distractor pools, passage difficulty, vocab-size testing     |
| **Target-level verdict** ("is this text right for B1?")       | `src/utils/textLevelVerdict.ts`                                                          | Passage QA inside the section editor                                                    |
| **AWL / NAWL** academic lists                                 | `src/utils/academicWordList.ts`                                                          | Academic-vocab gap targeting (C1/EAP)                                                   |
| **compromise** NLP (POS tags, verb conjugation, noun plurals) | `grammarChecker.ts`, `DocumentAnalysisPanel.tsx`                                         | POS-based gap generation, morphological distractors, inflection-tolerant matching       |
| **Grammar profiler** (regex + compromise) & grammar standards | `grammarChecker.ts` `profileGrammar`, `data/grammarStandards.ts`, `data/cefrjGrammar.ts` | Finding grammar-structure targets in a passage; tagging questions                       |
| **LanguageTool** (external, public API)                       | `grammarChecker.ts` `checkGrammar`                                                       | **Being phased out** (§6.3) — not to be used by any new test feature                    |
| **Free Dictionary API**                                       | `services/freeDictionaryApi.ts`                                                          | Definitions/phonetics for glossaries and vocab items when authoring                     |
| **Web Speech synthesis (TTS)**                                | `hooks/useTTS.ts`, `PassageReadAloud.tsx`                                                | Listening stimuli without recording audio; dictation; minimal pairs                     |
| **Web Speech recognition**                                    | `react-speech-recognition`, `hooks/useVoiceGrading.ts`                                   | Teacher voice grading today; possible read-aloud transcript aid (see §6 open decisions) |
| **MediaRecorder** + media store                               | `hooks/useMediaRecorder.ts`, `services/mediaStore.ts`, `audioResponseCode.ts`            | Spoken responses (already `audio-response`); prep-time/cue-card speaking tasks          |
| **Camera capture, Tesseract OCR, scan pipeline**              | `useCameraCapture.ts`, `textExtraction.ts`, `scanImport.ts`                              | Importing paper tests/passages; handwritten answer capture                              |
| **Mammoth / pdfjs / read-excel-file / papaparse**             | `textExtraction.ts`, `questionBankImport.ts`                                             | Bulk import of passages and item banks                                                  |
| **Vocabulary lists & flashcard decks** (FSRS)                 | `VocabularyItem`, `FlashcardDeck`, `flashcardScheduler.ts`                               | Generate test items from a deck; feed wrong answers back into study                     |
| **Rubrics + grading UI**                                      | Rubric Builder, `GradeStudent`                                                           | Rubric-scored writing/speaking items inside a test                                      |
| **Cloze / hot-text markup** (`{{a\|b}}`, `[[...]]`)           | `utils/clozeParse.ts`                                                                    | Every "generator" below can emit this markup, so output lands in existing types         |
| **Seeded shuffle, Elo ratings, item analysis**                | `seededShuffle.ts`, placement engines, `ItemAnalysisPanel.tsx`                           | Parallel versions, calibrating new item types, distractor QA                            |
| **@hello-pangea/dnd**                                         | ordering / categorize                                                                    | Drag-based word banks, sentence builders, gapped text                                   |

---

## 3. Tier A — build on top of existing tech (no new question type)

Everything here emits an existing type, so scorers, results, exports and the bank
keep working unchanged. Highest value / lowest risk.

### A1. Cloze generators from a passage

A "Generate gaps" menu in the cloze editor that rewrites a pasted passage into
`{{...}}` markup deterministically:

- **Fixed-ratio cloze** — gap every _n_-th word after the first sentence (classic
  rational-deletion cloze; good for placement).
- **C-test** — delete the second half of every second word in sentences 2+
  (`bec{{ause}}`). Well-established, highly reliable EFL placement format; the
  existing cloze scorer handles it as-is.
- **Part-of-speech cloze** — gap all prepositions / articles / modal verbs /
  past-tense verbs using compromise tags. Maps directly to a linked grammar item.
- **Above-level vocabulary cloze** — gap words at or above a chosen CEFR level from
  the CEFR index (vocabulary-in-context tests).
- **Academic cloze** — gap AWL/NAWL words (EAP / C1).

Teacher reviews the result in the existing `ClozeGapEditor`, can toggle any gap
off, and add alternatives. No new data shape.

### A2. Distractor suggestions for cloze-dropdown and multiple-choice

For a selected gap/answer word, suggest distractors (teacher picks, never auto-inserted):

- **Morphological** — other forms via compromise (`go → went / gone / going / goes`;
  `happy → happily / happiness / unhappy`). Ideal for grammar dropdowns.
- **Same level, same POS** — words from the CEFR index at the same level with the
  same POS tag (vocabulary dropdowns).
- **Common EFL confusables** — a small static list (`make/do`, `say/tell`,
  `since/for`, `affect/effect`, `borrow/lend`, ...), extendable per school.

Item analysis already reports the top distractor per question, so teachers can see
which suggestions actually work.

### A3. Passage level check in the section editor

Run `computeTargetVerdict(passage, test.cefrTargetLevel ?? section.cefrLevel)` on
section content and show "suitable / slightly hard / too hard" plus the
above-level words. One click turns those words into a glossary note or a
pre-teaching flashcard deck (the deck-seed action from Phase 42 already exists).

### A4. Deck / vocabulary list → questions

From a `FlashcardDeck` or `VocabularyItem` list, generate a batch of bank items:

- matching (word ↔ definition / translation),
- multiple-choice definition → word, distractors from the same deck or same CEFR level,
- cloze from each card's `example` sentence with the target word gapped,
- categorize by `partOfSpeech` or topic.

Closes the loop: _study a deck → take a quiz on exactly that deck_. Deterministic;
output goes to the question bank tagged with the deck name.

### A5. Tolerant answer matching for short-answer and open cloze

Today matching is exact after trim + lowercase. Add opt-in normalisation flags per
question:

- punctuation / curly-quote / whitespace normalisation (always safe),
- contraction equivalence (`don't` ≡ `do not`, `I'm` ≡ `I am`),
- British/American spelling equivalence (`colour` ≡ `color`) from a static list,
- **"minor spelling slips accepted"** — Levenshtein ≤ 1 for words ≥ 5 letters, off
  by default and meant for reading/listening items where spelling isn't the
  construct being tested.

Must live in one pure module mirrored into both edge functions (see §1 parity test).

### A6. Listening controls

- **Play limit** per section/question clip (`maxPlays`, typically 2 as in Cambridge
  exams) with a visible counter; enforced client-side, logged as a proctor event.
- **TTS as the audio source** — mark a section's `content` (or a question field) as
  "spoken" so it is played through `useTTS` instead of requiring an uploaded file.
  Useful for quick practice and dictation. For graded tests an uploaded clip is
  recommended because voices differ per device (§6.2).
- **Transcript reveal** in practice mode after submission (reuses `explanation`
  gating).

### A7. Speaking task structure on `audio-response`

- **Preparation time** (`prepSeconds`): countdown, then recording auto-starts.
- **Cue card** content (bullet prompts / image) shown during prep.
- Keep manual scoring, but allow linking a speaking rubric (see B7).

---

## 4. Tier B — combine existing tech into new EFL question types

Ordered by how common the format is in EFL exams and how much existing code they
reuse.

| #   | Type                                      | EFL format it covers                                                           | Built from                                                                    | Scoring                                                                    |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| B1  | **Matrix / grid** (`matrix`)              | Right / Wrong / Doesn't say; A/B/C per statement; multiple matching (FCE Pt 7) | MC data per row, shared column set                                            | Per row, partial credit                                                    |
| B2  | **Word-bank cloze** (`cloze-bank`)        | Gap fill from a box of words (A1–B1); gapped text with sentences (FCE Pt 6)    | Cloze markup + dnd tiles; extra distractor tiles; "each used once" flag       | Per gap, same as cloze-dropdown                                            |
| B3  | **Dictation** (`dictation`)               | Sentence / spelling dictation, "listen and write"                              | TTS or uploaded audio + text input                                            | Word-level alignment (edit distance on tokens), partial credit per word    |
| B4  | **Error correction** (`error-correction`) | Find-and-fix the mistake; proofreading (CPE-style)                             | Hot-text selection + inline short-answer per selected fragment                | Identification point + correction point per error                          |
| B5  | **Key word transformation**               | FCE/CAE Part 4                                                                 | Short-answer + key word + gapped second sentence; 2–5 word limit              | Accepted-answer list split into 2 marked chunks                            |
| B6  | **Word formation**                        | FCE/CAE Part 3                                                                 | Cloze with a stem word per gap (`{{happiness}}(HAPPY)`)                       | Same as cloze; authoring aid suggests derived forms via compromise         |
| B7  | **Rubric-scored task**                    | Writing (email, essay) and speaking tasks inside a test                        | `open` / `audio-response` + existing Rubric and grading UI                    | Rubric total mapped to question points; CEFR per criterion feeds analytics |
| B8  | **Sentence builder**                      | Jumbled words → sentence (A1–A2 word order)                                    | Ordering with auto-tokenised word tiles; multiple accepted orders             | All-or-nothing or longest-correct-run                                      |
| B9  | **Minimal pairs / audio options**         | Pronunciation discrimination (`ship` / `sheep`), "which picture"               | MC with per-option audio (TTS text or file), alongside existing option images | Same as MC                                                                 |

Notes:

- **B1 matrix** is the single biggest time-saver: Cambridge reading/listening parts
  are almost always "N statements × same options", currently authored as N
  separate MC questions with repeated options.
- **B2** covers two formats with one type: word tiles (A-levels) and sentence tiles
  (B2 gapped text). The student UI is drag-and-drop with a keyboard/click fallback.
- **B5/B6** could ship as _modes of cloze/short-answer_ instead of new types if the
  parity-test work in §1 hasn't landed yet — that avoids a server scorer change.
- **B7** is the natural bridge between the test builder and the rubric side of the
  app; it also gives writing/speaking results to the CEFR aggregator with criterion
  granularity instead of a single number.
- For open writing, the results page can show (teacher-side only) the existing
  CEFR vocabulary profile, grammar profile, required-vocabulary checklist
  (`vocabularyAnalyser`) and word count. These are _insights for the teacher_, not
  scores.

---

## 5. Tier C — new avenues (diverging)

- **Vocabulary size / levels test** — a placement component built from the CEFR
  index: yes/no recognition items per level band with pseudowords as a false-alarm
  control (LexTALE / Vocabulary Levels Test style). Deterministic scoring gives a
  receptive-vocabulary estimate per band that the placement result can include.
- **Test → flashcards loop** — after submission, missed vocabulary/grammar items are
  offered as cards in a personal review deck (FSRS schedules them). Links tests to
  the learning path without any AI.
- **Integrated skills tasks** — listen → write a summary; read → speak a response.
  Pure composition of section audio/passage + B7 rubric-scored response.
- **Picture labelling / hotspot** — drag labels onto positions on an image (young
  learners, A1–A2 vocabulary). New interaction and coordinate data; heavier UI.
- **Paper mode with OMR** — printable answer sheets for MC/matrix items, scanned
  back via the existing scan/OCR pipeline (Phase 33). Big win for schools with
  limited devices; significant effort.
- **Parallel versions** — generate A/B versions of a test (seeded shuffle of options
  and items, alternate gap sets from A1) to reduce copying in a classroom.
- **Differentiated variants** — one-click "easier version" of a cloze (open gaps →
  dropdown, fewer gaps, glossary) for learners with support plans.
- **Student-authored quiz items** — students write items for peers, teacher
  approves into the bank; reuses peer-review/moderation infrastructure.

---

## 6. Decisions

1. **Speech recognition — transcript only where deterministic auto-grading is
   impossible.** Anything that can be scored without AI (dictation, minimal pairs,
   every closed type) is scored deterministically and never shows an ASR
   transcript. A transcript is shown only on manually graded spoken responses
   (`audio-response`, rubric-scored speaking tasks), as a teacher-side aid next to
   the recording. It never produces or suggests points. Browser ASR sends audio to
   a cloud service, so this needs a privacy-page update and should be a teacher
   opt-in.
2. **TTS is a per-student accommodation.** Read-aloud matters for dyslexic students,
   including in graded tests, so it is not tied to practice mode. It becomes a
   per-student setting in the student settings modal (Students page add/edit
   modal), next to the existing app-wide `dyslexiaFriendlyMode` preference. When on,
   that student gets read-aloud on passages, question prompts and options in every
   test mode (practice, assessment and placement). When off, read-aloud is hidden
   in graded tests. Teachers see which submissions used the accommodation on the
   results page. This is separate from TTS used as a _listening stimulus_ (A6),
   where teachers are still advised to upload a recorded clip for graded tests
   because voices differ per device.
3. **LanguageTool is being phased out** in favour of the in-house VocabKitchen-CLI
   tooling (vocabulary side already ported in Phase 42). No new test-builder feature
   may depend on LanguageTool. Grammar insights on open writing use the local
   `profileGrammar` (regex + compromise) until a VocabKitchen-based grammar profiler
   replaces it. VocabKitchen's grammar engine needs spaCy, so that swap needs its own
   design (server-side edge function vs. a browser port).
4. **Scoring architecture: one shared module.** Auto-scoring and cloze/hot-text
   parsing live only in `supabase/functions/_shared/testScoring.ts`, imported by the
   client and both scoring edge functions. Golden fixtures
   (`src/__tests__/testScoringFixtures.test.ts`) pin the scores, a guard test blocks
   re-introduced copies, and CI type-checks `_shared/` under Deno. New question types
   add their scorer there once. Placement routing, the staircase/Elo ladder and the
   seeded shuffle were moved into `_shared/` as well.

---

## 7. Suggested sequencing

| Phase | Contents                                                                                                              | Why this order                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1     | A1 cloze generators (incl. C-test), A3 passage level check, A4 deck → questions, per-student TTS accommodation (§6.2) | Pure authoring aids; no schema or scorer change. The accommodation is small and unblocks dyslexic students in graded tests now |
| 2     | Scoring parity test, A5 tolerant matching, A2 distractor suggestions                                                  | Makes scorer changes safe before new types                                                                                     |
| 3     | B1 matrix, B2 word-bank cloze                                                                                         | Largest authoring-time savings for Cambridge-style formats                                                                     |
| 4     | A6 listening controls, B3 dictation, B9 audio options, A7 speaking prep                                               | Listening/speaking block sharing TTS + media plumbing                                                                          |
| 5     | B4 error correction, B5 key word transformation, B6 word formation, B8 sentence builder                               | Exam-specific formats                                                                                                          |
| 6     | B7 rubric-scored tasks, teacher-side ASR transcript on manually graded speaking (§6.1), Tier C items                  | Cross-domain work; needs its own design pass                                                                                   |
