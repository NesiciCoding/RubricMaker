# Vocabulary word-list data & provenance

`src/data/cefrLevels.ts` (CEFR level per word) and `src/data/academicWordLists.ts`
(AWL + NAWL) are **generated**, not hand-maintained. They are produced by
`scripts/build-cefr-index.mjs` from the [VocabKitchen-CLI](https://github.com/NesiciCoding/vocabkitchen-CLI)
word-list artifacts, which are themselves built from documented open sources.

They replaced the previous hand-maintained `src/data/cefrjVocabulary.ts`
(~8.6k words) and `src/data/openCefrVocabulary.ts` (~3.7k words, approximate
frequency-derived bands). The new CEFR index covers **64,166 words** and is
validated against a curated dictionary.

## Regenerating

```bash
node scripts/build-cefr-index.mjs /path/to/vocabkitchen-cli
# or: VOCABKITCHEN_DIR=/path/to/vocabkitchen-cli node scripts/build-cefr-index.mjs
```

Then run `npm run format` on the two generated files and record the VocabKitchen
source commit SHA below.

- **VocabKitchen source commit:** `<record the commit SHA the lists were built from>`
- **Generated:** `src/data/cefrLevels.ts`, `src/data/academicWordLists.ts`

## Sources & licences

Matching-relevant detail: the lists are pre-expanded to inflected surface forms,
so the profiler does exact, case-insensitive **surface-form** matching (no
lemmatization). "Off-list" words are those outside the CEFR index — typically
proper nouns, abbreviations, typos, or foreign words.

- **CEFR (A1–C2)** — the [Words-CEFR-Dataset](https://github.com/Maximax67/Words-CEFR-Dataset),
  **MIT-licensed**, derived from the CEFR-J dataset and Google Books N-Gram
  frequency data.
- **CEFR gap-fill (A1–C2)** — the [OLP-EN-CEFRJ](https://github.com/openlanguageprofiles/olp-en-cefrj)
  profiles (CEFR-J A1–B2 + Octanove C1/C2). The CEFR-J resources are
  © Tono Laboratory, Tokyo University of Foreign Studies, available for research
  and commercial use **at no cost, provided the source is cited**:
  _Tono, Y. (ed.) The CEFR-J Vocabulary Profile. Tono Laboratory, Tokyo
  University of Foreign Studies. <https://www.cefr-j.org/>_ (the attribution is
  also shown in-app in the document-analysis panel).
- **AWL** — Coxhead's Academic Word List (Coxhead, A. 2000, _A New Academic Word
  List_, TESOL Quarterly 34(2): 213–238): 570 word families, all member forms.
  Published for research/education use by Victoria University of Wellington.
- **NAWL** — the New Academic Word List (Browne, C., Culligan, B. & Phillips, J.),
  Creative Commons Attribution.

See VocabKitchen-CLI's own `WORDLISTS.md` for the fullest source, version, and
licence detail.
