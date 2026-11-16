# Test creator redesign — implementation plan

Follow-up to [#1210](https://github.com/NesiciCoding/RubricMaker/pull/1210). The design itself lives in
[`docs/mockups/test-creator.html`](mockups/test-creator.html): a three-zone shell (outline rail, focus
pane, preview inspector), one editor on screen at a time, and a progressive-disclosure ladder so new
capabilities cost nothing in the basic view.

**Nothing is removed.** Every field, action and check in today's builder keeps a home; the redesign only
changes how much of it is on screen at once. The mockup's coverage map (50 rows) is the checklist.

The work is stacked on the open PR so the question-type picker comes from #1210 rather than being
reimplemented: branch `freebuff/cbbb7516b2882bb814fba414`, merge commit `36b3bb43` (PR head
`c63425cc`), typecheck and the picker suites green.

## Phase 1 — type-first creation (done)

Adding a question now starts with its type, using the #1210 picker unchanged.

- `src/pages/TestBuilderPage.tsx`: **+ Add question** (toolbar, empty state, uncategorised pool, per-section
  button) opens `QuestionTypePicker`; confirming creates the question in the section the button belongs to.
- `src/utils/questionTypeDefaults.ts` (new): one source for the starter shape of every type — options,
  matching pairs, order items, categories + items, matrix columns + rows, hot-text passage, recording cap.
  `QuestionEditor` imports the same factories it used to define locally, and `MatrixEditor` re-exports the
  matrix pair so existing imports keep working.
- `src/utils/testQuestionClone.ts`: `newQuestion(sectionId?, type = 'multiple-choice')` — unchanged for the
  Question Bank's section editor and any caller that doesn't pass a type.
- `src/components/Tests/QuestionTypePicker.tsx`: `selected` is now optional, so the grid shows no
  "Current" badge when the type being chosen belongs to a question that doesn't exist yet.
- Tests: `questionTypeDefaults.test.ts`, plus the builder suites pick a type after clicking add and one new
  case asserts a matching question opens with the matching editor and saves as `type: 'matching'`.
  `e2e/pages/TestBuilderPage.ts#addQuestion(type?)` clicks the card, so all e2e specs keep working.
- Docs: the picker paragraph in the in-app docs (5 locales) and the README row now say adding a question
  opens the picker.

Not in this slice: the builder layout is still the current one. The picker is wired into the _flow_ the
redesign wants; the shell that shows it in context comes next.

## Phase 2 — shell (done)

The builder is a three-zone grid on wide screens: outline rail, the editor column, and the A4 preview
inspector when it is open.

- `src/components/Tests/TestOutlineRail.tsx` (new) — read-only navigation: the whole structure at a
  glance, grouped by section (uncategorised first, matching display order), numbered exactly as the cards
  are, with each question's points and a warning icon when the checks are blocking on it. Clicking a row
  calls the builder's existing `jumpToQuestion`, which expands the card and scrolls it into view. An
  untitled question shows its type name, never a blank row.
- `src/pages/TestBuilderPage.tsx` — renders the rail and builds the grid `[240px, 1fr]` plus a 400px
  inspector when the A4 preview is open; the rail only appears at ≥1400px, where the editor still has
  room next to the app nav (528px at 1520px with all three zones open).
- No state moved: `TestBuilderPage` still owns `questions`, `sections`, saving and assignment.

Done when: the builder suites, the a11y suite and the locale gates pass, and a real 1520px window shows
rail + editor + inspector without squeezing the editor. All true — see [`test-creator-inspector-paper.png`](mockups/screenshots/test-creator-inspector-paper.png).

Still to come in this area (Phase 3): the rail selecting a single question instead of scrolling a stack,
search in the rail, and add actions moved into it.

## Phase 3 — One editor at a time (done)

At rail widths the outline is the only question list and the pane shows exactly one editor.

- `selectedQuestionId` in `TestBuilderPage` drives the pane; the rail marks it with `aria-current` and
  selecting a row swaps the editor. Below 1400px the switcher from Phase 8 takes the rail's place, and
  the pane is the same one.
- Selection follows the work: a new question (from the rail, the toolbar or the empty state) opens
  immediately, duplicating opens the copy, and deleting opens the next question (or the previous one at
  the end of the list).
- The rail gained search (filters rows by prompt, type or part, keeping the full numbering), an
  add-question button, and the warning icon for questions the checks block on.
- **Section workspace:** a section's heading in the rail is a button, so <kbd>Tab</kbd> reaches it and
  <kbd>Enter</kbd>/<kbd>Space</kbd> opens it. Opening one puts that section's workspace in the pane — its
  editable title, passage with its CEFR verdict and deck seeding, section audio and listening controls,
  save-to-question-bank and add-question — so nothing the stacked section card offers is lost at rail
  widths. A section with no questions yet keeps its heading, since the workspace is where its first
  question is added. Both layouts render the same `TestSectionWorkspace` component; choosing a question —
  or adding one — returns the pane to that question.
- Drag reordering moved to explicit up/down buttons in the pane header, scoped to the question's own
  part; the drag grip is hidden where dragging is impossible (`QuestionEditor.showGrip`), so no affordance
  promises something the pane can't do.
- The blocking-issues list and the focus pane are ordered above the test-wide setup cards, so the open
  question is the first thing on the page; issue links select the question instead of scrolling.

Done when the builder, rail, editor, a11y and locale suites pass and a 1520px window puts the rail,
open editor and inspector on one screen. Both true.

Known gaps for later phases: reordering across parts, the settings card still inline (Phase 5), and the
section passage editor still lives in its own card above the questions.

## Phase 4 — More options disclosure (done)

`QuestionEditor` now ends in one **More options** chip row instead of three always-visible blocks.

| Chip                   | Holds                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Media                  | question image URL + preview, audio URL + status + player, listening controls (play limit, spoken text) |
| Hint & explanation     | student hint, practice explanation                                                                      |
| Tagging & standards    | linked standards, CEFR descriptors, framework/grammar descriptors, the two link pickers                 |
| Scoring                | the staircase Elo rating (with its no-level hint)                                                       |
| Language & fine-tuning | the question's own content language                                                                     |

- Every panel starts closed, one chip open at a time, `aria-expanded` plus `aria-controls` pointing at the
  open panel; a dot marks a chip that already holds a value, so nothing is silently hidden.
- Attached media still shows as removable badges above the chips, and type-specific scoring (partial credit,
  numeric tolerance, accepted-answer tolerance) stays in the answer module where it changes the answer,
  not behind a chip.
- Nothing was dropped: each field's id and label is unchanged, only its container, which is why the test
  changes are calls to open the right chip rather than rewritten assertions.

## Phase 5 — Settings drawer with tabs (done)

The settings card is gone; `TestSettingsDrawer` holds the same fields in five tabs.

- **Entry points:** four setup tiles on the page (Mode, Delivery, Scoring, Paper) each show the current
  value and open the drawer on that tab, plus a Placement tile and a Settings button in the rail footer.
- **Tabs:** Basics (mode, content area, content language, CEFR target + skill), Delivery (time limit, due
  date, shuffling, Safe Exam Browser, retakes), Scoring (grade scale + norm), Placement (engine, plus a
  one-click switch when the test is not in placement mode) and Print (header, intro, footer).
- **Same fields, same ids:** every control keeps its `#test-*` id and label, so e2e and the a11y gate only
  had to learn how to open the drawer. Inactive tab panels stay in the DOM but `hidden`, the standard
  ARIA tabs pattern.
- **Read-only for shared tests:** a shared test opens the drawer with the controls disabled and a note
  saying only the owner can change settings, while all tabs stay readable.
- The drawer is a right-side panel with a scrim, `aria-modal`, Escape to close, and a Done button; changes
  apply on Save like every other builder field.

## Phase 6 — Checks as a screen (done)

`TestChecksPanel` is a real screen instead of a bullet list in a banner.

- **Two entry points:** a Checks button next to Insert from bank (carrying the number of blocking
  questions, `aria-pressed` while open) and the short review strip that replaced the old banner. Below
  1400px the screen renders above the questions; at rail widths it replaces the question pane. The strip
  hides while the screen is open — it repeats the screen's heading — and returns when it closes.
- **Blocking list:** one row per question — its number and a jump link straight into the question, the
  prompt (or its type when the prompt is empty), and each issue as its own sentence. Empty-test blocking
  is its own row. All of it comes from `testAssignBlockers`/`testQuestionIssues`; no rule was added.
- **Verified list:** what already holds — every question has enough content to be scored, the points
  total, and (for placement engines) that the routing has no loops.
- **Footer:** Save draft and Save and assign, with a note that class assignment itself happens on the
  Tests list. A read-only shared test keeps the list readable and drops both actions.
- Jumping into a question closes the screen, so the teacher lands in the editor with the question open.

## Phase 7 — Inspector parity (done)

The right column is now the inspector, always present at rail widths, with two tabs.

- **Paper:** the existing `TestA4Preview` unchanged — zoom, answer key, points and print — inside the
  inspector's `a4-pane` container, so the print-text editors still save through the same `printText` state.
- **Student view:** the open question rendered as a student receives it — prompt, image, audio stimulus
  (or the dictation recording) with its play limit, the hint behind the same toggle students get, and the
  answer surface. Both the media and the answer surface are the runner's own components, extracted so
  there is one per-type answer switch and one stimulus renderer in the app, not two. Answers typed here
  are local to the inspector and never written back to the test.
- **Responsive:** above 1400px the inspector is part of the three-zone grid and the topbar A4 toggle
  disappears, because there is nothing to open; below that the same inspector slides in from the A4 button
  as before, so narrow screens lose nothing.
- The inspector follows the focus pane: selecting another question in the rail re-renders the student view.

## Phase 8 — Narrow layout, i18n and docs pass (done)

Below 1400px the builder is the redesigned layout, not the old stacked column: 1280–1366 laptops, which is
most of them, get the same pane as a 27" monitor.

- `src/components/Tests/QuestionSwitcher.tsx` stands in for the rail: previous/next buttons, a select of
  every question grouped by section (numbered as the cards are, showing the prompt or the type name when
  there is no prompt), the section names as chips that open a section workspace, and add — one wrapping row
  whose labels truncate inside their controls (`title` keeps the full text) instead of widening the page.
  The switcher is only there when there is something to switch to.
- Both widths render the same checks / section workspace / question pane. The stacked drag-and-drop list,
  its droppables and `onDragEnd` are gone; reordering is the pane header's up/down buttons (inside the
  question's own part) and moving a question between parts is the editor's section field.
- The inspector becomes a bottom sheet from the A4 preview button: the same Paper and Student view tabs, a
  close button and <kbd>Escape</kbd>, at most 85vh tall with its own scroll.
- Every new string is in all five locales, read against the long German and French labels.
- The docs tab (`rb_tests_outline`, `rb_tests_inspector`) and the README describe the narrow layout, and the
  [screenshot](#screenshots) below is a capture of the shipped 1280px UI.

## Phase 9 — Resizable columns and one-pane focus (done)

Every column used to be a fixed width: 240px of outline, a flexible editor and a 400px inspector, with no way
to give the printed paper more room or to work on one pane alone.

- `src/components/Tests/ColumnResizer.tsx` draws the seam between the rail and the editor and between the
  editor and the inspector. It is a `role="separator"` with the pane width as its value, so it drags with the
  pointer, moves 16px per arrow key (48px with Shift), jumps to the limits with Home/End, resets to the
  layout's own width on double-click, and shows the current width to a screen reader. The seam sticks with
  the columns it separates, so the handle is reachable at any scroll position.
- The rail stays between 180 and 360px and the inspector between 320 and 760px; the editor keeps the rest
  and the A4 preview's fit scale grows with the inspector, so a wider inspector shows a larger page.
- Each side pane has an expand button: it hides the other two columns and gives that pane the whole page,
  and restore brings the layout back. The maximised outline stops at a readable 760px instead of stretching
  a prompt and its points to opposite edges.
- The test settings drawer widened from 420px to 560px, because its five tabs were the most cramped surface
  in the builder.
- Widths and the focus state are session-only: they are not a stored setting, and the project keeps UI
  preferences in settings rather than writing them to storage from a component.

Done when: the seams drag, resize from the keyboard, reset on double-click, and both panes can take the page
without losing the layout — covered by `ColumnResizer.test.tsx`, a builder suite case and the wide spec.
See [`test-creator-columns.png`](mockups/screenshots/test-creator-columns.png) and
[`test-creator-columns-expanded.png`](mockups/screenshots/test-creator-columns-expanded.png).

## Screenshots

Only captures of the shipped UI are committed. The exploratory screenshots taken while building the phases
went stale within hours (two of them show the checks screen before it was reworded), so they are gone.
`docs/mockups/` is gitignored apart from the spec and the five captures below, so a new mockup or a
throwaway capture now stays on the machine that made it — the allowlist lives in `.gitignore`. Re-capture
in place rather than adding another file, and keep the table in step.

| File                                                                                                     | Shows                                                                                   |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`mockups/test-creator.html`](mockups/test-creator.html)                                                 | the design itself — the spec every phase is measured against                            |
| [`test-creator-inspector-paper.png`](mockups/screenshots/test-creator-inspector-paper.png)               | the full shell at 1520px: outline rail, one editor, the inspector's Paper tab           |
| [`test-creator-inspector-student-view.png`](mockups/screenshots/test-creator-inspector-student-view.png) | the Student view tab: image and audio stimulus, play limit, hint toggle, answer surface |
| [`test-creator-settings-drawer.png`](mockups/screenshots/test-creator-settings-drawer.png)               | the settings drawer (Phase 5) and its five tabs                                         |
| [`test-creator-more-options-open.png`](mockups/screenshots/test-creator-more-options-open.png)           | one chip open at a time (Phase 4), with every field still there                         |
| [`test-creator-checks-screen.png`](mockups/screenshots/test-creator-checks-screen.png)                   | the checks screen (Phase 6): blockers first, "What already passes" below                |
| [`test-creator-narrow-switcher.png`](mockups/screenshots/test-creator-narrow-switcher.png)               | 1280px (Phase 8): the question switcher over one editor, with section chips             |
| [`test-creator-narrow-sheet.png`](mockups/screenshots/test-creator-narrow-sheet.png)                     | 1280px (Phase 8): the inspector as a bottom sheet, Paper tab and close button           |
| [`test-creator-columns.png`](mockups/screenshots/test-creator-columns.png)                               | 1500px (Phase 9): the two resize seams between rail, editor and inspector               |
| [`test-creator-columns-expanded.png`](mockups/screenshots/test-creator-columns-expanded.png)             | 1500px (Phase 9): the inspector expanded to the whole page, at the paper's own size     |

## Conventions for every phase

- `npm run typecheck` and the touched suites before each hand-off; e2e page objects updated in the same
  change as the selector they address.
- No data-model changes: `Test`, `TestQuestion` and `TestSection` keep their shapes, so saved tests,
  share links, the student runner and the aggregator are untouched.
- The mockup is the spec until a phase lands; after that, the app is.
