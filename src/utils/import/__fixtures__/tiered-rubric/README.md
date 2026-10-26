# Tiered rubric import fixtures

A real Dutch jaar-1 English assignment sheet ("Grote opdracht P1: MY ID card"): 4 criteria × 3 tiers
(Mavo / Havo / VWO) × 3 bands (IO / B / E), 95 checkbox statements and 3 "Verplichte eisen".

| File                                 | What it is                                                                                                                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grote-opdracht-y1-p1.original.docx` | The teacher's sheet as received. Header, column labels and criterion names are floating text boxes (each duplicated by `mc:AlternateContent`), band markers are separate table rows, two criteria share one table, statements use legacy `FORMCHECKBOX` fields. |
| `grote-opdracht-y1-p1.original.pdf`  | Word's PDF export of the same sheet. Its text layer has broken Calibri ligatures (`bevatten` → `beva.en`, `Heeft` → `HeeD`, `altijd` → `alOjd`).                                                                                                                |
| `grote-opdracht-y1-p1.json`          | Canonical content, extracted from the original DOCX with whitespace normalised and the text otherwise verbatim. Source of truth for the redesigned files and the expected result of an import.                                                                  |
| `grote-opdracht-y1-p1.docx`          | Redesign: same content and look, clean structure. One table per criterion, a repeating header row, the criterion name in the first column (vertically merged), shaded band-marker rows, `w14:checkbox` content controls.                                        |
| `grote-opdracht-y1-p1.pdf`           | Redesign rendered by Chromium in Carlito with ligatures off, so the text layer extracts cleanly. Checkboxes are drawn, not text.                                                                                                                                |

Regenerate the redesigned files after editing the JSON:

```bash
npm run fixtures:tiered            # set PW_CHROMIUM_PATH if Playwright's bundled browser is missing
```

`src/utils/import/tieredFixtures.test.ts` checks that all five files agree.
