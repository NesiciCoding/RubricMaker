# Phase {N} — EFL test builder: scoring foundations, tolerant matching & distractors

Plan: `docs/TEST_BUILDER_EFL_EXPANSION_PLAN.md` (§1, §3 A2, A5, §6.4). Makes scorer changes safe before any new question type lands.

### Scoring parity (§1, §6.4)

- [ ] Parity test running `src/utils/testCalc.ts`, `supabase/functions/submit-test` and `supabase/functions/next-placement-question` scorers over one shared fixture set
- [ ] Decide: keep hand-mirrored scorers + parity test, or move to one shared module imported by client and Deno

### Tolerant answer matching (A5), opt-in per question

- [ ] Punctuation / curly-quote / whitespace normalisation
- [ ] Contraction equivalence (`don't` ≡ `do not`)
- [ ] British/American spelling equivalence (static list)
- [ ] "Minor spelling slips accepted" (Levenshtein ≤ 1, words ≥ 5 letters), off by default
- [ ] Mirrored in both edge functions and covered by the parity test

### Distractor suggestions (A2): suggested, never auto-inserted

- [ ] Morphological forms via compromise (`go → went / gone / going`)
- [ ] Same level + same part of speech from the CEFR index
- [ ] Static EFL confusables list (`make/do`, `say/tell`, `since/for`, …)

### Constraints

- [ ] No LanguageTool dependency (being phased out, §6.3)
