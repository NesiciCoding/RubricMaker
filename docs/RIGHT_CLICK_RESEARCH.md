# Right-click takeover — research & opportunity assessment

**Status:** explorative research only. Nothing here is implemented, and no application code was changed.
**Date:** 13 November 2026
**Scope:** teacher-side surfaces, student-side surfaces, and the one existing lockdown path (Safe Exam Browser).

---

## 1. What "takeover" could mean

Four distinct levels. Most of the value and almost all of the risk lives in the difference between them.

| Level                              | Behaviour                                                                                                | Verdict                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **L0 — Respect native**            | Never intercept `contextmenu`. Today's default.                                                          | Keep in editors, inputs, and student exam surfaces.                                             |
| **L1 — Augment**                   | Intercept, show our items, then still offer a "Browser menu" escape hatch.                               | Not really possible: the native menu can't be re-opened programmatically. Rejected as a design. |
| **L2 — Replace on named surfaces** | Intercept only on elements we opt in (cards, grid cells, rows). Editors and inputs keep the native menu. | **This is the recommendation.**                                                                 |
| **L3 — Global takeover**           | `preventDefault()` on `document` everywhere.                                                             | Rejected — see §5.                                                                              |

The one place a form of L3 already exists is [StudentEssayPage.tsx:552](../src/pages/StudentEssayPage.tsx#L552), which suppresses `contextmenu` document-wide **only inside Safe Exam Browser**. That is intentional lockdown, not UX, and should stay exactly as narrow as it is.

---

## 2. Platform reality (this decides everything)

The `contextmenu` event is the _only_ correct hook. Binding to `mousedown` with `button === 2` is the classic mistake: it works for mouse users and is invisible to everyone else.

| Input                                       | Fires `contextmenu`?            | Notes                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Right-click (Windows/Linux/ChromeOS)        | Yes                             |                                                                                                                                                                                                                                                                                                   |
| Two-finger tap on trackpad                  | Yes                             | This is the **Chromebook** gesture — the dominant school device.                                                                                                                                                                                                                                  |
| Ctrl+click (macOS)                          | Yes                             |                                                                                                                                                                                                                                                                                                   |
| **Shift+F10** / **Menu (Applications) key** | **Yes**, on the focused element | The keyboard route. Free accessibility if we listen for the event rather than the button.                                                                                                                                                                                                         |
| VoiceOver, macOS (`VO+Shift+M`)             | Yes                             |                                                                                                                                                                                                                                                                                                   |
| **iOS / iPadOS Safari, long-press**         | **No**                          | WebKit has never fired `contextmenu` on iOS ([WebKit #213953](https://bugs.webkit.org/show_bug.cgi?id=213953), [React #21812](https://github.com/facebook/react/issues/21812)). iOS shows its own callout instead. A long-press timer would have to be hand-rolled, and it fights text selection. |
| Android Chrome, long-press                  | Yes                             | But jitter cancels it and the native link menu often wins; scroll-vs-long-press conflicts are a known bug class.                                                                                                                                                                                  |
| Safe Exam Browser                           | Suppressed by us                | Leave suppressed.                                                                                                                                                                                                                                                                                 |
| Firefox, **Shift**+right-click              | No — by design                  | Users get a built-in escape hatch to the native menu. Useful, undocumented, free.                                                                                                                                                                                                                 |

Two more gotchas worth writing down before anyone builds:

- `contextmenu` is [not Baseline](https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event) — MDN's own compat table flags limited availability.
- Chrome fires `contextmenu` on a **double-tap inside an editable element** ([Chromium #41487195](https://issues.chromium.org/issues/41487195)). Any global handler must bail out on `input`, `textarea`, `[contenteditable]`, and ProseMirror/TipTap roots — otherwise double-tapping a word in the essay editor or a rubric description opens our menu over the spellcheck menu.

**Consequence for this app:** the app is a PWA with a stated tablet target and a Chromebook-heavy deployment (Dutch VO schools). So right-click is genuinely well-supported for _teacher_ work (mouse, trackpad, keyboard) and effectively **not available on iPad**. Any feature built this way needs a visible twin — which is the same conclusion NN/g reaches independently.

---

## 3. What the research says about the pattern itself

From [NN/g's contextual-menu guidance](https://www.nngroup.com/articles/contextual-menus-guidelines/) and [the earlier article](https://www.nngroup.com/articles/contextual-menus):

- Contextual menus are **hidden by default**, so users may never learn they exist. Always provide another route to the same actions.
- Use them for **secondary** actions that are used often enough to need to be fast, but not important enough to be primary. Never bury essential high-frequency actions there.
- Give a **visual signifier** (kebab ⋯ / chevron) and keep it prominent; hover-only or faint triggers get missed.
- **Group related options** logically (`Duplicate / Share / Delete`).
- Disable rather than hide irrelevant items so the menu doesn't reshuffle — Apple's HIG disagrees for context menus specifically (hide irrelevant items there). Pick one and state it; iOS-style hiding is the better fit for a per-object menu with wildly different object types.

Accessibility obligations, if we do replacement at all:

- **SC 2.1.1 Keyboard** — anything reachable only by right-click must be reachable by keyboard. Listening for `contextmenu` gives this for free (Shift+F10 / Menu key); `mousedown` does not.
- **SC 2.4.3 Focus Order** — focus must return to the invoking element on close.
- **[APG Menu / Menu Button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button)** — `role="menu"`, `role="menuitem"`, arrow-key roving focus, Home/End, Escape to close, type-ahead optional. The repo already implements all of this twice ([ui/DropdownMenu.tsx](../src/components/ui/DropdownMenu.tsx), [Grading/GradingActionsMenu.tsx](../src/components/Grading/GradingActionsMenu.tsx)), so there is a proven pattern to copy rather than invent.

---

## 4. Where the app actually hurts today (grounding)

Right-click is only worth intercepting where there is an action to surface. Measured from the code:

| Surface                                       | Current state                                                                                                                                                 | Opportunity                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `RubricCard`                                  | **Nine** inline icon buttons (share, copy code, preview link, differentiate, move, duplicate, edit, archive, delete) + 3 primary buttons + 4 more icons below | Classic icon saturation. Right-click + one visible ⋯ could reclaim the row — _only_ if ⋯ stays.              |
| `StudentsPage` row                            | Up to **six** full-width "Grade: …" pills per student plus ~6 icon buttons, plus a nested `role="menu"` dropdown                                              | The audit already calls this the app's biggest clutter source ([UX_AUDIT.md](UX_AUDIT.md) §cross-cutting 1). |
| `ScoreSheetGrid`                              | One `<input>` per student × question cell; absent is a checkbox in a far-right column; **no bulk row/column operations**                                      | The strongest right-click fit in the app: spreadsheet idiom users already know.                              |
| `CriterionCard` / `RubricBuilder`             | Duplicate/move/delete/link-standard exist as individual icons per criterion                                                                                   | Right-click on the criterion body = the same set, zero chrome, and room to add "paste criteria here".        |
| `GradeStudent` criterion card                 | Level buttons, "comment bank" button, best-fit hint, modifier, override                                                                                       | Grading is done ~30× per class; a per-criterion menu is the highest-frequency win.                           |
| `TestBuilderPage` question outline            | Duplicate/remove per question                                                                                                                                 | Right-click in the outline is the natural "insert bank item here" / "move to section" home.                  |
| Charts (`StatisticsPage`, Recharts)           | No export affordance on the chart itself                                                                                                                      | "Copy data as CSV" / "Save image" is cheap and expects the native gesture anyway.                            |
| Attachments, Flashcards, Essays, Live Monitor | Actions live in modals or per-row buttons                                                                                                                     | Medium-value; each needs its own object-type menu.                                                           |

---

## 5. What we should **not** take over

1. **TipTap / ProseMirror editors** — rubric criteria and descriptions, test prompts, essay editor, feedback fields, inline comment composers. Right-click there is _paste, spellcheck, Add to dictionary, Look Up, Translate, dictation, Paste and Match Style_. Taking it away is a functional regression with a real accessibility cost (dyslexic students rely on spellcheck; dictation users rely on paste). Also, students' essays are proctored — copy/paste there is already logged as an event ([useLiveSessionTelemetry.ts:269](../src/hooks/useLiveSessionTelemetry.ts#L269)).
2. **Any `<input>`, `<select>`, `<textarea>`** — same reason, plus the Chrome double-tap bug above.
3. **Student test and essay pages outside SEB.** Suppressing right-click outside SEB is security theatre: Ctrl+U, F12, and view-source still work, while the honest users lose paste and spellcheck. SEB is the actual enforcement mechanism and it already works. Keep the suppression scoped to `isInSEB`.
4. **The global app shell.** Removing "Inspect element" in development, and "Save image as" on prompt images / LaTeX-less maths images in test previews, is a developer-and-teacher nuisance with no upside.
5. **"Append our items above the native menu."** Not implementable — there is no API to re-open the browser menu after `preventDefault()`. Any product pitch that assumes this is wrong.
6. **Long-press takeover on iPad.** iOS Safari doesn't fire the event; hand-rolling a timer means fighting `-webkit-touch-callout`, text selection, and the magnifier, and then doing it again for Android's scroll conflict. Cost is high, reliability is low. Ship touch users a visible menu instead.

---

## 6. Candidate behaviours, ranked by context

Legend — usefulness **1–5** per context. **D** = desktop mouse / **C** = Chromebook trackpad / **T** = tablet touch.

### 6.1 Highest-value, lowest-risk (build first)

| #   | Surface                        | Right-click does                                                                                                                  | D     | C     | T   | Effort | Notes                                                                                                                                  |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----- | ----- | --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ScoreSheetGrid` cell          | Mark absent · Clear · Copy value · **Fill down column** · Fill across row · Flag for review                                       | **5** | **4** | 2   | M      | The one place where the native spreadsheet mental model already exists. Fill-down alone would remove hundreds of keystrokes per class. |
| 2   | `ScoreSheetGrid` row header    | Mark absent · Clear row · Open results · Copy grade as text                                                                       | 4     | 4     | 2   | S      | Pairs with #1; absent is currently a checkbox in the last column, which is a long mouse trip.                                          |
| 3   | `GradeStudent` criterion card  | Set level (submenu of level names) · Open comment bank · Add modifier · Mark "not assessed" · Copy feedback from previous student | **5** | 3     | 3   | M      | Grading is the app's hot loop. Copying the previous student's wording for the same criterion is the quiet killer feature.              |
| 4   | `RubricBuilder` criterion card | Duplicate · Move up/down · Delete · Link standard/descriptor · Convert to sub-items · **Paste criteria here**                     | **5** | 3     | 2   | S–M    | All but "paste" already exist as per-card icons; this is a re-home, not new logic.                                                     |
| 5   | Comment-bank item (in grading) | Insert at caret · Copy text · Edit · Pin to top                                                                                   | 4     | 3     | 3   | S      | Turns a two-step (open panel → click) into one gesture, without hiding the panel.                                                      |
| 6   | `StudentsPage` student row     | Grade with last rubric · Open profile · **Copy portal link** · Message · Email sign-in link · Archive                             | **5** | 4     | 3   | M      | Direct answer to the six-pill clutter. Requires the visible ⋯ to stay for discoverability.                                             |

### 6.2 Strong, but needs a new capability underneath

| #   | Surface                                                   | Right-click does                                                                           | D   | C   | T   | Effort | Notes                                                                                                                                                                  |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --- | --- | --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | Empty area of Rubrics / Tests / Essays / Flashcards lists | New in this folder · **Import from share code** · Paste from clipboard · New folder        | 4   | 3   | 1   | M      | Discoverability of import is currently poor; a background menu helps power users, the toolbar still needs the button.                                                  |
| 8   | Test builder question outline                             | Duplicate · Move to section ▸ · Delete · Change type ▸ · **Insert bank item here**         | 4   | 3   | 2   | S–M    | Outline is the only place where "insert between" makes sense.                                                                                                          |
| 9   | Multi-selected cards (Rubrics/Tests)                      | Archive · Export · Share · Move to folder                                                  | 4   | 3   | 2   | **L**  | Blocked on a selection model, which doesn't exist for rubrics/tests today ([UX_AUDIT.md](UX_AUDIT.md): "No bulk action"). Do the selection model first, or not at all. |
| 10  | `LiveMonitorPage` student row                             | Nudge · Message · Flag · Extend time                                                       | 4   | 3   | 2   | M      | Live proctoring is a time-critical context where precision matters.                                                                                                    |
| 11  | Attachment tile                                           | Download · Copy link · Open · Re-run OCR · Relink to student · Delete                      | 4   | 3   | 2   | M      |                                                                                                                                                                        |
| 12  | Chart (Statistics / CEFR / Vocabulary)                    | Copy data as CSV · Save image · Open underlying table                                      | 3   | 3   | 1   | S      | Cheap; expects the native gesture anyway.                                                                                                                              |
| 13  | Rubric level header cell                                  | Clear level · Copy level description · Paste description                                   | 3   | 3   | 1   | M      | Only pays off for authors who build many rubrics.                                                                                                                      |
| 14  | Folder tile                                               | Rename · New subfolder · Share · Delete                                                    | 4   | 3   | 2   | S      | Existing actions; consolidation only.                                                                                                                                  |
| 15  | Flashcard in deck                                         | Edit · Suspend/bury · Move to deck · Attach image/audio                                    | 3   | 2   | 2   | M      | "Bury" is new FSRS-surface behaviour, not a re-home.                                                                                                                   |
| 16  | Essay list group                                          | Archive · Duplicate assignment · Copy student links · Monitor                              | 3   | 3   | 2   | M      |                                                                                                                                                                        |
| 17  | Rubric card                                               | Duplicate into tier / variant ▸ · Copy share code **vs** Copy preview link (disambiguated) | 3   | 3   | 2   | M      | The two link types are the most-confused pair in the card; a menu can label them properly.                                                                             |
| 18  | Cross-rubric: criterion card → other open rubric          | "Paste criteria from…" ▸                                                                   | 4   | 3   | 1   | **L**  | Genuinely useful for teachers assembling tiered rubrics, but needs a clipboard model that doesn't exist.                                                               |
| 19  | Student portal grade row                                  | Copy · Download feedback PDF                                                               | 2   | 2   | 3   | S      | Low value; the portal is deliberately simple.                                                                                                                          |

### 6.3 Rejected (documented so they don't get re-proposed)

| Idea                                                                | Why not                                                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Takeover inside the essay/rubric TipTap editor ("add comment here") | Kills paste, spellcheck, Look Up, dictation. Use the existing inline-comment bubble or a shortcut instead. |
| Takeover in `<input>`/`<textarea>` fields                           | Same, plus the Chrome double-tap `contextmenu` bug.                                                        |
| Takeover on student test/essay pages outside SEB                    | Security theatre; hurts accessibility; proctoring already logs copy/cut/paste.                             |
| Global document-level takeover                                      | Removes Inspect in dev, Save image, extensions, and macOS dictionary for no product gain.                  |
| Long-press on iPad                                                  | iOS never fires the event; a hand-rolled timer trades reliability for a gesture users won't discover.      |
| Right-click as the _only_ route to an action                        | Violates SC 2.1.1 in spirit and NN/g in practice. Every item must exist in a visible menu too.             |

---

## 7. Technical shape, if this goes ahead

The repo already has the right building block; the work is a thin layer on top.

- **One shared primitive.** `src/components/ui/ContextMenu.tsx` that reuses `DropdownMenu`'s portal + fixed positioning + roving-focus logic, but is positioned at `clientX/clientY` (clamped to the viewport) instead of anchoring to a trigger, and remembers an "invoker" element to restore focus to.
- **Opt-in, per element.** A `useContextMenu(items)` hook returning `onContextMenu`, not a document listener. This is the single most important structural decision: it makes "editor and inputs keep the native menu" true by construction rather than by a growing exclusion list.
- **Bail-out guard inside the primitive** for `input`, `textarea`, `select`, `[contenteditable]`, `.ProseMirror`, and any element with `data-native-menu` — belt and braces on top of the opt-in.
- **One source of truth per object type.** Define the items once (`rubricCardMenuItems(rubric)`, `scoreCellMenuItems(cell)`) and render them from _both_ the `⋯` button and the right-click handler. That is what keeps the two routes from drifting, and it makes the accessibility review a review of one list.
- **Portal + `z-index: 200` + `.no-print`**, matching `DropdownMenu`. The existing comment about `.fade-in` transforms breaking fixed positioning (#1017) applies here too.
- **Dismissal:** outside `mousedown`, Escape → restore focus, `resize`/`scroll` (capture) → close, and close on `blur` of the window. `GradingActionsMenu` already has the exact recipe.
- **Don't `preventDefault` on `mouseup`/`auxclick`** — only on the `contextmenu` event itself, so middle-click and autoscroll still behave.
- **Cost multiplier to budget for** (this is why the effort ratings above aren't smaller):
    - every item needs a key in **all five locale files** (`en/nl/fr/de/es`), enforced by `usedKeys.test.ts`;
    - the project's documentation rule requires matching updates in `DocsPage.tsx`, `README.md` and `LandingPage.tsx` for a user-facing feature;
    - new interactive surfaces want an e2e spec that is registered in a Playwright project (`playwrightProjects.test.ts` guards this);
    - the axe gate only tests routes in `A11Y_ROUTES`, so the menu being reachable _and_ keyboard-complete should be asserted in the e2e spec rather than assumed.

---

## 8. Recommendation

**Do a scoped L2 pilot on three surfaces, behind one shared primitive — not a global takeover.**

1. **`ScoreSheetGrid` cells and rows** (#1, #2) — highest value per unit of new logic; the gesture is already idiomatic there.
2. **`GradeStudent` criterion card** (#3) — highest frequency of use in the whole app.
3. **`RubricBuilder` criterion card** (#4) — replaces nine icons with one gesture plus one visible control.

Each of these is a **re-home of actions that already exist**, so the risk is presentation, not behaviour. If those three land well, extend to `StudentsPage` rows (#6) — which is where the clutter argument is strongest — and only then consider the capabilities that need new foundations (clipboard model, multi-select, fill-down).

Non-negotiable conditions for any of it:

- Listen for `contextmenu`, never `mousedown` — this is what keeps Shift+F10/Menu-key users working.
- Every action stays reachable from a **visible** `⋯` / toolbar control.
- Editors, inputs and SEB keep the native menu untouched.
- Escape restores focus; the panel closes on reflow and outside click.
- Teach the gesture **once** (a single ToastContext tip, or a step in the existing Joyride tour) — not with permanent chrome.

**Expected payoff if only #1–#4 ship:** fewer per-row controls on the two most cluttered surfaces, a faster grading loop, and a fill-down that removes repetitive typing from score entry. **Expected payoff if a global takeover ships instead:** user complaints about broken paste, a failed axe/accessibility review, and no measurable gain — which is the outcome worth avoiding.

---

## 9. Open questions for the product owner

1. Is tablet teacher-use a real target, or is tablet only for students? If teachers grade on iPads, the visible-menu half of this work matters far more than the gesture, because iOS won't fire the event.
2. Grading on a Chromebook: is two-finger tap something teachers actually reach for, or is it a mouse-only staffroom?
3. Should the score sheet get a proper selection model (rectangle select + fill) instead of a per-cell menu? That is a bigger change, but it is the change teachers would feel most.
4. Is a cross-rubric criteria clipboard wanted enough to justify its own feature, or is "duplicate + delete the rest" good enough?

---

## Sources

- [MDN — Element: `contextmenu` event](https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event)
- [W3C WAI-ARIA APG — Menu Button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button) · [Menu and Menubar](https://www.w3.org/WAI/ARIA/apg/patterns/menubar)
- [Accessible Data Interfaces — opening custom context menus from the keyboard](https://www.accessible-data-interfaces.com/core-aria-keyboard-navigation-for-data-uis/context-menus-and-row-actions/opening-context-menus-from-the-keyboard)
- [NN/g — Designing effective contextual menus: 10 guidelines](https://www.nngroup.com/articles/contextual-menus-guidelines/) · [Contextual menus: delivering relevant tools](https://www.nngroup.com/articles/contextual-menus)
- [Apple HIG — Context menus](https://developer.apple.com/design/human-interface-guidelines/context-menus)
- [WebKit #213953 — no `contextmenu` on iOS](https://bugs.webkit.org/show_bug.cgi?id=213953) · [React #21812](https://github.com/facebook/react/issues/21812)
- [Chromium #41487195 — double-tap in editable fires `contextmenu`](https://issues.chromium.org/issues/41487195)
- [W3C Pointer Events #503 — long-tap event sequences per browser](https://github.com/w3c/pointerevents/issues/503)
- [MDN — `-webkit-touch-callout`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/-webkit-touch-callout)
