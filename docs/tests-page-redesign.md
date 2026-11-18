# Tests page (`#/tests/`) — card redesign

Status: **card redesign implemented**, folder changes are a **draft only**.

Scope: the test library at `/tests` (`src/pages/TestListPage.tsx`), its cards, and the panels
that hang off a card. The folder _behaviour_ (tile bar, breadcrumb, nesting, drag-to-file,
"Move to…") is unchanged in this pass — §4 is a proposal for the next one.

## 1. What was wrong

A single open card could contain, simultaneously:

| Region      | Contents                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| header      | drag grip, title, created date, due date                                                                                                                                                  |
| badges      | folder path, sharing, question count, points, SEB, submitted, average — up to **7 pills**                                                                                                 |
| description | one line                                                                                                                                                                                  |
| button rows | primary edit **+ 7 icon actions** in the body, **6 more icons** in the header                                                                                                             |
| expansion 1 | exam booklet export: version select, attachment mode, scan markers, student multi-select                                                                                                  |
| expansion 2 | every submission, class-average adjuster table, item analysis chart + table, grammar/standards panel, two navigation buttons, and an export form with two selects and four export buttons |

That is 14 controls and up to 7 status pills on a 400 px tile, plus two independent expanders that
could each grow the tile to several screens. In a library of twenty tests the grid becomes a wall of
icons, and the one thing a card exists for — "which test is this, and what do I do next?" — is the
hardest thing to find.

## 2. What changed (implemented)

### Card anatomy

```
┌────────────────────────────────────────────────────┐
│ ⠿  Vocabulary Unit 3 Quiz                  [ ⋯ ]  │  title (2 lines) + one overflow menu
│    12 questions · 30 points · 4 Mar · Due 12 Mar   │  one muted meta line, red due date when late
│    [ Unit 3 / Reading ]  [ Shared · editable ] [SEB]│  chips only when they carry state
│                                                     │
│    18 submitted · Avg 74%                           │  quiet stats, only once there are results
│    A short quiz about the first three chapters.     │  description, clamped to 2 lines
│  ─────────────────────────────────────────────────  │
│  [ ✎ Edit ]            [ ▤ Results ]  [ ▦ ]        │  primary + results + score sheet
└────────────────────────────────────────────────────┘
```

- **One meta line instead of five pills.** Questions, points, created and due date are text; only
  folder, sharing and SEB stay as chips (and each renders only when it applies). Question count /
  points are still translated separately so other languages can reorder them.
- **Results are a number, not a badge.** `18 submitted · Avg 74%` replaces the two status pills and
  sits above the rule, next to the action that opens the details.
- **Three actions on the card:** open (edit / score sheet for paper tests), results, score sheet.
  Everything else lives in the overflow menu.
- **The card never grows.** Results, analysis and export open in a right-hand drawer
  (`TestResultsDrawer`), and the exam booklet export opens in a dialog. The drawer keeps the
  submissions list, class-average adjuster, item analysis, grammar/standards panel and the whole
  export form — just outside the grid.

### Action layout, before → after

| Action                 | Before                                   | After                   |
| ---------------------- | ---------------------------------------- | ----------------------- |
| Edit / open            | header icon + body primary               | body primary            |
| Score sheet            | body icon row                            | body button             |
| Results                | body icon row → expander inside the card | body button → drawer    |
| Assign                 | body icon row                            | `⋯` → Teaching          |
| Live monitor           | body icon row                            | `⋯` → Teaching          |
| Import submission code | body icon row                            | `⋯` → Teaching          |
| Scan answer sheets     | body icon row                            | `⋯` → Teaching          |
| Exam booklet           | body icon row → expander inside the card | `⋯` → Teaching → dialog |
| Move to folder         | header `MoveToMenu` icon                 | `⋯` → Organise          |
| Share                  | header icon                              | `⋯` → Sharing           |
| Duplicate              | header icon                              | `⋯` → Sharing           |
| Archive                | header icon                              | `⋯`                     |
| Delete                 | header icon                              | `⋯`                     |

The menu is grouped (Teaching / Organise / Sharing, then Archive + Delete), items are full-width
with labels and icons rather than 14 unlabeled 28 px targets, and it is keyboard-navigable through
the existing `DropdownMenu` (arrow keys, Home/End, Escape returns focus to the `⋯` trigger).

Files: `src/components/Tests/TestCard.tsx` (new), `src/components/Tests/TestResultsDrawer.tsx`
(new), `src/pages/TestListPage.tsx` (card markup and panels removed; list view, folder bar, modals
and every handler kept).

### Deliberately unchanged

- The list view, cohort filter, card/list toggle and topbar create actions.
- Folder tiles and the folder bar: same tiles, same nesting, same drag-to-file, same "Move to…".
- Every existing action keeps its translation key and its behaviour.

## 3. Follow-ups for the card pass

- The folder tile still carries four controls (move, share, rename, delete) in a 220 px tile; the
  same overflow treatment would calm the folder row (see §4).
- The topbar has four create buttons (score-only, generate, import, new). A single "New" split
  button would reduce it to one control with a menu.
- A real "list" density (compact rows) for teachers with 50+ tests, separate from the existing
  table view.

## 4. Folder UX draft (not implemented)

The current model is a single-level tile bar: the folders inside the folder you are in, a
breadcrumb when you are inside one, cards for the rest, and `Move to…` for the tree. It works, and
it is what people learned. The draft below keeps that model and adds orientation, without turning
the page into a file manager.

### 4.1 Problems to solve

1. **No sense of the tree.** You see one level at a time; a folder that lives three levels down is
   invisible until you walk to it, and an empty level gives no hint that anything exists elsewhere.
2. **The bar competes with the cards.** Folder tiles are card-sized, so on a laptop one row of
   tiles plus the breadcrumb eats the first screen before a single test appears.
3. **"Unfiled" is not addressable.** There is no way to answer "what have I not filed yet?".
4. **Filing costs a drag or a menu.** Dragging is quick but only onto visible tiles; the menu is
   accurate but long.
5. **Counts are ambiguous.** `4 items` counts a subtree, which is right, but the tile gives no
   split between "tests here" and "tests in subfolders".

### 4.2 Draft: leader + optional tree

- **Keep the tile bar as the default.** One level, cards below — no change for anyone who does not
  ask for more.
- **Add a collapsible left rail on wide screens** (`≥ 1100px`) listing the whole tree with counts,
  indented, sticky while scrolling. Collapsed it is a 44 px icon rail (`Folders`), expanded it is
  ~220 px. On narrow screens it becomes the same one-level bar as today.
- **A persistent "All tests" / "Unfiled" pair** at the top of the rail, so unfiled work is a
  destination rather than an absence.
- **Counts split**: `4 tests · 2 folders` on the tile; the rail shows the subtree total.

### 4.3 Draft: cheaper filing

- **Breadcrumb as a drop target.** Dropping a card on a crumb files it into that ancestor (or to
  the top level on "All"), so moving up a level needs no menu.
- **Multi-select + "File…"**: `Shift`-click a range, `Ctrl/Cmd`-click individual cards, then one
  `File…` action files them all through the existing `MoveToMenu`. This is the feature that most
  reduces per-test work in a large library; it needs a selection toolbar and an "N selected" state.
- **Recent destinations** at the top of `Move to…` (last three folders used), then the full tree.

### 4.4 Draft: orientation extras

- **Search within the library** (`/` focuses it), scoped to the current folder with an option to
  search everything; results keep the folder path chip so location stays visible.
- **Empty folders explain themselves**: _"This folder is empty. Tests dragged here stay out of
  'All tests' sorting."_ plus a "File existing tests" button that opens the multi-select mode.
- **Per-folder colour/icon** (one accent per folder, used in the tile, the chip on cards and the
  rail). Cheap to store, and it is what makes a deep tree scannable at a glance.

### 4.5 What not to do

- Do not replace the bar with a full file-manager two-pane layout by default: the page's job is
  tests, not folders.
- Do not move tests implicitly (e.g. "into the current folder on create") without showing where
  they went — the current explicit choice is better than a silent rule.
- Do not add folder-level actions beyond rename/share/delete/move; tags already cover cross-cutting
  grouping, and folders + tags + search is where the complexity budget should stop.
