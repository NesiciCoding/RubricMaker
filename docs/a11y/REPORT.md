# RubricMaker accessibility audit — WCAG 2.1 / 2.2 AA

**Date:** 18 October 2026
**Build audited:** `bac28af9` — tip of `fix/skeleton-grading-mobile-grid`, the merge stack that contains `feat/skeleton-741…751` and everything on `origin/main` (739 commits ahead of `origin/main`; `origin/main` is an ancestor).
**Verdict:** **Not WCAG 2.1 AA conformant.** Several **Level A** failures exist (bypass blocks, character-key shortcuts, language of page, form names, chart alternatives). The README’s “WCAG 2.1 AA” badge is not currently accurate.

> The only commits in the repository not contained in `bac28af9` are ops/backup scripts and the coverage badge (`origin/claude/intelligent-curie-wxzkuv`, `origin/coverage-badge`); they contain no `src/`, `index.html` or dependency changes, so this is the latest UI state.

---

## 1. Scope and method

| Item | Value |
|---|---|
| App | RubricMaker (React 19 + Vite 8, HashRouter, local mode seeded via `localStorage`) |
| Server | `npm run dev` in an isolated worktree at `bac28af9`, `http://localhost:5199` |
| Automation | Playwright 1.63, Chromium 1243, axe-core 4.12.1 |
| axe rules | `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22a`, `wcag22aa`, `best-practice` |
| Routes | 41 (all teacher routes, student portal, landing, 404) |
| Scans | 82 desktop (41 routes × light/dark, 1280×900) + 82 mobile (41 × light/dark, 390×844) |
| Extra checks | keyboard walk, skip link, native/Radix dialogs, mobile drawer, tabs, language switch, route change, reduced motion, 320 px reflow, 200 % text, 1.4.12 text spacing |
| Data | Deterministic seed: 2 classes, 4 students, 2 rubrics with levels, 1 grade, 1 test, 1 deck, question bank, comment bank, message, news flash |

**Not covered:** screen-reader output on NVDA/JAWS/VoiceOver; Supabase-connected and multi-user states; student test/essay-taking flows (public routes need submission links); exported PDF/DOCX; email templates; browser zoom UI at 400 % (320 px reflow was used); Safari/Firefox. The seeded states rendered no `<img>` or `<iframe>` elements, so alt text and frame titles were not exercised.

Method notes: every route was loaded in a fresh page so an error boundary on one route could not poison the next. Theme is applied through `rm_settings.theme` before mount. Two accent configurations were tested: the theme default (no `accentColor`, `accent none`) and a custom accent `#3b82f6`.

### Reproduce

```bash
node docs/a11y/audit.mjs --base http://localhost:5199 --accent none          # desktop, both themes
node docs/a11y/audit.mjs --base http://localhost:5199 --accent none --mobile # mobile, both themes
node docs/a11y/audit.mjs --base http://localhost:5199                        # custom accent #3b82f6
node docs/a11y/interactions.mjs --base http://localhost:5199
node docs/a11y/responsive.mjs --base http://localhost:5199
```

`axe-core` is resolved from `node_modules` (transitive via `jest-axe`); add it as an explicit devDependency before wiring this into CI.

---

## 2. Scorecard

### 2.1 Automated results (theme default)

| Rule | Impact | Nodes (desktop) | Nodes (mobile) | Routes affected |
|---|---|---|---|---|
| `color-contrast` (1.4.3) | serious | **228** | **55** | 40 / 41 in light, 40 / 41 in dark |
| `page-has-heading-one` (best practice) | moderate | 76 (38 routes × 2) | 76 | 38 / 41 |
| `label` — form control has no name (4.1.2 / 3.3.2) | critical | 29 | 32 | 2 desktop / 3 mobile |
| `select-name` (4.1.2) | critical | 12 | 12 | 1 |
| `label-title-only` (3.3.2) | serious | 32 | 32 | 3 |
| `aria-prohibited-attr` (4.1.2) | serious | 10 | 10 | 2 |
| `nested-interactive` (4.1.2) | serious | 6 | 6 | 1 |
| `target-size` (2.5.8, 2.2 AA) | serious | 6 | 4 | 2 |
| `heading-order` (1.3.1) | moderate | 2 | 2 | 1 |
| `landmark-unique` (1.3.1) | moderate | 2 | 2 | 1 (docs) |

With custom accent `#3b82f6`, `color-contrast` rises to **376** desktop nodes — the accent system is not contrast-safe (see F3).

Every one of the 41 routes fails at least one of these checks. The two student-portal routes and the 404 route are the only ones with an `<h1>`.

### 2.2 Manual checks

| Check | Result |
|---|---|
| Keyboard reachability of visible controls | Mostly pass; every non-body keyboard stop sampled (22) showed a visible focus ring |
| Skip link | **Fails** — activating it navigates to the 404 route (F1) |
| Modal focus trap / Escape / focus restore | **Fails** on hand-rolled dialogs (F5); Radix dialogs trap and close but lose focus on close (F5.3) |
| Mobile navigation drawer | **Fails** — no focus move, no Escape close, no dialog semantics (F6) |
| ARIA tab pattern | **Fails** — no tabpanel/`aria-controls`, no arrow keys (F11) |
| Page `<title>` per route | **Fails** — every route is “Rubric Maker” (F2) |
| `html lang` after language switch | **Fails** — stays `en` for nl/fr UI (F9) |
| 320 px reflow (1.4.10) | **Passes** — no page-level horizontal overflow on any route |
| 200 % text (1.4.4) | **Fails on test builder** — 4 fixed-height toolbar selects clip their text (F14); other sampled routes pass |
| Text spacing (1.4.12) | **Passes** — no clipped content outside `.sr-only` |
| Image `alt` / iframe `title` | **Not exercised** — the seeded states rendered none; source has 8 `<img>` call sites (all set `alt`) |
| Positive `tabindex` | **Passes** — none |
| Toast announcements | **Passes** — `role="alert"` (F16 is about the auto-dismiss timing) |
| Landing page | **Passes** axe; has an `<h1>`; keyboard reachable |

---

## 3. Findings

### F1 — Critical — “Skip to main content” navigates to the 404 page
**WCAG:** 2.4.1 Bypass Blocks (A)

The skip link is `href="#main-content"` inside a **HashRouter** app, so clicking it changes the route to `/main-content`. The keyboard user lands on the 404 page instead of the main region, and focus stays on `<body>` (`<main>` has no `tabindex="-1"`).

Evidence (`results/interactions.json`, `skip-link-and-tab-walk`):
```
hash: "#main-content"
mainText: "Page not found 1404 — Page not found…"
mainH1: ["404 — Page not found"]
active: BODY, mainTabIndex: null
```
Source: [App.tsx:216](../../src/App.tsx#L216) and `main` at [App.tsx:222](../../src/App.tsx#L222).

**Fix:** make it a button/handler that calls `document.getElementById('main-content')?.focus()` after adding `tabIndex={-1}` to `<main>`, and `preventDefault()` so the hash route is untouched. (Or use `href="#/"` plus a click handler; never a bare fragment in HashRouter.)

---

### F2 — High — No page heading, no route-specific title, misleading route announcement
**WCAG:** 1.3.1 (A), 2.4.2 (A), 2.4.6 (AA), 4.1.3 (AA)

* **38 of 41 routes have no `<h1>`.** Page titles are rendered by `Topbar` as a `<span class="topbar-title">`; the first heading is usually an `h2`/`h3`, and six routes (`/cefr-overview`, `/notifications`, `/comments`, `/question-bank`, `/marketplace`, `/admin`) have **no headings at all**.
* `document.title` is `"Rubric Maker"` on every route (only student essay/feedback/preview pages set it temporarily).
* `RouteAnnouncer` announces `document.title` after navigation, so screen readers hear “Rubric Maker” for every page.

Evidence: `results/axe-desktop-default.json` (`page-has-heading-one`, all `pageTitle` values); `results/interactions.json`, `route-change`:
```
title: "Rubric Maker", statusAnnouncement: "Rubric Maker", h1: 0,
headings: ["H3: Class 4A — 4 students"]
```
Source: [Topbar.tsx:62](../../src/components/Layout/Topbar.tsx#L62), [App.tsx:73-84](../../src/App.tsx#L73-L84).

**Fix:** render the Topbar title as the route’s `<h1>` (visually unchanged), add one `<h1>` to the six heading-less pages (their empty-state `<h3>` should be promoted), set `document.title = "<page> · Rubric Maker"` in the route effect/announcer, and announce that same string in the live region. Document the route→title map next to the route table.

---

### F3 — High — Secondary text, active navigation and badges fail contrast; custom accents are unmanaged
**WCAG:** 1.4.3 Contrast (Minimum) (AA)

228 desktop nodes (80 of 82 theme-route scans) and 55 mobile nodes (25 of 82) fail with the default theme.

| Foreground / background | Ratio | Where |
|---|---|---|
| `#0e7c6b` on `#e2f0ed` @ 9.3–13.2 px | **4.35** | Active rail/sub-nav text (light) |
| `#0e7c6b` on `#e2ecfe` @ 11.25 px | 4.29 | Active/selected accent text |
| `#9c9081` on `#ffffff` @ 10.2–10.8 px | **3.12** | Sidebar section header, captions, `--text-dim` |
| `#9c9081` on `#f6f1e8` @ 10.5 px | **2.77** | Card captions (`Class 4A` etc.) |
| `#867c6e` on `#201d17` @ 10.2 px (dark) | **4.09** | Same `--text-dim` in dark mode |
| `#867c6e` on `#2a261f` @ 10.5 px (dark) | 3.67 | Captions on elevated cards |
| `#2e9e6b` on `#def6e7` @ 11.25 px | 2.96 | Green badge |
| `#8b5cf6` on `#eee7fe` @ 11.25 px | 3.52 | Purple badge |
| `#22c55e` on `#ffffff` @ 13.1 px | **2.27** | Hard-coded “up-to-date” green text |
| `#ffffff` on `#3b82f6` @ 12 px (custom accent) | 3.67 | Primary buttons |

The **custom accent path is the bigger risk:** the eight `ACCENT_PRESETS` are validated only for white text on the swatch (≥4.5) and for a *shaded* 700 step on a white background in tests. At runtime `AppContext` sets `--accent` to the raw preset and never updates `--accent-fg`; on the dark surface every preset’s raw colour scores **3.5–3.7:1** as text, and `--accent-fg` (`#0e1512`) on those buttons scores only **3.9–4.1:1**. The Settings accent field validates hex syntax only (`/^#[0-9A-Fa-f]{6}$/`), so any colour can be applied.

Source: [index.css:21,67](../../src/index.css#L21), [index.css:283-286,360-363](../../src/index.css#L283-L286), [index.css:516-519](../../src/index.css#L516-L519), [index.css:717-738](../../src/index.css#L717-L738), [AppContext.tsx:183-203](../../src/context/AppContext.tsx#L183-L203), [themes.ts](../../src/data/themes.ts), [SettingsPage.tsx:413-418](../../src/pages/SettingsPage.tsx#L413-L418).

**Fix:**
* Darken `--text-dim` in light mode to at least `#6e655a` (5.72 on white, 5.08 on `#f6f1e8`) and lighten it in dark mode to at least `#a89c8c` (6.24 on `#201d17`, 5.59 on `#2a261f`). Darken the badge text equivalents (`#1f7a4d`, `#5b21b6`, `#1d4ed8`, `#b43a25`, `#8a5a00` all clear 4.5 on their tints).
* Use `--accent-700` for accent **text** in light mode and `--accent-300` in dark mode (the scale already exists in `utils/accentScale.ts`), keep raw `--accent` for fills, and compute `--accent-fg` from the fill’s luminance rather than hard-coding white/near-black.
* Make the accent picker reject (or auto-correct) colours whose text/fill variants fail, and add contrast assertions for **both themes** and **all presets**, mirroring the real runtime tokens instead of `DARK_BG`/`LIGHT_BG` test constants that no longer match `index.css` (see §5).

---

### F4 — High — Single-key shortcuts are globally active in grading
**WCAG:** 2.1.4 Character Key Shortcuts (A)

On `/rubrics/:id/grade/:studentId`, a window-level handler listens for `a–z` (jump to criterion), `1–5` (set level), and `?` (help). There is no setting to turn them off or remap them, and they are active whenever focus is not in an input. A screen-reader or speech-input user who types a letter can silently change a grade.

Evidence: [GradeStudent.tsx:610-650](../../src/pages/GradeStudent.tsx#L610-L650); manual test: pressing `?` opened the shortcuts dialog.

**Fix:** add a “Keyboard shortcuts” setting (off/on, or require a modifier such as `Alt`), scope the handler to the grading region, and expose the setting in the shortcuts dialog. Add `aria-keyshortcuts` where appropriate.

---

### F5 — High — Modal focus management is inconsistent; hand-rolled dialogs are not modal
**WCAG:** 2.4.3 Focus Order (A), 4.1.2 Name/Role/Value (A)

1. **Add Student** (`StudentsPage`): `role="dialog"` + `aria-modal="true"`, autofocus on the name field, but **no focus trap** — within four Tabs focus leaves the dialog and walks the sidebar (9 of 12 sampled stops were outside); **Escape does not close it**; background is not `inert`; focus ends on `<body>` after closing, not the trigger.
2. **Rename class / delete class** modals in the same file have **no `role="dialog"`, no `aria-modal`, no labelled title**, and the close button has no accessible name (just `✕`).
3. **Radix `ConfirmDialog`** (delete rubric) closes on Escape and is labelled/described, but `aria-modal` is absent and **focus is restored to `<body>`**, not the Delete button. `Modal.tsx` has custom restore logic; `ConfirmDialog` does not.

Evidence: `results/interactions.json` (`add-student-dialog`, `confirm-dialog`); axe on the dialog still finds 11 contrast nodes and 2 target-size nodes.
Source: [StudentsPage.tsx:1394-1420](../../src/pages/StudentsPage.tsx#L1394-L1420), [StudentsPage.tsx:1574-1590](../../src/pages/StudentsPage.tsx#L1574-L1590), [StudentsPage.tsx:1809-1815](../../src/pages/StudentsPage.tsx#L1809-L1815), [ConfirmDialog.tsx](../../src/components/ui/ConfirmDialog.tsx).

**Fix:** replace every hand-rolled `modal-overlay`/`modal` pair with the existing `Modal` wrapper (Radix) or `ConfirmDialog`; ensure Escape/overlay close, initial focus, trap, `aria-modal`, `aria-labelledby`, and restore-to-trigger (add the same `returnFocusTo` logic to `ConfirmDialog`). Audit the remaining `modal-overlay` usages in `RubricList`, `RubricBuilder`, `ActivityDashboardPage` and `QuestionEditor` the same way.

---

### F6 — High — Mobile navigation drawer is not keyboard/screen-reader modal
**WCAG:** 4.1.2 (A), 2.4.3 (A)

At 390 px, opening “Open navigation menu” adds `.mobile-open` to the `<aside>` but:
* focus stays on the trigger (not moved into the drawer),
* `Escape` does not close it,
* the drawer has no `role="dialog"`/`aria-modal`, and the trigger has no `aria-expanded`/`aria-controls`,
* the main area is not `inert`, so Tab walks the page behind the drawer.

Evidence: `results/interactions.json`, `mobile-drawer`:
```
open: true, focusInside: false, focus: "BUTTON:Open navigation menu",
role: null, ariaModal: null, backgroundInert: false, stillOpenAfterEscape: true
```
Source: [Sidebar.tsx:234-274](../../src/components/Layout/Sidebar.tsx#L234-L274), [Topbar.tsx:56-62](../../src/components/Layout/Topbar.tsx#L56-L62).

**Fix:** treat the drawer as a modal dialog on mobile: `aria-expanded` on the trigger, `role="dialog"` + `aria-label`, move focus to the close button, trap focus, close on Escape/backdrop, restore focus, and mark the rest of the app inert/`aria-hidden`.

---

### F7 — High — Form controls without accessible names
**WCAG:** 3.3.2 Labels or Instructions (A), 4.1.2 (A)

* **Grading sliders** — 12 `<input type="range">` per scan (criterion points and sub-item points) have no label/`aria-label`. Source: [GradeStudent.tsx:1703](../../src/pages/GradeStudent.tsx#L1703), [CriterionDetailPanel.tsx:126](../../src/components/Grading/CriterionDetailPanel.tsx#L126).
* **Rubric CEFR threshold** — `<input type="number" min=1 max=100>` sits next to a `<label>` that is not associated (no `htmlFor`/`id`). Source: [RubricBuilder.tsx:1182-1200](../../src/pages/RubricBuilder.tsx#L1182-L1200).
* **Comparative grading** — 6 `<select class="comparative-level-select">` elements have no name; the visible “Score for <student>” is a sibling `<div>`. Source: [ComparativeGrading.tsx:990-1000](../../src/pages/ComparativeGrading.tsx#L990-L1000).
* **Test/essay rich-text toolbar** — paragraph style, font family, font size, line height selects and the colour inputs rely on `title` only (`label-title-only`, 16 unique nodes). Source: [EssayEditor.tsx:291,308,428](../../src/components/Editor/EssayEditor.tsx#L291).
* **TipTap comment editors** — `aria-label` is set on a `contenteditable` `<div>` with no role, so the name is prohibited/ignored (3 comment editors + general feedback). Source: [TiptapEditor.tsx:31](../../src/components/Editor/TiptapEditor.tsx#L31).
* **Portal unread dot** — `<span aria-label="Unread">` on a decorative span has no role, so the label is ignored. Source: [NewsFlashTimeline.tsx:60](../../src/components/Students/NewsFlashTimeline.tsx#L60).

**Fix:** add `aria-label`/`aria-labelledby` to sliders and selects (include criterion + level + student), associate the threshold label, replace toolbar `title` with `aria-label`, give TipTap `role="textbox" aria-multiline="true"`, and expose unread state as text/`role="img"` with a label (or `aria-hidden` + adjacent text).

---

### F8 — High — Charts have no text alternative
**WCAG:** 1.1.1 Non-text Content (A), 1.3.1 (A)

Only 4 of the reusable chart components expose `role="img"` + `aria-label` (`BloomsPyramidChart`, `CefrProgressChart`, `EloProgressChart`, `VocabCefrDistributionChart`). `ClassTrendChart`, `ScoreHistogram`, `LearningGoalChart`, `CriterionRadarChart`, `MultiClassTrendChart`, `ProfileTimelineChart`, `PortalGradeHistoryChart`, `FrameworkRoseChart`, `CriterionHeatmap` expose a bare `<svg>` with no name or summary, and the inline Recharts charts on `StatisticsPage` (`629`, `983`, `1147`, `1368`, `1582`) have none either. The two `<table>`s on Statistics cover only part of the data.

**Fix:** give each chart `role="img"` and a concise `aria-label` that states the trend/values, plus an associated visually-hidden data table or “View as table” toggle for the full series. Add a lint/test guard that every `<ResponsiveContainer>` lives inside a labelled `<figure>`/`role="img"` wrapper.

---

### F9 — High — `html lang` never changes with the UI language
**WCAG:** 3.1.1 Language of Page (A)

`index.html` hard-codes `lang="en"` and no code updates `document.documentElement.lang`. With `settings.language = 'nl'` or `'fr'`, the UI renders Dutch/French strings while the document still declares English; screen readers then use the English voice/pronunciation rules.

Evidence: `results/interactions.json` (`language-nl`: `htmlLang: "en"`, heading “Rol & toegang”; `language-fr`: `htmlLang: "en"`, heading “Rôle et accès”).

**Fix:** in the same effect that applies the theme, set `document.documentElement.lang` from the active i18next language (and `dir` when an RTL locale is added). Map locale codes (`nl`, `fr`, `de`, `es`) to valid BCP 47 tags.

---

### F10 — Medium — Unlabelled navigation landmarks on every route; Docs has two
**WCAG:** 1.3.1 (A), 2.4.1 (A)

Every route has one `<nav>` without an accessible name: `<nav className="sidebar-nav">` ([Sidebar.tsx:274](../../src/components/Layout/Sidebar.tsx#L274)). `/docs` adds a second unlabelled `<nav>` for its section list ([DocsPage.tsx:1911](../../src/pages/DocsPage.tsx#L1911)), which axe reports as `landmark-unique`. The Docs “tabs” are buttons in a nav, so the list has no link/tab semantics.

**Fix:** label the sub-panel nav (`aria-label={t('sidebar.section_nav_label')}`), label the Docs nav (“Docs sections”), and either turn the Docs list into real links or a proper tablist (see F11).

---

### F11 — Medium — Settings tabs do not implement the ARIA tabs pattern
**WCAG:** 4.1.2 (A), 1.3.1 (A)

`role="tablist"` contains three `role="tab"` buttons, but:
* no `role="tabpanel"` exists and no tab has `aria-controls`;
* all three tabs are in the tab order (no roving `tabindex`);
* Arrow keys do nothing (ArrowRight left focus and selection on “General”).

Evidence: `results/interactions.json`, `settings-tabs`.
Source: [SettingsPage.tsx:549-585](../../src/pages/SettingsPage.tsx#L549-L585).

**Fix:** add `id`/`aria-controls`/`tabpanel` with `aria-labelledby`, roving `tabIndex` (0 on selected, -1 elsewhere), ArrowLeft/Right + Home/End handling, and keep activation on focus or Enter/Space per the APG tabs pattern.

---

### F12 — Medium — Nested interactive controls and undersized targets
**WCAG:** 4.1.2 (A), 2.5.8 Target Size (Minimum) (AA, WCAG 2.2)

* The criterion drag handle is `<div role="button" tabindex="0">` and contains the “Move criterion up/down” `<button>`s — axe `nested-interactive` (3 per theme). Screen readers announce a button containing buttons. Source: [RubricBuilder.tsx](../../src/pages/RubricBuilder.tsx) drag handle.
* Drag handles are 17×13 px and the grading “Better/Worse Modifier” number input is 60×5 px of usable height — `target-size` (3 unique nodes). Source: [StudentsPage.tsx](../../src/pages/StudentsPage.tsx), [GradeStudent.tsx](../../src/pages/GradeStudent.tsx).

**Fix:** make the drag handle a plain `role="button"` with no focusable children (move the up/down buttons outside the handle), or use `@hello-pangea/dnd`’s keyboard sensor without wrapping controls. Give handles/inputs at least 24×24 px (padding is enough).

---

### F13 — Medium — Data tables lack header scope and captions
**WCAG:** 1.3.1 (A)

The Students table (`/students`) has 8 `<th>` cells but **none has `scope`**, and there is no `<caption>`; the table has grouped header rows. Screen readers may not associate the second header row with the right columns.

**Fix:** add `scope="col"`/`scope="row"` (or `headers`/`id` for the grouped headers) and a visually hidden `<caption>`; do the same for the other `data-table` instances (the audit found 1 on Students; check TestList/RubricList tables).

---

### F14 — Medium — 200 % text clips the test-builder toolbar
**WCAG:** 1.4.4 Resize Text (AA)

At 200 % text size, four rich-text toolbar `<select>`s on `/tests/:id` render 39 px of content in a fixed 26 px box (`height: 28px` in the toolbar styles), clipping “Paragraph”, “Inter (default)”, “Size”, “Line height”. Other sampled routes pass.

Source: [EssayEditor.tsx](../../src/components/Editor/EssayEditor.tsx) toolbar heights.

**Fix:** replace the fixed heights with `min-height`/padding and let the controls grow (`height: auto`, `line-height: 1.4`). Re-run `responsive.mjs` after the change.

---

### F15 — Low — `prefers-reduced-motion` is only honoured by skeletons
**Best practice; WCAG 2.3.3 (AAA) if animation is considered essential-free**

The modal’s scale-in animation is disabled under reduced motion, but the overlay still runs `modal-overlay-in 0.16s` and toast/other transitions are not reduced. Only `.skeleton` is covered in [index.css:1337-1341](../../src/index.css#L1337-L1341).

**Fix:** add a global `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; } }` (keep the skeleton rule) or scope it to the animated components.

---

### F16 — Low — Toast auto-dismiss and action time limits
**WCAG:** 2.2.1 Timing Adjustable (A) — depends on whether the toast is the only path to Undo

Toasts disappear after 4 s (8 s with an action). The delete flow’s Undo is only in the toast; a user who needs more time loses the undo path. (Deletion is held until the toast closes, so this is recoverable only within that window.)

Evidence: `results/interactions.json`, `toast` (`role="alert"` present, no `aria-live` attribute — implicit assertive is fine).
Source: [ToastContext.tsx:31-45](../../src/context/ToastContext.tsx#L31-L45).

**Fix:** keep action toasts until dismissed, or add a persistent “Recently deleted” entry in Admin → Archive (the docs already describe restore there). At minimum, pause the timer on hover/focus.

---

### F17 — Low — Search results are not announced
**WCAG:** 4.1.3 Status Messages (AA)

`GlobalSearch` updates a result list as you type, but there is no live region announcing “N results” / “No results”, and the results are a flat list of buttons without listbox/option semantics. The dialog itself is a labelled Radix modal with `autoFocus`.

Source: [GlobalSearch.tsx:90-140](../../src/components/Search/GlobalSearch.tsx#L90-L140).

**Fix:** add `<span role="status" class="sr-only">` with the result count, and consider `role="listbox"`/`option` with `aria-activedescendant` or keep buttons but add `aria-live` counts.

---

### F18 — Low — Timer has no accessible context / extension
**WCAG:** 2.2.1 (A) — if the time limit is not essential

The exam countdown renders only `mm:ss` next to a clock icon; there is no “Time remaining” accessible name, no warning announcement, and no way to extend for students with an approved accommodation (the read-aloud accommodation exists, but no time extension).

Source: [CountdownTimer.tsx:45-70](../../src/components/ui/CountdownTimer.tsx#L45-L70).

**Fix:** add `aria-label={t('exam.time_remaining', { time })}` (updating at most once per minute to avoid chatter), announce at 5 min / 1 min via a polite live region, and provide a teacher-controlled extension/accommodation flag.

---

## 4. What already works

* **Reflow (1.4.10):** 41/41 routes at 320 px have no page-level horizontal overflow.
* **Text spacing (1.4.12):** injected 1.5 line-height / 0.12 em letter-spacing / 0.16 em word-spacing / 2 em paragraph spacing caused no clipping outside `.sr-only`.
* **Focus visibility:** every keyboard stop sampled (24) had a 2 px focus outline.
* **No positive `tabindex`.**
* **Landing page:** one `<h1>`, no axe violations, “Continue without account” is the first tab stop and has a focus ring.
* **Radix-based dialogs:** focus trap, Escape-to-close, labelled title (delete confirmation, search, shortcuts) — only the focus-restore and `aria-modal` details need work.
* **Toasts** use `role="alert"`; error text for student email is associated with `aria-describedby` and `aria-invalid`; the duplicate-name warning uses `role="status"`.
* **Existing a11y tests:** `jest-axe` assertions across 8 test files. They are a good base but currently **cannot catch these issues** — see below.

---

## 5. Why the current guards missed this

1. `src/pages/__tests__/pages.a11y.test.tsx` (and the admin/phase4/student suites) render pages **in isolation**, so:
   * there is no Topbar/Sidebar shell — no page title, no duplicate nav, no h1-less shell;
   * `region` is disabled for that reason;
   * `color-contrast` is disabled because jsdom has no layout.
2. `contrastCheck.test.ts` asserts a **shaded 700** accent on a white background, but the app never uses the 700 step for text; it applies the raw accent. The test’s `DARK_BG`/`LIGHT_BG` constants (`#0f1219`, `#f8fafc`, …) also no longer match `index.css` (`#161410`, `#f1ebe0`, …), and `--text-dim` is not covered at all.
3. There is no browser-based a11y gate in CI: Playwright runs functional specs only, so color contrast, focus traps, skip links and the mobile drawer are never exercised.

**Recommended guardrails**
* Add a Playwright `a11y` project that runs `axe.run` on every route in light/dark and fails on `serious`/`critical` violations (start with `color-contrast`, `label`, `select-name`, `nested-interactive`, `target-size`).
* Render the app shell in the jest-axe tests (or move those assertions to Playwright) and enable `region`.
* Rewrite the contrast test to read the real tokens from a shared JS module (export the token values from one source of truth) and assert **both themes**, `--text-dim`, the badge text colours, and all accent presets for **text on surface** and **text on button**.
* Add a `page-has-heading-one` assertion per route and a per-route title map test.

---

## 6. Remediation plan

**P0 — before claiming AA (≈2–3 days)**
1. Fix the skip link (F1) and add a regression test.
2. Route titles + a real `<h1>` per route + meaningful route announcement (F2).
3. Token contrast: `--text-dim`, badge text, active nav, accent text/fill variants in both themes (F3).
4. Accessible names for grading sliders, threshold input, comparative selects, toolbar controls and TipTap (F7).
5. `html lang` (F9).
6. Move Students dialogs onto `Modal`/`ConfirmDialog`; restore focus in `ConfirmDialog`; make the mobile drawer modal (F5, F6).

**P1 — next (≈3–5 days)**
7. Chart alternatives (F8).
8. Keyboard-shortcut setting/remap (F4).
9. Tabs pattern (F11), nav labels (F10), nested interactives/target sizes (F12), table scopes (F13), 200 % toolbar (F14).

**P2 — polish**
10. Reduced motion (F15), action-toast persistence (F16), search announcements (F17), timer context/extension (F18).

---

## 7. Appendix — route matrix (theme default, desktop)

`Headings` lists the heading levels actually present. Contrast is light/dark node count.

| Route | Headings | Contrast (L/D) | Other axe findings |
|---|---|---|---|
| `/` | h2 h3 h3 h3 h3 h3 | 9 / 5 | — |
| `/rubrics` | h3 h3 | 9 / 3 | — |
| `/rubrics/new` | h3 h4 h4 h4 h2 | 6 / 1 | — |
| `/rubrics/:id` | h3 h4 h4 h4 h2 | 3 / 1 | label, nested-interactive |
| `/rubrics/:id/grade/:studentId` | h2 | 3 / 1 | label, target-size |
| `/rubrics/:id/peer-review/:studentId` | h2 h3 h3 h3 h3 | 3 / 1 | aria-prohibited-attr |
| `/peer-analytics/:rubricId` | h2 | 2 / 1 | — |
| `/rubrics/:id/self-assess/:studentId` | h2 h3 h3 | 3 / 1 | — |
| `/speaking/:rubricId/:studentId` | h3 h3 h3 h3 | 2 / 1 | — |
| `/grade-comparative/:classId/:rubricId` | h2 h2 | 4 / 2 | label-title-only, select-name, label |
| `/students` | h3 | 7 / 1 | target-size |
| `/students/:id` | h2 h3 h3 h3 | 5 / 3 | — |
| `/students/:id/cefr-overview` | h2 h3 h3 | 4 / 2 | — |
| `/students/:id/learning-path` | h2 h3 h3 h3 | 3 / 1 | — |
| `/cefr-overview` | — | 7 / 5 | — |
| `/vocabulary` | h3 | 3 / 1 | — |
| `/tests` | h3 | 5 / 2 | — |
| `/tests/new` | h3 h3 h3 h3 | 3 / 1 | — |
| `/tests/:id` | h3 h3 h3 | 3 / 1 | label-title-only |
| `/essays` | h3 | 3 / 1 | — |
| `/essays/new` | h3 h3 h3 | 3 / 1 | — |
| `/flashcards` | h3 | 4 / 1 | — |
| `/flashcards/:id` | h3 h3 | 3 / 1 | — |
| `/news-flashes` | h3 | 3 / 1 | — |
| `/portal/:studentId` | h1 h2 h4 | 0 / 0 | aria-prohibited-attr, heading-order |
| `/portal/:studentId/flashcards/:deckId` | h1 h2 | 4 / 1 | — |
| `/attachments` | h3 | 3 / 1 | — |
| `/export` | h3 h3 h3 h3 h3 h3 | 3 / 1 | — |
| `/statistics` | h3 h3 h3 h3 | 4 / 1 | label-title-only |
| `/activity-dashboard` | h3 | 4 / 1 | — |
| `/moderation` | h3 | 3 / 1 | — |
| `/notifications` | — | 3 / 1 | — |
| `/messages` | h3 | 3 / 1 | — |
| `/comments` | — | 6 / 3 | — |
| `/question-bank` | — | 4 / 2 | — |
| `/marketplace` | — | 3 / 1 | — |
| `/settings` | h3 h3 h3 h3 h3 h3 | 5 / 1 | — |
| `/admin` | — | 4 / 1 | — |
| `/docs` | h2 h3 … h3 h2… | 6 / 3 | landmark-unique |
| `/privacy` | h2 h3 … | 11 / 1 | — |
| `/this-route-does-not-exist` | h1 | 2 / 1 | — |

---

## 8. Artifacts

| File | Contents |
|---|---|
| [audit.mjs](audit.mjs) | Route scanner (axe + structure), writes the JSON below |
| [interactions.mjs](interactions.mjs) | Skip link, tab walk, dialogs, drawer, tabs, language, route change, reduced motion |
| [responsive.mjs](responsive.mjs) | 320 px reflow, 200 % text, 1.4.12 text spacing |
| [fixtures.mjs](fixtures.mjs) | Deterministic local-mode seed and route list |
| [results/axe-desktop-default.json](results/axe-desktop-default.json) | 82 desktop scans, theme accent |
| [results/axe-mobile-default.json](results/axe-mobile-default.json) | 82 mobile scans, theme accent |
| [results/axe-desktop-custom-accent.json](results/axe-desktop-custom-accent.json) | 82 desktop scans, custom accent `#3b82f6` |
| [results/interactions.json](results/interactions.json) | Manual/keyboard/dialog evidence |
| [results/responsive.json](results/responsive.json) | Reflow/resize/spacing measurements |

Line references in this report point at `bac28af9`; the main checkout may be behind that commit.

---

## 9. Regression gate (CI)

The audit above is a point-in-time snapshot; `e2e/specs/51-a11y.spec.ts` (Playwright project `a11y`) keeps it from regressing.

- **Coverage**: every route in `A11Y_ROUTES` (`e2e/fixtures/a11y.fixture.ts`) in light *and* dark mode, seeded through the same deterministic local-mode data as this report. 45 routes × 2 themes = 90 scans, under a minute locally. This closes the audit's own gap: `/tests/:testId/results/:studentTestId`, `/tests/:testId/monitor`, `/essays/:teacherKey` and `/essays/:assignmentId/monitor` were not in the original 41-route scan and are now gated too.
- **Rules**: axe-core with `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22a`, `wcag22aa` and `best-practice`.
- **Gate**: only **serious** and **critical** impacts fail; moderate/minor are not gated. Every page must render (no uncaught errors, non-empty `#root`) so a crashed route cannot pass vacuously.
- **Baseline**: `e2e/a11y-baseline.json` records accepted debt per route + theme + rule + node count — currently **90 rows / 415 nodes / 11 rules** (`color-contrast` 245, `page-has-heading-one` 84, `label-title-only` 32, `label` 14, `select-name` 12, `aria-prohibited-attr` 10, `nested-interactive` 6, `target-size` 6, `landmark-unique` 2, `aria-progressbar-name` 2, `heading-order` 2). A new rule on a route, a new route, or growth beyond the recorded node count fails the job. `target-size` alone gets +4 nodes of slack because it measures rendered geometry and macOS/Linux font metrics differ; colour is computed from CSS, so contrast stays exact. Improvements (including a rule that now passes entirely) are surfaced as annotations but do not fail.
- **Commands**: `npm run e2e:a11y` (gate), `A11Y_STRICT=1 npm run e2e:a11y` (zero tolerance, use this once the P0 items are fixed), `A11Y_UPDATE_BASELINE=1 npm run e2e:a11y && npm run e2e:a11y:baseline` (accept new debt deliberately).
- **CI**: the `E2E — Accessibility (axe)` job in `ci.yml` runs the gate on every PR/push/merge-queue entry, and the three deploy jobs now `need` it, so a regression blocks deployment as well as merge.

This gate does **not** replace the manual checks in §4–§6: keyboard trap mechanics, screen-reader behaviour, 200 % text/reflow, and `lang` changes are not detectable by axe and remain untested here.
