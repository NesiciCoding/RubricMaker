# Phase {N} — EFL test builder: scoring foundations, tolerant matching & distractors

Plan: `docs/TEST_BUILDER_EFL_EXPANSION_PLAN.md` (§1, §3 A2, A5, §6.4). Scoring already lives in one shared module, `supabase/functions/_shared/testScoring.ts`, used by the client and both edge functions (§6.4).

### Scoring fixtures (§6.4)

- [ ] Extend the golden fixtures in `src/__tests__/testScoringFixtures.test.ts` for every scoring change in this phase

### Tolerant answer matching (A5), opt-in per question

- [ ] Punctuation / curly-quote / whitespace normalisation
- [ ] Contraction equivalence (`don't` ≡ `do not`)
- [ ] British/American spelling equivalence (static list)
- [ ] "Minor spelling slips accepted" (Levenshtein ≤ 1, words ≥ 5 letters), off by default
- [ ] Implemented in `supabase/functions/_shared/testScoring.ts` and covered by the golden fixtures

### Distractor suggestions (A2): suggested, never auto-inserted

- [ ] Morphological forms via compromise (`go → went / gone / going`)
- [ ] Same level + same part of speech from the CEFR index
- [ ] Static EFL confusables list (`make/do`, `say/tell`, `since/for`, …)

### Constraints

- [ ] No LanguageTool dependency (being phased out, §6.3)
