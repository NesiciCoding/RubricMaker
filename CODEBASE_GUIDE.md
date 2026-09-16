# RubricMaker — A Comprehensive Codebase Guide

> A printable walkthrough of the whole application, written for someone who knows how to
> code but is new to *this* codebase. It explains not just *what* each part does but *why*
> the less-obvious TypeScript, module, and regex choices are the way they are.
>
> To turn this into a PDF: open it in VS Code (or any Markdown viewer) and "Print → Save as
> PDF", or paste it into a browser-based Markdown renderer. It is deliberately plain Markdown
> so it prints cleanly.

---

## Table of contents

1. [How to read this guide](#1-how-to-read-this-guide)
2. [What the app is, in one page](#2-what-the-app-is-in-one-page)
3. [Running and building it](#3-running-and-building-it)
4. [The big picture: one data-flow diagram](#4-the-big-picture-one-data-flow-diagram)
5. [The domain model (`src/types`)](#5-the-domain-model-srctypes)
6. [State management: the seven domains](#6-state-management-the-seven-domains)
7. [Persistence & sync: Supabase-primary, offline-capable](#7-persistence--sync-supabase-primary-offline-capable)
8. [The scoring engine (`gradeCalc.ts`)](#8-the-scoring-engine-gradecalcts)
9. [Routing, entry points, and the student pages](#9-routing-entry-points-and-the-student-pages)
10. [Share codes & the URL-safe base64 (regex explained)](#10-share-codes--the-url-safe-base64-regex-explained)
11. [Internationalisation (i18n)](#11-internationalisation-i18n)
12. [The CEFR / language-assessment subsystem](#12-the-cefr--language-assessment-subsystem)
13. [Services layer](#13-services-layer)
14. [The pages, one by one](#14-the-pages-one-by-one)
15. [The utilities catalogue](#15-the-utilities-catalogue)
16. [Components](#16-components)
17. [The backend (Supabase)](#17-the-backend-supabase)
18. [Tooling & configuration choices](#18-tooling--configuration-choices)
19. [A TypeScript idioms glossary (the non-obvious bits)](#19-a-typescript-idioms-glossary-the-non-obvious-bits)
20. [Recipes: how to make common changes](#20-recipes-how-to-make-common-changes)
21. [Glossary of domain terms](#21-glossary-of-domain-terms)

---

## 1. How to read this guide

The single most useful document already in the repo is **`CLAUDE.md`** at the root — it is the
project's own architecture memo. This guide expands on it with the *reasoning* behind the
patterns and points you at exact files and line numbers.

Two conventions you'll see everywhere in the source:

- **Doc comments explain the *why*, never the *what*.** The house rule (in `CLAUDE.md` →
  "Comments") is: *"Write no comments unless the why is non-obvious. Never describe what the
  code does; the identifiers do that."* So when you see a comment, it's usually flagging a
  subtle trade-off, a bug that was fixed, or a performance reason. Read them — they're gold.
- **`file_path:line`** references in this guide are clickable in most editors.

If you only read three sections, read **§4** (the data-flow picture), **§6** (state), and
**§7** (persistence). Everything else hangs off those.

---

## 2. What the app is, in one page

RubricMaker is a **rubric-and-grading web app for teachers**, with a strong secondary focus on
**CEFR language assessment** (the Common European Framework of Reference — the A1–C2 scale for
language proficiency). It is a **single-page React app** that can run two ways:

- **Fully offline** — everything lives in the browser's `localStorage`. No account, no server.
  Reduced capability (no collaboration, no student portal, no multi-device) but fully
  functional for one teacher on one device.
- **Cloud-connected** — with a Supabase backend it gains auth, multi-device sync, a student
  portal, school-wide sharing, a marketplace, email notifications, and more.

The important design principle: **Supabase is the *primary* store when configured; offline is a
*fallback*.** This one sentence drives most of the persistence code (see §7).

Feature domains (each maps to a state "domain", a set of pages, and a folder of components):

| Domain | What it covers |
| --- | --- |
| **Rubric Builder** | Author rubrics: criteria, performance levels, weights, scoring modes |
| **Grading** | Fill in a rubric for a student; comment bank, voice feedback, attachments, scans |
| **Analytics** | Per-class / per-student charts, CEFR proficiency tracking |
| **CEFR / language** | Proficiency levels, speaking sessions, self-assessment, placement tests |
| **Essays** | Rich-text editor, submission codes, peer review, online student portal |
| **Tests** | A quiz engine with 13 question types, proctoring, adaptive placement tests |
| **Flashcards** | Vocabulary spaced repetition (FSRS algorithm) |
| **Export** | PDF, DOCX (incl. mail-merge templates), CSV, report cards |
| **Document analysis** | OCR (Tesseract.js) + DOCX parsing (Mammoth) + grammar/vocab profiling |

Scale of the codebase: **~650 TypeScript/TSX files**, **47 route-level pages**, **84 utility
modules**, **75 database migrations**, **11 edge functions**.

---

## 3. Running and building it

```bash
npm run dev          # Vite dev server → http://localhost:5173
npm run build        # tsc (typecheck) && vite build → dist/
npm run typecheck    # tsc --noEmit — run before commits; also in the pre-push hook
npm run check        # The full gate: typecheck + lint + format:check + unit tests
npm run lint         # ESLint (src only)
npm run format       # Prettier write
npm test             # Vitest single run (NOT watch — use `npx vitest` for watch)
npm run coverage     # Coverage report (thresholds: 65% lines/stmts, 60% fns, 58% branches)

# One test file / one test by name:
npx vitest run src/utils/gradeCalc.test.ts
npx vitest run -t "weighted score"

# End-to-end (Playwright — needs `npm run dev` running separately):
npm run e2e:chromium

# Local Supabase stack (Docker):
npm run db:start   # start; studio at http://localhost:54323
npm run db:reset   # drop + re-apply all migrations
npm run db:status  # print ports/keys
```

Git hooks (via **Husky**, `.husky/`): **pre-commit** runs `lint-staged` (ESLint `--fix` +
Prettier on staged files); **pre-push** runs `npm run typecheck`.

Environment variables (both optional — absence = offline mode):

```bash
VITE_SUPABASE_URL=       # Supabase project URL
VITE_SUPABASE_ANON_KEY=  # public anon key
```

---

## 4. The big picture: one data-flow diagram

Every state change follows the same path. Internalise this and the rest of the code reads
itself:

```
                    ┌─────────────────────────────────────────────┐
   user clicks →    │  a domain action creator (e.g. saveStudent)  │
                    │  src/context/domains/*.tsx                    │
                    └───────────────────┬─────────────────────────┘
                                        │ dispatch({type: 'UPDATE_STUDENT', ...})
                                        ▼
                    ┌─────────────────────────────────────────────┐
                    │  reducer  (src/context/storeCore.ts)         │
                    │  returns a NEW immutable state object        │
                    │  and, IF offline, writes localStorage        │  ← isOffline() gate
                    └───────────────────┬─────────────────────────┘
                                        │ new state committed by useReducer
                        ┌───────────────┴───────────────┐
                        ▼                                ▼
        ┌────────────────────────────┐   ┌──────────────────────────────────────┐
        │ selector store notify()    │   │ delta-sync effect (AppContext.tsx)     │
        │ → components re-render      │   │ diffs prev vs next state, pushes the   │
        │   (only the ones that read  │   │ changed rows to Supabase via           │
        │    the changed slice)       │   │ StorageSync.pushOne / pushMany         │
        └────────────────────────────┘   └──────────────────┬─────────────────────┘
                                                            │ (only while connected)
                                                            ▼
                                          ┌──────────────────────────────────────┐
                                          │ Supabase (Postgres + Auth + Storage)  │
                                          │ realtime change → hydratePartial →     │
                                          │ merge back into state (last-write-wins)│
                                          └──────────────────────────────────────┘
```

The three moving parts:

1. **The reducer** is the single source of truth for how state changes. It is *pure* except for
   one deliberate side effect: when `isOffline()` it also writes the affected collection to
   `localStorage`. When online it does **not** — Supabase is the store, and localStorage is just
   a next-boot cache.
2. **The selector store** decides *who re-renders*. It is a hand-rolled `useSyncExternalStore`
   so that a change to (say) `studentRubrics` only re-renders grading views, not the whole app.
3. **The delta-sync effect** is what turns local mutations into Supabase writes. It runs after
   every commit, compares the previous state to the new one collection-by-collection, and pushes
   only what changed.

Key file map for this flow:

| Concern | File |
| --- | --- |
| Action creators (per domain) | `src/context/domains/{roster,authoring,assessment,essays,flashcards,settings,platform}.tsx` |
| Reducer + action union | `src/context/storeCore.ts` |
| Provider wiring, effects, delta-sync | `src/context/AppContext.tsx` |
| Selector store (`useStoreSelector`) | `src/context/useStore.tsx` |
| localStorage read/write (single write point) | `src/store/storage.ts` |
| Supabase sync engine | `src/services/database/StorageSync.ts` |
| Conflict merge (last-write-wins) | `src/utils/syncMerge.ts` |
| Collection diff (what changed) | `src/utils/syncDiff.ts` |

---

## 5. The domain model (`src/types`)

**Everything hangs off `src/types/index.ts` (~1,680 lines).** The rule from `CLAUDE.md`: *"All
domain types live in `src/types/index.ts`. Do not create ad-hoc inline types for data shapes
already defined there."* If you're ever unsure what a piece of data looks like, this is the file.

### The central entities

```
Class ──< Student            (a class has many students; Student.classId points back)
Rubric ──< RubricCriterion ──< RubricLevel ──< SubItem
StudentRubric  = one student's filled-in grade for one rubric (entries: ScoreEntry[])
GradeScale     = how a percentage maps to a letter/label (ranges with colours)
```

- **`Rubric`** (`types/index.ts:591`) — the template: a list of `RubricCriterion`, a
  `scoringMode`, a `format` (visual/print options), and CEFR metadata (`cefrTargetLevel`,
  `cefrSkill`).
- **`RubricCriterion`** (`:186`) — one row: a `weight` (0–100 for weighted scoring), an ordered
  list of `RubricLevel`s, and optional links to external standards / CEFR "Can-Do" descriptors /
  frameworks (IB, Bloom's, grammar).
- **`RubricLevel`** (`:148`) — one cell: a `[minPoints, maxPoints]` band, a `description`, and an
  optional `subItems` checklist for finer granularity.
- **`ScoreEntry`** (`:682`) — the recorded grade for *one criterion of one student*. Note the
  layered scoring inputs it supports: a whole `overridePoints`, a `singlePointOutcome`
  (exceeds/meets/not-yet), a `selectedPoints` inside the level's range, `checkedSubItems`, and
  per-sub-item `subItemScores`. The scoring engine (§8) resolves these by priority.
- **`StudentRubric`** (`:706`) — the grade record. Contains the `entries`, an optional
  `globalModifier`, an `overallComment`, and a **`rubricSnapshot`** — a frozen copy of the rubric
  *as it was at grading time*, so editing a rubric later never corrupts historical grades.

### Cross-cutting conventions you'll see on almost every entity

- **`updatedAt?: string`** — an ISO timestamp of the last local edit. This is the linchpin of
  conflict resolution: the sync merge is *last-write-wins by `updatedAt`* (§7). Every syncable
  entity carries it, and the reducer stamps it on write.
- **Soft deletes.** Students use `archivedAt`; grades use `deletedAt`. Rows aren't physically
  removed — they're flagged and filtered out in the domain hooks (e.g. `useRosterValue` filters
  `students.filter(s => !s.archivedAt)`). This enables "recently deleted / restore" and, for
  students, a later anonymisation step (`anonymizedAt`).
- **Composite string ids.** Some entities have no single `id` field and are keyed by a composite,
  e.g. `FlashcardAssignment` is keyed `` `${deckId}:${studentId}` `` and `EssayAssignment` by
  `` `${teacherKey}:${studentId}` ``. Wherever an id is needed (diffing, the pending queue) the
  code passes an explicit `getId` function rather than assuming `.id` exists.

### The Dutch schooling model

Because the app targets Dutch language teachers, a few types encode the Dutch system:

- **`SchoolYear`** (`:658`) — `'groep-7' | 'groep-8' | 'jaar-1' … 'jaar-6'` (primary vs.
  *voortgezet onderwijs*).
- **`VoTrack`** (`:655`) — `'vmbo-bb' | 'vmbo-kb' | 'vmbo-tl' | 'havo' | 'vwo'` — the ability
  tracks in Dutch secondary education. Rubric CEFR expectations are set per (year, track).

### CEFR types

`CefrLevel` is the coarse `A1…C2`. There's also a finer **`CefrSubLevel`** (`:16`,
`pre-a1 … c2` with `-minus`/`-plus` steps) used *only* for expectations, never for what a student
actually achieved — the comment on the type explains exactly this distinction. `CefrSkill`
(`:40`) is the five language skills; `QuestionBankSkill` (`:50`) extends it with `'grammar'` for
the question bank (grammar isn't a CEFR skill, but it *is* a bank category).

> **Why one giant types file?** It's a deliberate single source of truth. TypeScript's structural
> typing means any object of the right shape satisfies an interface, so keeping the canonical
> shapes in one place prevents two files from drifting into two subtly different "Student" shapes.

---

## 6. State management: the seven domains

> `CLAUDE.md`: *"Do not introduce Redux, Zustand, or any other state library — the existing
> pattern is intentional."*

All app state lives in one `useReducer` inside `AppProvider` (`src/context/AppContext.tsx:50`).
So why isn't the whole app re-rendering on every keystroke? Because the single state object is
exposed through **seven domain contexts** plus a **selector store**, so a component only
subscribes to the slice it actually reads.

### The seven domain hooks

| Hook | Slice it exposes |
| --- | --- |
| `useRoster()` | students, classes, student rubrics, attachments |
| `useAuthoring()` | rubrics, grade scales, comment bank, question bank, templates |
| `useAssessment()` | tests, student tests, peer reviews, self-assessments, speaking sessions, analysis |
| `useEssays()` | essay assignments/submissions/templates, messages, news flashes |
| `useFlashcards()` | flashcard decks/assignments/reviews, mastery targets |
| `useSettings()` | settings, `updateSettings`, `getActiveGradeScale` |
| `usePlatform()` | auth, landing/session state, DB connection, schools, backup |

`useRoster()` is itself split one level deeper into `useStudents()`, `useClasses()`, and
`useGrading()` (see `src/context/domains/roster.tsx`) so that saving a grade re-renders only
grading consumers, not everything that merely reads the student list.

**How to consume state (the rule):** call the hook for the data you read. A component that needs
several domains calls several hooks:

```tsx
const { students } = useStudents();
const { rubrics }  = useAuthoring();
```

There is a lint rule, `local/max-domains-in-component` (`eslint/rules/`), that *warns* when a
component subscribes to more than three domains — that's a signal you should be using the
selector store instead.

### The selector store — `useStoreSelector`

`src/context/useStore.tsx` implements a tiny external store on top of React's
`useSyncExternalStore`. `useStoreSelector(state => …)` lets a component subscribe to *exactly the
derived slice it renders* and re-render only when that slice changes.

The clever bit is the caching in `useStoreSelector` (`useStore.tsx:69`):

```ts
const value = cached && isShallowEqual(cached.value, next) ? cached.value : next;
```

The selected value is memoised across renders and **shallow-compared** against the previous
selection. If your selector returns a new array/object that is shallow-equal to last time, the
*old reference* is kept — so `useSyncExternalStore` sees "no change" and skips the re-render.
The cache is keyed on selector identity, which means a selector that closes over props naturally
changes identity and never serves a stale value.

`isShallowEqual` (`useStore.tsx:41`) has one subtlety worth reading: it checks
`Object.prototype.hasOwnProperty.call(b, key)` so that `{ x: undefined }` and `{ y: undefined }`
(same key count, both reads yield `undefined`) are *not* considered equal.

### The `useStoreActions` split

Actions (the `saveStudent`, `addRubric`, … functions) are separated from data into their own
context (`StoreActionsProvider`, `useStore.tsx:109`). Because action creators read fresh state
lazily via `getState()` at call time, they never need to close over a state slice — so the
actions object has **stable identity** and never changes between dispatches. A component that
only *triggers* actions (a toolbar button, say) subscribes to no data and never re-renders on
data changes.

### The "latest ref" pattern and its deliberate ESLint escape hatches

In `AppContext.tsx:57` you'll find:

```ts
const currentStateRef = useRef(state);
// eslint-disable-next-line react-hooks/refs
currentStateRef.current = state;   // written DURING render, not in an effect
```

This is the documented ["latest ref"](https://react.dev/reference/react/useRef) pattern. Writing
the ref during render (rather than in a `useEffect`) means action creators that read
`currentStateRef.current` always see the state of the render they were called from — even when
invoked from a descendant's `useLayoutEffect`, which runs *before* passive effects. An effect-based
sync would lag one commit behind. The `eslint-disable` is a *conscious* deviation from the
`react-hooks/refs` rule, and the comment right above it says exactly why. When you see an
`eslint-disable` in this codebase, there's almost always a paragraph explaining it — don't
"clean it up" without reading that paragraph.

### Where the domain hooks are generated

Each `src/context/domains/*.tsx` file exports three things:

1. `createXActions(ctx)` — the pure action creators (used by `useStoreActions`).
2. `useXValue(state, actions)` — memoises the domain's value object on its own slices.
3. `XProvider` + `useX()` — the context wiring.

`roster.tsx` is the reference example (§ it's the one this guide read in full). It also shows the
audit-logging pattern: sensitive actions call `logAuditEvent('grade', 'grade_save', …)` before
dispatching (`roster.tsx:145`).

---

## 7. Persistence & sync: Supabase-primary, offline-capable

This is the subtlest part of the app. Read the "Storage rule" section of `CLAUDE.md` alongside
this.

### The mental model

- **Offline (no Supabase, or disconnected):** `localStorage` is the one and only permanent
  store.
- **Connected:** Supabase is the permanent store. `localStorage` becomes a *temporary buffer*:
  a next-boot readiness cache plus a per-record retry queue for failed pushes. It is **not** a
  live mirror of every edit.

The switch between these is the single function **`isOffline()`** (`storeCore.ts:194`):

```ts
export function isOffline(): boolean {
    return !navigator.onLine || !(getDb()?.storageSync.isConnected() ?? false);
}
```

### The reducer's conditional write

Every reducer case that mutates a collection follows the same shape (`storeCore.ts`, e.g. the
`ADD_STUDENT` case at `:235`):

```ts
case 'ADD_STUDENT': {
    const next = [...state.students, { ...action.payload, updatedAt: new Date().toISOString() }];
    if (isOffline()) saveStudents(next);   // ← only writes localStorage when offline
    return { ...state, students: next };
}
```

> **Do not add unconditional `localStorage` writes.** `CLAUDE.md` is explicit: gate every full
> array write through `isOffline()`. A connected session must not keep a redundant local copy —
> it wastes quota and can mask sync bugs.

`src/store/storage.ts` is the **single write point** for `localStorage`. The rule (`CLAUDE.md` →
"Data flow"): *"Never write to `localStorage` directly from components or hooks."* It exposes
`saveStudents`, `saveRubrics`, etc. — thin wrappers around a keyed JSON write — plus the
pending-queue and backup helpers.

### The delta-sync effect

When connected, how do local mutations reach Supabase? Via the effect at `AppContext.tsx:410`.
It keeps a `prevStateRef` and, after every commit, diffs each collection old-vs-new and pushes
only the changes:

```ts
diff(prev.rubrics, state.rubrics, 'rubric', (r) => r.id);
diff(prev.students, state.students, 'student', (s) => s.id);
// …one line per collection…
```

The local `diff` helper (`:422`) uses `diffCollection` (`syncDiff.ts`) to compute
`{ upserted, deletedIds }`, then:

- a **single** change goes out as `pushOne`;
- **multiple** changes collapse into a `pushMany` (a bulk upsert/delete — e.g. assigning a
  rubric to a whole class in one action).

Note the comment at `:422`: the `getId` is passed explicitly (not derived from the payload)
because composite-keyed entities like `essayBatchAssignment` have no `.id` on the payload.

### Failed pushes → the pending queue

If a push fails while otherwise connected (an RLS error, a transient network blip), it falls back
to the **pending-sync queue** (`rm_pending_sync` in `localStorage`, managed in `storage.ts`:
`loadPendingQueue`, `addToPendingQueue`, `removePendingWrites`). That queued copy is then the only
local record of the edit until the retry succeeds. `StorageSync.flushPendingQueue()`
(`StorageSync.ts:229`) drains it on reconnect.

### Hydrate, realtime, and the merge

- **On connect / login:** `hydrate()` pulls everything from Supabase, and the result is merged
  with local state via `mergeStoreData` (`AppContext.tsx:222`), then written back to
  `localStorage` as the offline-readiness cache.
- **On network reconnect:** the same hydrate/merge runs (`AppContext.tsx:325`).
- **On a realtime row change from another device:** `onRealtimeChange` fires with the affected
  table names, and the code does a **targeted partial hydrate** (`hydratePartial`) of just those
  collections instead of re-pulling all ~30 tables (`AppContext.tsx:336`). Unknown tables fall
  back to a full hydrate so nothing is ever dropped.

### The merge: last-write-wins, with in-flight protection

`src/utils/syncMerge.ts` is where two versions of a record are reconciled. `mergeCollection`
(`:16`) walks the remote rows and, for each:

1. If the row is in the caller's `deletedIds` (a pending local delete) → skip it.
2. If it doesn't exist locally → take the remote row.
3. If it has a **pending local write** (`pendingIds`) → keep the *local* row (don't let a stale
   hydrate clobber an edit that hasn't finished syncing yet).
4. Otherwise → compare `updatedAt` timestamps and keep the newer (**last-write-wins**).

`pendingIdsFor` (`:59`) reduces the pending queue to "the last action per id" so that a
*delete followed by a re-add* correctly counts as an upsert, not a delete.

> **Why last-write-wins and not something cleverer (CRDTs, operational transforms)?** The data is
> per-teacher and rarely edited from two devices at the same instant; LWW by `updatedAt` is
> simple, predictable, and the `pendingIds` guard covers the one race that actually matters
> (your own in-flight edit). `CLAUDE.md` tells you not to hand-roll merge logic anywhere else.

### Why the DB module is lazy-loaded

`@supabase/supabase-js` plus the sync adapters are ~450 KB. A landing-page visitor with no
Supabase config should never download that. So the entire `src/services/database/` module is
imported *dynamically* through `loadDb()` / `getDb()` (`src/services/database/lazyDb.ts`):

```ts
export function loadDb(): Promise<DbModule> { /* import('./index') once, cache the promise */ }
export function getDb(): DbModule | null { /* synchronous best-effort — null until loaded */ }
```

`loadDb()` returns a cached promise; on failure it clears the cache so a later call can retry
(`lazyDb.ts:16`). `getDb()` is the synchronous accessor used by `isOffline()` and the delta-sync
effect — it returns `null` until the module has finished loading, and callers treat `null` as
"offline". Route-level pages that always need the DB can `import 'services/database'` directly
(they're already code-split by the router); anything rendered eagerly should prefer `loadDb()`.

---

## 8. The scoring engine (`gradeCalc.ts`)

`src/utils/gradeCalc.ts` is pure business logic (no React, no I/O) and one of the most-tested
files in the repo. Understanding it means understanding how a rubric turns into a grade.

### Per-criterion points — `calcEntryPoints` (`:24`)

Resolves a single `ScoreEntry` to a point value by **priority**:

1. `overridePoints` — a full manual override, wins over everything.
2. `singlePointOutcome` — for single-point rubrics: `meets`/`exceeds` = full points, `not-yet` = 0.
3. Otherwise the selected `levelId`, combined with sub-items and the in-range `selectedPoints`.

The sub-item logic (`:41`) has an important subtlety flagged in its comment: it only counts
`subItemScores` for the *selected* level's sub-items. Iterating all levels would let stale scores
from a previously-selected level inflate the total (which used to happen when comparative grading
changed a student's level).

### Aggregation

- `calcRawScore` / `calcMaxRawScore` — raw sum and the maximum possible.
- `calcWeightedScore` (`:100`) — the default: each criterion contributes
  `(points / maxPoints) × weight`, normalised by total weight. Falls back to a flat percentage
  when all weights are zero.
- `calcGradeSummary` (`:183`) — the one function most UI calls. It picks weighted-percentage vs.
  total-points mode based on the rubric, applies the `globalModifier`, and returns a
  `GradeSummary` with the raw score, percentage, letter grade, colour, and graded/total counts.

### Letter grades, and a nice performance touch

`calcLetterGrade` (`:161`) maps a percentage to a scale label. Read the comment at `:141`: ranges
are matched by **`percentage >= range.min` only** (sorted descending, first match wins) rather
than by `[min, max]` bounds — this stops a float like `89.7%` from falling into the gap between
integer-bounded ranges (`B: 80–89`, `A: 90–100`).

The sort is cached in a **`WeakMap<GradeRange[], GradeRange[]>`** (`:147`):

```ts
const sortedRangesCache = new WeakMap<GradeRange[], GradeRange[]>();
```

Class-level grading calls `matchRange` 2–3× per student, so re-sorting the same little array each
time is wasteful. Keying the cache on the `ranges` *array reference* means: while the scale is
unedited the sorted copy is reused; edit the scale (new array) and you automatically get a fresh
cache entry, with no manual invalidation. A `WeakMap` is used so the cache doesn't keep old scale
arrays alive after they're gone.

`calcClassStats` (`:231`) builds the average/median/highest/lowest and the distribution histogram,
bucketing each student with the exact same `matchRange` boundary logic so the histogram always
agrees with the individual letter grades.

---

## 9. Routing, entry points, and the student pages

### Two entry files

- **`src/main.tsx`** is the true entry. It sets up the router, PWA update prompt, web-vitals
  logging, and — importantly — splits the app into **two worlds**.
- **`src/App.tsx`** is the *authenticated teacher app* (sidebar + the big `<Routes>` table).

### Why a hash router?

`createHashRouter` (`main.tsx:138`) uses URL hashes (`/#/rubrics/…`). The reason is in
`vite.config.ts`: `base: './'`, so the built app works from **any sub-path on any static host**
(GitHub Pages, SharePoint, a Docker path) with no server-side routing config. Hash routing needs
no server rewrites.

### The two worlds

```
main.tsx router:
  /feedback/:code   → StudentFeedbackPage   ┐  "student pages": rendered OUTSIDE AppProvider.
  /preview/:code    → RubricPreviewPage      │  They take all their data from the URL-encoded
  /essay/:code      → StudentEssayPage       │  :code (see §10) — no app state, no account.
  /test/:code       → StudentTestPage        ┘
  /*                → <AppProvider><App/></AppProvider>   ← the whole authenticated app
```

Student pages are deliberately outside `AppProvider` so they carry none of the teacher's data and
load almost nothing. Because they're outside the provider, the theme-applying effect never runs
for them — so `main.tsx:105` reads the saved theme straight from `localStorage` and sets
`data-theme` by hand, otherwise they'd be stuck on the dark default.

### The single-tab lock

`main.tsx:240` (`boot()`) uses the **Web Locks API** (`navigator.locks.request(TAB_LOCK, …)`) to
allow only *one* tab of the authenticated app at a time. Two tabs both writing to the same
`localStorage`/sync state would corrupt each other, so the second tab shows a friendly "already
open" screen (`renderBlocked`). Student routes and browsers without the Locks API skip the lock.

### The role gate inside `App.tsx`

`App.tsx` decides what a *logged-in* person sees:

1. `isCheckingSession` → a spinner.
2. `showLanding` → the public `LandingPage`.
3. `settings.needsOnboarding` → the `OnboardingPage`.
4. A **student** (role `'student'`, or an email that matches a `Student` record) → the
   student-portal routes only (`/portal/:studentId`, flashcard study, privacy).
5. Otherwise → the full teacher dashboard with the sidebar and the big route table
   (`App.tsx:211`). The `/admin` route is itself guarded: non-admins are redirected to `/`.

`GradeStudentRoute` (`App.tsx:64`) wraps `GradeStudent` with `key={studentId}` so navigating
between students **remounts** the component and its `useState` re-initialises cleanly — a common
React idiom for "reset all local state when this id changes".

---

## 10. Share codes & the URL-safe base64 (regex explained)

Student pages get their data entirely from the URL. That data is a JSON payload encoded into a
share **code**. The encoding lives in `src/utils/urlSafeBase64.ts` and the payload
builders in `src/utils/shareCode.ts`.

### The regex, line by line

```ts
export function encodeUrlSafeBase64(input: string): string {
    const base64 = btoa(encodeURIComponent(input));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

- `encodeURIComponent(input)` first — because `btoa` only handles Latin-1; percent-encoding makes
  arbitrary Unicode (student names, accented text) safe to base64.
- Standard base64 uses the characters `+`, `/`, and `=` (padding). Two of those are hostile to
  URLs, so:
  - `.replace(/\+/g, '-')` — every `+` → `-`. The `g` flag means *all* occurrences (a regex is
    used precisely because `String.replace` with a plain string replaces only the first match).
    The `+` is escaped as `\+` because `+` is a regex quantifier.
  - `.replace(/\//g, '_')` — every `/` → `_`. This is the important one: an unescaped `/` inside
    the code would look like a path separator and break routes like `/preview/:code`.
  - `.replace(/=+$/, '')` — strip trailing padding. `=+` means "one or more `=`", `$` anchors it
    to the end of the string, so this removes the run of `=` padding characters at the tail.

Decoding reverses it (`decodeUrlSafeBase64`, `:12`): map `-`→`+`, `_`→`/`, then re-add `=`
padding until the length is a multiple of 4 (`while (base64.length % 4 !== 0) base64 += '='`),
then `atob` + `decodeURIComponent`. It also accepts plain base64, so old links keep working.

This scheme is **RFC 4648 §5** ("base64url"), noted in the file's doc comment.

### The payload builders (`shareCode.ts`)

`encodeEssayAssignment`, `encodeTestAssignment`, `encodeFeedbackCode`, etc. each `JSON.stringify`
a payload and pass it through `encodeUrlSafeBase64`. Two patterns worth noting:

- **Secrets are stripped before encoding.** `encodeEssayAssignment` (`:15`) destructures out
  `ownerUserId` so it never appears in a URL.
- **When Supabase is configured, the code is just the `teacherKey`** (`:21`), not the whole
  payload — the student's browser connects to Supabase and fetches the real content server-side
  (via the `get-essay-assignment` / `get-test-assignment` edge functions), which keeps assignment
  content off the URL and lets the teacher revoke it.
- Every `decode*` validates required fields and returns `null` on any failure (the whole thing is
  wrapped in `try/catch`), so a malformed code degrades to "not found" instead of throwing.

---

## 11. Internationalisation (i18n)

`src/i18n.ts` + `src/locales/{en,nl,fr,de,es}.json`. The rule (`CLAUDE.md` → "i18n"): **never
hardcode English in JSX**; use `useTranslation()` and a key from `en.json`, and add new keys to
*all five* locale files.

The interesting engineering is **lazy locale loading**:

- Each non-English locale JSON is ~200 KB. Loading all five up front meant every visitor
  downloaded ~1 MB of translations regardless of language.
- So only **`en`** is loaded eagerly (as its own chunk, `i18n.ts:21`), and the app gates its first
  render on `i18nReady` (`main.tsx:259`) so there's never a flash of untranslated keys.
- The other four are `import()`-ed on demand (`i18n.ts:30`) keyed off whatever language the
  detector picks or the user later chooses.
- A subtlety at `:47`: `addResourceBundle` doesn't itself trigger a re-render, so after a locale
  finishes loading the code re-emits `'languageChanged'` to make `useTranslation` consumers
  refresh.

The Vite/PWA config cooperates: the service worker **excludes** the non-EN locale chunks from
precache (`vite.config.ts:52`) and instead caches whichever ones are actually requested via a
`CacheFirst` runtime rule (`:63`).

A guard test (`src/locales/__tests__/`) asserts every non-English locale has the same key set as
`en.json` (at least for the `cambridge` namespace), so a key added only to `en.json` fails CI.

There's also RTL support: `isRtlLanguage(settings.language)` sets `document.documentElement.dir`
(`AppContext.tsx:162`).

---

## 12. The CEFR / language-assessment subsystem

This is the app's deepest domain and touches many utils. The through-line: a teacher grades work
against CEFR levels, and the app aggregates that evidence into a per-student, per-skill
proficiency picture.

Key modules (all pure functions in `src/utils/`):

- **`cefrStudentAggregator.ts`** — the heart. `getCefrStudentOverview()` (`:270`) combines every
  source of CEFR evidence (rubric grades, self-assessments, tests, speaking) into a
  `CefrStudentOverview` with per-skill levels and a placement estimate. `highestLevelForSkill`,
  `modeSkillLevel`, and `overallLevel` are the building blocks.
- **`cefrOrdinal.ts`** — turns the A1…C2 / sub-level scales into comparable ordinals (so "is B1+
  above B1?" is arithmetic).
- **`cefrVocabularyProfiler.ts`** + **`academicWordList.ts`** — profile a text's vocabulary by
  CEFR level and academic-word coverage (the Coxhead AWL / NAWL lists).
- **`grammarChecker.ts`** — detects grammar structures (and optionally calls the LanguageTool
  public API, which has a 20 KB/request limit noted at the top).
- **Placement tests** — a whole sub-family:
  - `placementRouting.ts` — the branching "MST" engine (score on a section routes to the next).
  - `placementStaircase.ts` — the adaptive "staircase" engine (Elo-rated questions, step up after
    two correct, converge after two reversals). Constants at the top (`STAIRCASE_START_LEVEL`,
    `ELO_K_FACTOR`, `LEVEL_TO_ELO`) make the algorithm legible.
  - `placementGenerator.ts` — the live "generator" engine that pulls questions from the bank at
    runtime, server-authoritative via the `next-placement-question` edge function.
  - `placementResult.ts` — turns a completed run into a deterministic, teacher-explainable CEFR
    estimate.
- **`masteryProfileAggregator.ts`** / **`learningPathAggregator.ts`** — merge test accuracy,
  flashcard FSRS state, and rubric grammar evidence into a mastery profile and **rule-based**
  (explicitly *no AI*, per `CLAUDE.md`) learning-path recommendations.

> **"No AI generation" is a hard rule.** `CLAUDE.md`: no auto-grading, auto-feedback, or
> prompt-based generation. All these "recommendations" are deterministic aggregations — you can
> trace any suggestion back to concrete evidence. `learningPathAggregator.ts` even flags this in
> its top comment.

---

## 13. Services layer

`src/services/` holds everything that talks to the outside world.

### `services/database/` — the Supabase integration

| File | Role |
| --- | --- |
| `index.ts` | Barrel: exports `storageSync`, config helpers, types |
| `lazyDb.ts` | The dynamic-import gate (`loadDb`/`getDb`) — see §7 |
| `StorageSync.ts` | The sync engine: auth, hydrate, push, pending queue, realtime |
| `SupabaseAdapter.ts` | Thin wrapper over `@supabase/supabase-js` (the actual table calls) |
| `EssayAdapter.ts`, `TestAdapter.ts` | Feature-specific query helpers |
| `AttachmentSync.ts`, `RecordingSync.ts`, `FeedbackAudioSync.ts`, `ScanSync.ts` | Upload binary blobs to Storage buckets, keeping only paths on the records |
| `AuditLogger.ts` | Fire-and-forget audit-trail writes (`logAuditEvent`) |
| `signedUrlCache.ts` | Caches short-lived signed URLs for private bucket files |
| `supabaseConfig.ts` | Persists the `{url, anonKey}` connection config |
| `types.ts` | `DatabaseConfig`, `SyncStatus`, `SyncResult`, `DbUser` |

`StorageSync` is a singleton service class. Its public surface (see `StorageSync.ts:154`+):
`isConnected()`, `configure()`, `initAuth()`, `hasSession()`, `hydrate()`, `hydratePartial()`,
`pushOne()`, `pushMany()`, `flushPendingQueue()`, the `on*` subscription methods
(`onAuthChange`, `onNetworkReconnect`, `onRealtimeChange`), plus dozens of feature-specific
fetch/save methods (schools, essays, tests, messages, flashcards, news flashes…). The rule from
`supabase/CLAUDE.md`: *"Do not add Supabase calls directly to components or pages — route them
through the service adapters."*

The `didWipeLocalData()` / owner-switch logic (`StorageSync.ts:366`) handles a real hazard: if a
different user logs in on the same browser, the previous user's local data must be wiped before
hydrating, or the merge would mix two people's data.

### Other services

- **`services/mediaStore.ts`** — stores speaking-session recording *blobs* in **IndexedDB**
  (never inline on the record, which keeps the synced JSON small). `pruneOrphanedBlobs` sweeps
  blobs whose session was deleted elsewhere (`storeCore.ts:1146` calls it after a sync).
- **`services/scanStore.ts`** — the same idea for scanned-handwriting images.
- **`services/logging/clientLogger.ts`** — client diagnostics/metrics, only active when
  `VITE_STRESS_TEST_LOGGING=true` (off in tests and normal prod).
- **`services/standardsApi.ts`** — the Common Standards Project API (US CCSS/NGSS standards).
- **`services/freeDictionaryApi.ts`** — dictionary lookups for vocabulary definitions.

---

## 14. The pages, one by one

All 47 pages live in `src/pages/` and are **lazy-loaded** by the router (`App.tsx:21`+). A page is
a route-level component: it reads state via domain hooks / `useStoreSelector`, composes
components, and owns the layout for one screen.

### Teacher app — authoring & grading

| Page | Route | What it does |
| --- | --- | --- |
| `Dashboard` | `/` | Landing dashboard once logged in: recent activity, quick links |
| `RubricList` | `/rubrics` | List/search/sort rubrics; create, duplicate, share, reorder |
| `RubricBuilder` | `/rubrics/:id` | The big editor (~2,900 lines): criteria, levels, weights, standards/CEFR links, format, version history |
| `GradeStudent` | `/rubrics/:rubricId/grade/:studentId` | Fill a rubric for one student (~2,200 lines): grid/row layouts, comment bank, voice feedback, scan capture, attachments, PDF export |
| `ComparativeGrading` | `/grade-comparative/:classId/:rubricId` | Grade by pairwise comparison against an anchor student |
| `CommentBankPage` | `/comments` | Manage reusable comments |
| `QuestionBankPage` | `/question-bank` | Manage reusable test questions/sections |

### Students, classes, analytics

| Page | Route | What it does |
| --- | --- | --- |
| `StudentsPage` | `/students` | Classes + rosters; CSV import, transfers, class colours/order |
| `StudentProfilePage` | `/students/:id` | One student's full history and report-card export |
| `StudentCefrOverviewPage` | `/students/:id/cefr-overview` | Per-skill CEFR picture for one student |
| `StudentLearningPathPage` | `/students/:id/learning-path` | Rule-based recommendations & intervention flags |
| `CefrOverviewPage` | `/cefr-overview` | Class-wide CEFR grid |
| `StatisticsPage` | `/statistics` | Charts: distributions, per-criterion, custom preset views |
| `VocabularyDashboardPage` | `/vocabulary` | Vocabulary profiling across a class's analysed texts |
| `ActivityDashboardPage` | `/activity-dashboard` | Who's submitted/graded across rubrics, tests, essays |

### Assessment — tests, essays, speaking, flashcards

| Page | Route | What it does |
| --- | --- | --- |
| `TestListPage` / `TestBuilderPage` | `/tests`, `/tests/:id` | Author quizzes/placement tests |
| `TestResultsPage` | `/tests/:testId/results/:studentTestId` | Review & grade one attempt |
| `LiveMonitorPage` | `/tests/:id/monitor`, `/essays/:id/monitor` | Real-time proctoring feed |
| `EssayListPage` / `EssayBuilderPage` | `/essays`, `/essays/:teacherKey` | Author essay assignments, roster, import submissions |
| `PeerReviewView` / `PeerReviewAnalyticsPage` | `/rubrics/:rubricId/peer-review/:studentId`, `/peer-analytics/:rubricId` | Peer-review grading and its analytics |
| `SelfAssessPage` | `/rubrics/:rubricId/self-assess/:studentId` | CEFR self-assessment capture |
| `SpeakingSession` | `/speaking/:rubricId/:studentId` | Timed oral assessment with recording |
| `FlashcardsPage` / `FlashcardDeckPage` | `/flashcards`, `/flashcards/:id` | Manage decks; import cards |
| `NewsFlashesPage` | `/news-flashes` | Curated links/resources for students |

### Data, export, admin, misc

| Page | Route | What it does |
| --- | --- | --- |
| `ExportPage` | `/export` | Bulk export: PDF/DOCX/CSV, report cards, gradebook presets |
| `AttachmentsPage` | `/attachments` | Manage uploaded files |
| `SettingsPage` | `/settings` | All settings: theme, accent, fonts, language, scales, sync, roles |
| `AdminPage` | `/admin` (admins only) | User/role management, school admin, audit view |
| `ModerationQueuePage` | `/moderation` | Co-grading dispute queue |
| `NotificationsPage` / `MessagesPage` | `/notifications`, `/messages` | Notification centre; student↔teacher messaging |
| `MarketplacePage` | `/marketplace` | School-wide shared rubrics/tests/decks |
| `DocsPage` | `/docs` | In-app user documentation (must be kept in sync — see §20) |
| `OnboardingPage` | (gated) | First-run school setup |
| `LandingPage` | (gated) | Public marketing/entry page |
| `PrivacyPage`, `NotFoundPage` | `/privacy`, `*` | Static privacy page; 404 |

### Student-portal & public pages (outside `AppProvider`)

| Page | Route | Data source |
| --- | --- | --- |
| `StudentPortalPage` | `/portal/:studentId` | Logged-in student's to-do list, grades, messages |
| `StudentFlashcardStudyPage` | `/portal/:studentId/flashcards/:deckId` | FSRS study session |
| `StudentFeedbackPage` | `/feedback/:code` | Read a shared grade (URL payload) |
| `RubricPreviewPage` | `/preview/:code` | Read-only rubric preview (URL payload) |
| `StudentEssayPage` | `/essay/:code` | Write & submit an essay (URL or Supabase) |
| `StudentTestPage` | `/test/:code` | Take a test (URL or Supabase) |

### Anatomy of a page (using `GradeStudent` as the example)

`GradeStudent.tsx` is a good template for how a complex page is built:

- It reads params with `useParams()` and pulls state via `useStoreSelector` +
  `useStoreActions` + `usePlatform()` (`GradeStudent.tsx:65`+) — note it prefers the *selector*
  store over whole-domain hooks because it touches many slices.
- It composes small, domain-grouped components: `GradingGrid`, `CommentBankModal`,
  `AttachmentViewer`, `ScanCaptureModal`, `FeedbackAudioPlayer`, etc.
- It leans on pure utils for logic: `calcGradeSummary` (scoring), `exportSinglePdf` (export),
  `getCriterionInterventionFlags` (learning-path).
- Cross-cutting hooks provide device features: `useVoiceGrading`, `useMediaRecorder`,
  `useDbStatus`.

That layering — **page = state + composed components + pure utils + device hooks** — is the shape
of essentially every page in the app.

---

## 15. The utilities catalogue

`src/utils/` (84 modules) is where the *pure logic* lives — no React, mostly no I/O, heavily unit
tested. Grouped by area:

### Grading & scoring
- `gradeCalc.ts` — scoring engine (§8).
- `testCalc.ts` — auto-scoring for the 13 test question types.
- `peerReviewAggregator.ts`, `classCriterionAggregator.ts`, `cohortAggregator.ts`,
  `classComparisonAggregator.ts` — class/criterion roll-ups for analytics.
- `coGradingModerationQueue.ts` — the co-grading dispute queue shape (shared with the portal).

### CEFR & language
- `cefrStudentAggregator.ts`, `cefrOrdinal.ts`, `cefrVocabularyProfiler.ts`,
  `academicWordList.ts`, `vocabProfileAggregator.ts`, `textLevelVerdict.ts` — see §12.
- `grammarChecker.ts`, `grammarQualification.ts` — grammar detection & CEFR qualification.
- `placement*.ts` (routing, staircase, generator, result), `eloProgressAggregator.ts` — placement
  tests.
- `masteryProfileAggregator.ts`, `learningPathAggregator.ts`, `learningGoalsAggregator.ts`,
  `frameworkAggregator.ts`, `standardsCoverageAggregator.ts` — cross-domain mastery & coverage.
- `reportCardAggregator.ts` — assembles the report-card data model.

### Sync & storage
- `syncMerge.ts`, `syncDiff.ts` — the merge & diff (§7).
- `displayOrder.ts` — computes manual sort positions for reorderable lists.

### Import / export
- `docxExport.ts`, `docxTemplateExport.ts`, `docxStyleTemplate.ts` — DOCX generation incl.
  mail-merge templates.
- `pdfExport.ts`, `essayExport.ts`, `periodReportExport.ts`, `icsExport.ts` — other exports.
- `exportDataPrep.ts`, `gradebookExportPresets.ts`, `testExportPresets.ts` — export shaping/presets.
- `csvImportMatch.ts`, `rubricImport.ts`, `flashcardImport.ts`, `questionBankImport.ts`,
  `scanImport.ts` — imports, mostly with fuzzy matching.

### Text / documents / OCR
- `textExtraction.ts` — Tesseract OCR + Mammoth DOCX parsing (the entry point for document
  analysis).
- `preprocessScan.ts`, `documentCrop.ts`, `ocrConfig.ts`, `ocrLanguage.ts`, `ocrReview.ts`,
  `scanRecord.ts`, `scanRetention.ts`, `scanSettings.ts` — the scan-and-OCR pipeline (Phase 33).
- `vocabularyAnalyser.ts` — detects a rubric's vocabulary items in extracted text.

### Tests / proctoring
- `clozeParse.ts`, `testQuestionClone.ts`, `testSummaryAggregator.ts`, `seededShuffle.ts`,
  `audioResponseCode.ts`, `sebConfig.ts` (Safe Exam Browser), `proctorAggregator.ts`.

### Flashcards
- `flashcardScheduler.ts` — a thin wrapper over `ts-fsrs` (the FSRS spaced-repetition algorithm);
  constants like `NEW_CARDS_PER_SESSION` and `MASTERED_STABILITY_DAYS` are here.
- `flashcardInsights.ts` — study analytics.

### Encoding / misc / infra
- `shareCode.ts`, `urlSafeBase64.ts` — student link codes (§10).
- `nanoid.ts` — id generator; `pinHash.ts`, `studentPassword.ts` — PBKDF2 hashing & password gen.
- `globalSearch.ts` — token-aware app-wide search (`type:` / `class:` / `year:` / `track:`
  filters); `portalSearch.ts` — the student portal's search.
- `accentScale.ts` — builds a 10-step tonal colour scale from one accent hex.
- `academicYear.ts`, `dateInput.ts`, `clamp.ts`, `rtlLanguages.ts`, `contrastCheck.ts`,
  `messageThreads.ts`, `onlineEssaySubmissions.ts`, `seedDemoData.ts`, `statsChartPresets.ts`,
  `activityDashboardAggregator.ts` — small focused helpers.

> Tip: the README keeps a "Key utility modules" table that's meant to stay current. When you add a
> util, `CLAUDE.md` asks you to update that table (and the in-app docs / landing page for
> user-facing features).

---

## 16. Components

`src/components/` groups reusable UI by domain (folders): `Rubric`, `Grading`, `Tests`, `Essay`,
`Flashcards`, `CEFR`, `Standards`, `Statistics`, `Students`, `Vocabulary`, `Monitor`,
`Recordings`, `Comments`, `Attachments`, `Editor`, `Search`, `Modals`, `Layout`, `auth`, and a
generic `ui` folder.

Conventions:

- **Styling is inline `style={{}}` using CSS custom properties.** There is **no CSS-in-JS
  library** and you should not add one (`CLAUDE.md` → "Styling"). Global tokens like `--accent`,
  `--text`, `--bg-elevated`, `--bg-panel` are defined in `src/index.css` and re-defined for dark
  mode. Theme is a class/attribute on `<html>` (`data-theme`), set by the effects in
  `AppContext.tsx:107`. Custom accent, fonts, and dyslexia-friendly spacing are all applied by
  setting CSS variables on `document.documentElement` (see `AppContext.tsx:111`–`175`).
- **`ui/`** holds the primitives: `Modal`, `ConfirmDialog`, `SegmentedToggle`, `ErrorBoundary`,
  `RouteSkeleton`, `PageViewLogger`, etc. `ErrorBoundary` wraps each route so one page crashing
  doesn't take down the shell (`App.tsx:209`).
- **`Editor/`** wraps **TipTap 3** (ProseMirror) for all rich text (essays, news-flash bodies,
  test passages). These are excluded from unit-coverage because they're canvas/DOM heavy.
- **`Layout/`** — `Sidebar`, `Topbar`, `NotificationBell`, the mobile menu.

The same domain-hook discipline applies to components: subscribe to the slice you render, and if
you find yourself reaching for 4+ domains, switch to `useStoreSelector`.

---

## 17. The backend (Supabase)

Everything backend lives under `supabase/`, and `supabase/CLAUDE.md` is its dedicated guide —
**read it before touching anything here.**

### Migrations (`supabase/migrations/`, 75 files)

- Named `NNN_description.sql`, numbered sequentially (next = highest + 1). A few CLI-generated
  ones use a timestamp prefix.
- **Never edit an applied migration** — always add a new one. Include `IF NOT EXISTS` guards for
  idempotency. Verify with `npm run db:reset` (applies everything from scratch).

### Row-level security (RLS)

- **Every table has RLS enabled.** The default pattern is ownership: `auth.uid() = user_id`.
- When you add a table: enable RLS, then add SELECT/INSERT/UPDATE/DELETE ownership policies. Never
  rely on app-level checks alone.
- A cautionary tale in the guide: avoid policies that reference the same table in a subquery — that
  caused an infinite-recursion bug fixed in `013_fix_rls_recursion.sql`.

### Storage buckets

`attachments`, `export-templates`, `essays`, `recordings`, `feedback-audio`, `scans`, `backups`.
Binary blobs go to buckets; records keep only the **path** (this is why `ScoreEntry` has
`audioStoragePath` and `SessionRecording`/`Scan` keep bytes out of the row). Access is controlled
by storage policies matching `auth.uid()` to the uploader; students read via long-TTL signed URLs
minted by the teacher, not anonymous bucket access.

### Edge functions (`supabase/functions/`, Deno/TypeScript)

The security-critical ones enforce rules a client could bypass:

- `submit-essay` / `submit-test` — server-side word-count, expiry, and duplicate-submission
  checks; `submit-test` also validates a placement run and self-calibrates question Elo ratings
  via an atomic RPC (so concurrent submissions can't clobber each other's rating changes).
- `get-essay-assignment` / `get-test-assignment` — the *only* way an anonymous/portal student can
  read assignment content (direct REST is blocked).
- `next-placement-question` — the server-authoritative adaptive question picker.
- `notify-student-graded` / `notify-student-message` — email notifications.
- `set-student-password` — teacher-set student passwords (fallback when school email filters block
  OTP mail).
- `delete-old-attachments`, `nightly-backup`, `scheduled-digest` — nightly cron jobs (retention
  purge, per-owner backups, email digests).

The service-role key is available only inside edge functions (`Deno.env.get(...)`) and must never
reach the client.

---

## 18. Tooling & configuration choices

### TypeScript (`tsconfig.json`)

- **`"strict": true`** — the whole strict family is on. Expect to handle `undefined` explicitly.
- **`"moduleResolution": "bundler"`** + `"allowImportingTsExtensions"` — modern Vite-style
  resolution; you can import `.ts` extensions, and there's no separate build step for types (Vite
  handles transpilation; `tsc --noEmit` only *checks*).
- **`"noEmit": true`** — TypeScript never emits JS; it's purely a type checker here.
- **`"isolatedModules": true`** — each file must be transpilable alone (why you'll see
  `import type { … }` everywhere: type-only imports are erased and don't create runtime
  dependencies).
- **`"noFallthroughCasesInSwitch": true`** — every `case` in the reducer must `return`/`break`
  (the reducer relies on this).
- **`"paths": { "@tiptap/pm/*": ["node_modules/prosemirror-*"] }`** — a resolution shim so
  TipTap's ProseMirror re-exports resolve to the real packages.
- Note `noUnusedLocals`/`noUnusedParameters` are **off** in tsconfig — that lint concern is handled
  by ESLint instead (with an `^_` ignore pattern), which gives nicer autofix behaviour.

### ESLint (`eslint.config.js`) and the two custom rules

Flat config, `typescript-eslint` + React Hooks + React Refresh + Prettier-compat. The two
**project-specific** rules (in `eslint/rules/`) enforce the state architecture:

- **`local/max-domains-in-component`** (warn) — a component subscribing to >3 domain hooks
  re-renders on unrelated changes; you should use `useStoreSelector`. It's a warning, not an
  error, because ~14 components still violate it and are being migrated incrementally.
- **`local/max-domains-in-render-hook`** (error, tests only) — a `renderHook` test that spreads
  4+ domain hooks defeats the isolation it's meant to verify.

`max-domains-in-render-hook.js` is worth reading (`eslint/rules/max-domains-in-render-hook.js`):
it walks the AST of the `renderHook` callback, resolves each called identifier *through its import
binding* (so a locally-shadowed function that merely shares a name with a domain hook isn't
counted), confirms the import comes from a path ending in `AppContext` (the regex
`/(^|\/)AppContext$/`), and counts the distinct domain hooks. It's a nice, self-contained example
of a real ESLint rule.

### Vite / PWA (`vite.config.ts`)

- **`base: './'`** — relative asset paths so the build runs from any sub-path (see §9).
- **PWA** via `vite-plugin-pwa` with `registerType: 'prompt'` — the app can be installed and works
  offline; a "new version" prompt appears rather than silently updating.
- **Workbox** rules encode two lessons: never cache Supabase requests (`NetworkOnly` on the API
  paths, or a failed sync could look successful), and don't precache the non-EN locale chunks or
  the bundle-analysis page.
- **`optimizeDeps.include: ['@supabase/supabase-js']`** — because Supabase is now only reachable
  via a nested dynamic import, the dev server's pre-bundler could miss it and trigger a mid-session
  reload; listing it forces cold-start pre-bundling. (Dev-only; no effect on prod chunking.)
- The **coverage config** (bottom of the file) lists exactly which files are excluded from
  coverage and why (entry points, static data, browser-API-heavy modules), plus the thresholds.

### Testing

- **Vitest + Testing Library**, jsdom environment. Unit tests sit next to their file
  (`foo.ts` → `foo.test.ts`) or in `__tests__/`. Render components with
  `src/test-utils/renderWithProviders.tsx`.
- **Don't mock `localStorage`** — tests use the real jsdom implementation.
- **Flaky-test quarantine.** Rather than deleting a flaky test, you add it to
  `e2e/quarantine.json` (E2E) or `quarantine-unit.json` (unit, plus wrapping the test with
  `it.skipIf(isQuarantined('id'))`). A weekly workflow re-tests quarantined items and proposes
  un-quarantining stable ones. Guard tests enforce the JSON/marker consistency. This is a whole
  little subsystem — see `CLAUDE.md` → "Testing" and "CI/CD".
- **E2E**: Playwright, Page Object Model in `e2e/pages/`. Supabase-dependent specs are excluded
  from the default browser projects and run via `npm run e2e:supabase`.

### CI/CD

`ci.yml` is the single gate (typecheck/lint/format, unit + coverage, sharded E2E across
chromium/firefox/webkit/mobile, Supabase E2E, bundle analysis). Deploys (`deploy-pages` /
`deploy-hestiacp` / `deploy-vps`) are jobs *inside* `ci.yml` that only run when every check passes
on a push to `main` that changed app files. See `CLAUDE.md` → "CI/CD" for the full picture,
including the merge queue and the `AUTO_QUARANTINE_TOKEN` secret.

---

## 19. A TypeScript idioms glossary (the non-obvious bits)

These are the patterns that might make you pause when reading the code.

- **Discriminated unions for actions.** `Action` (`storeCore.ts:98`) is a big union of
  `{ type: '…'; … }` objects. The reducer `switch`es on `action.type`; inside each case
  TypeScript *narrows* the type so `action.payload` has exactly the right shape. Adding a new
  action = add a member to the union + a `case` (and `noFallthroughCasesInSwitch` makes you
  `return`).

- **`import type { … }`.** Type-only imports (used pervasively). Because `isolatedModules` is on,
  the compiler can't always tell whether an import is only a type, so being explicit keeps types
  from creating runtime module dependencies — critical for the lazy-loading (a `type` import of a
  DB type doesn't pull in the 450 KB DB chunk).

- **`Pick<T, …>` / `Omit<T, …>`.** The domain value types are assembled with `Pick` from the giant
  `AppContextValue` (see `roster.tsx:10`). This keeps one canonical definition and slices views
  out of it, instead of re-declaring shapes. `Omit<TestQuestion, 'sectionId'>` (in the question
  bank) means "a question, but without the field that ties it to a specific test".

- **`Partial<T>`.** `UPDATE_SETTINGS` takes `Partial<AppSettings>` — a patch object — and the
  reducer spreads it over the current settings.

- **`as const` and literal-union types.** Things like `ScoringMode` or `VoTrack` are unions of
  string literals, giving you exhaustive checking and autocomplete instead of loose `string`.

- **`WeakMap` caches keyed on object identity.** The sorted-ranges cache in `gradeCalc.ts:147`
  and the vocab-profile cache. Because the key is an *object reference*, "has this data changed?"
  becomes "is it a different array?", and the cache self-invalidates on edit with no bookkeeping.

- **The `eslint-disable react-hooks/refs` on render-phase ref writes.** Deliberate; see §6.
  Always paired with a comment explaining the "latest ref" reasoning.

- **`/* v8 ignore next */` comments.** These tell the V8 coverage tool to skip an
  unreachable/defensive branch (e.g. a `?? fallback` that can't actually be hit because a Map was
  pre-seeded — `gradeCalc.ts:247`). They keep coverage honest without writing impossible tests.

- **`Awaited<ReturnType<typeof …>>`.** Used heavily in `AppContextValue` (`storeCore.ts:1021`+) to
  say "the resolved type of whatever this StorageSync method returns" without re-declaring it —
  so the context type automatically tracks the service's signatures.

- **`satisfies` / typed constant tables.** e.g. `LEVEL_TO_ELO: Record<CefrLevel, number>`
  guarantees every CEFR level has an entry.

- **`try { … } catch {}` around all `localStorage` and `btoa`/`atob`.** These can throw (quota,
  private mode, malformed input). The pattern is to degrade gracefully — return `null`/`''`/a
  default — never to crash a render.

- **Composite string keys + explicit `getId`.** Because some entities lack an `.id`, generic
  helpers (`diffCollection`, `mergeCollection`) take a `getId: (x) => string` rather than assuming
  a field. This is why you see `` (a) => `${a.deckId}:${a.studentId}` `` passed around.

---

## 20. Recipes: how to make common changes

### Add a field to an existing entity

1. Add the field to the interface in `src/types/index.ts` (make it optional `?` if old records
   won't have it — the app must read pre-existing data).
2. Set it wherever the entity is created/edited (action creators, page forms).
3. If it must sync, it already will — the delta-sync diff pushes the whole record. But make sure
   the Supabase table/column exists: add a **migration** (`supabase/migrations/NNN_…sql`) and the
   adapter mapping in `SupabaseAdapter.ts`.
4. Add a localStorage round-trip if needed (usually automatic via the collection saver).

### Add a new collection/entity end-to-end

1. Define the interface in `types/index.ts` (include `updatedAt?` if it should sync LWW).
2. Add it to `StoreData` (`storage.ts:1054`) and a `saveX` writer + `loadStore` read.
3. Add reducer actions to the `Action` union and `reducer` (`storeCore.ts`), each `isOffline()`-gated.
4. Expose action creators + a value in the right `src/context/domains/*.tsx`.
5. Wire it into the delta-sync diff list (`AppContext.tsx:433`+) and the `COLLECTIONS` spec in
   `syncMerge.ts:92` and `COLLECTION_SAVERS` (`storeCore.ts:1104`).
6. Backend: migration (table + RLS policies) and adapter methods.

### Add a new page/route

1. Create `src/pages/MyPage.tsx`.
2. `const MyPage = lazy(() => import('./pages/MyPage'))` and a `<Route>` in `App.tsx`.
3. **Update the docs** — `CLAUDE.md`'s "Documentation maintenance" rule requires, in the *same*
   change: the in-app `DocsPage.tsx` (add a `ROUTE_TREE` entry), the README's Routes table, and
   `LandingPage.tsx` if it's a significant user-facing feature.

### Add a user-visible string

Add the key to **all five** locale files (`src/locales/*.json`) and use `t('my.key')` via
`useTranslation()`. Never hardcode the English in JSX. The locale-parity test will fail if you
forget the non-EN files.

### Change how a grade is calculated

It's almost certainly in `gradeCalc.ts` (or `testCalc.ts` for tests). These are pure and
well-tested — add/adjust a test in the sibling `.test.ts` first, then change the function.

---

## 21. Glossary of domain terms

| Term | Meaning |
| --- | --- |
| **CEFR** | Common European Framework of Reference — the A1/A2/B1/B2/C1/C2 language-proficiency scale |
| **Can-Do descriptor** | A CEFR statement like "can write a short simple postcard"; linkable to criteria |
| **Rubric** | The grading template (criteria × levels) |
| **Criterion** | One row of a rubric (a thing being assessed) |
| **Level** | One performance band within a criterion (a cell), with a point range |
| **StudentRubric** | One student's completed grade for one rubric |
| **Rubric snapshot** | A frozen copy of the rubric stored on a grade, so later edits don't rewrite history |
| **Scoring modes** | `weighted-percentage` (default), `total-points`, `single-point` (exceeds/meets/not-yet) |
| **Modifier** | A whole-grade bump (± percentage / points / levels) with a reason |
| **Grade scale** | Maps a percentage to a label + colour (letter, pass/fail, custom) |
| **VO track** | Dutch secondary-school ability track (VMBO-BB/KB/TL, HAVO, VWO) |
| **SchoolYear** | Dutch grade level (groep-7/8 primary; jaar-1…6 secondary) |
| **Placement test** | An adaptive test that estimates a CEFR level (MST / staircase / generator engines) |
| **FSRS** | Free Spaced Repetition Scheduler — the flashcard scheduling algorithm (via `ts-fsrs`) |
| **teacherKey** | An opaque per-assignment id embedded in student links so a teacher can filter their own rows |
| **Share code** | URL-safe-base64-encoded JSON payload that carries data to a student page |
| **Pending queue** | `localStorage` buffer of Supabase writes that failed and need retrying |
| **Hydrate** | Pull the full dataset from Supabase into app state |
| **Delta-sync** | The effect that pushes only changed rows to Supabase after each state change |
| **LWW** | Last-write-wins — the conflict rule, decided by `updatedAt` |
| **RLS** | Row-level security — Postgres policies that restrict rows to their owner |
| **Edge function** | Server-side Deno/TypeScript function (for logic a client can't be trusted with) |
| **Proctoring** | Capturing tab-switches/copy-paste/etc. while a student takes a test |
| **SEB** | Safe Exam Browser — a locked-down browser some tests can require |

---

*End of guide. If you want a section expanded — e.g. a line-by-line of `RubricBuilder`, the test
auto-scoring in `testCalc.ts`, or the full placement-test flow — that's a good next deep-dive.*
