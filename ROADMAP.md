# RubricMaker — Feature Roadmap

Tier 1 items have been implemented (commit `f601f6a`). This file tracks the remaining work.

---

## Tier 2 — Medium Impact, New Capabilities

### 5. Magister LMS — Feasibility Research
**Status:** Not started  
**Effort:** Very low (research spike, no code)

The school uses Magister (Dutch LMS). The current CSV import/export works well, but deeper integration may be possible.

**Investigate:**
- Whether Magister exposes a public API, SSO/OAuth, or structured data export beyond manual CSV
- Whether the Magister CSV roster format can be pre-mapped to the existing `CsvImportModal` column config (zero manual setup for teachers)
- Document findings as a short decision record so the question isn't re-litigated

**Deliverable:** A short findings document. If a structured integration path exists, promote to a proper feature item.

---

### 6. Document Analysis UI Polish
**Status:** Not started  
**Effort:** Low (infrastructure already exists)

`vocabularyAnalyser.ts`, `grammarChecker.ts`, `textExtraction.ts`, `DocumentAnalysisPanel` component, and all AppContext actions (`saveAnalysisResult`, `addVocabularyItem`, etc.) are implemented. The entry point from the grading workflow is missing.

**What to build:**
- Wire an "Analyse Document" button into `src/pages/GradeStudent.tsx` when an essay attachment is present on the scored submission
- Show `src/components/DocumentAnalysisPanel.tsx` inline: vocabulary matches highlighted, grammar errors flagged
- One-click insert of detected vocabulary items into the comment bank
- Persist results via the existing `saveAnalysisResult` AppContext action

**Files:** `src/pages/GradeStudent.tsx`, `src/components/DocumentAnalysisPanel.tsx`

---

### 7. Tablet / iPad Optimisation for Grading
**Status:** Not started  
**Effort:** Medium

The grading interface (`src/pages/GradeStudent.tsx`, 1,352 lines) is desktop-optimised. Teachers frequently grade on tablets in the classroom.

**What to build:**
- Increase tap target sizes for level selector buttons in GradeStudent
- Swipe-to-next-student gesture (touch event handler)
- Floating save button pinned above the keyboard on mobile
- Speaking session timer and pronunciation error buttons sized for thumb use
- Test at 768 px (iPad portrait) and 1024 px (iPad landscape) breakpoints

**Files:** `src/pages/GradeStudent.tsx`, `src/pages/SpeakingSession.tsx`, global CSS custom properties in `src/index.css`

---

### 8. Keyboard Shortcuts for Power Grading
**Status:** Not started  
**Effort:** Low

Teachers grading 30+ submissions in sequence want to stay on the keyboard.

**What to build:**
- Number keys `1`–`5` select the performance level for the focused criterion
- `Tab` / `Shift+Tab` moves focus between criteria
- `Ctrl+S` saves and advances to the next student
- `?` opens a keyboard shortcut cheat-sheet overlay
- Subtle shortcut hint shown on hover of level buttons

**Files:** `src/pages/GradeStudent.tsx`

---

## Tier 3 — Expansion & Polish

### 9. Additional Assessment Frameworks (Beyond CEFR)
**Status:** Not started  
**Effort:** Low (data files + picker update)

CEFR is dominant in European language education, but Math, Science, and PE teachers also use this app. Adding IB Learner Profile or Bloom's Taxonomy descriptors would let non-language teachers use the same criterion-linking workflow.

**What to build:**
- `src/data/ibLearnerProfile.ts` — 10 IB attributes with descriptors
- `src/data/bloomsTaxonomy.ts` — 6 cognitive levels with sample descriptors
- Framework selector in RubricBuilder when linking descriptors to criteria (currently assumes CEFR)
- Update `src/components/CEFR/CefrPickerModal.tsx` to handle multiple frameworks

---

### 10. Additional Language Support (French, German)
**Status:** Not started  
**Effort:** Low (locale files only)

CEFR is pan-European; the app ships EN + NL. Adding FR and DE would make it viable for French/Belgian and German-speaking schools without any code changes — only `src/locales/` additions.

**What to build:**
- `src/locales/fr.json` — full translation of all keys in `en.json`
- `src/locales/de.json` — full translation of all keys in `en.json`
- Add `language_fr` / `language_de` options to the Settings language selector
- Verify CEFR descriptor coverage in those languages

---

### 11. Print-Optimised CSS (In-Browser Printing)
**Status:** Not started  
**Effort:** Very low

Many teachers print rubrics directly from the browser. The current layout includes sidebar, topbar, and action buttons on the printed page. A `@media print` stylesheet would eliminate the need to export PDF just to print.

**What to build:**
- `@media print` rules hiding sidebar, topbar, and action/edit buttons in RubricBuilder and GradeStudent
- Page-break rules between criteria sections
- Force portrait/landscape based on the rubric's `format.orientation` setting
- A "Print Rubric" button that triggers `window.print()` directly

**Files:** `src/index.css` (global print rules), `src/pages/RubricBuilder.tsx`

---

### 12. In-App Notification / Reminder System
**Status:** Not started  
**Effort:** Low

The Dashboard already tracks feedback age (days since last grading per student). Teachers lose track of classes they haven't graded recently.

**What to build:**
- Notification bell icon in `src/components/Layout/Topbar.tsx` with a badge count of overdue items
- Opt-in browser `Notification` API permission request
- Configurable reminder threshold in Settings (default: 7 days since last grading)
- Re-use the at-risk detection logic already in `src/pages/Dashboard.tsx`

**Files:** `src/components/Layout/Topbar.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/Dashboard.tsx`

---

## Completed

| # | Feature | Commit |
|---|---------|--------|
| 1 | Rubric & class sharing (Supabase) | f601f6a |
| 2 | Student progress portal | f601f6a |
| 3 | Period / report card generation | f601f6a |
| 4 | Auto-snapshot on rubric save | f601f6a |
