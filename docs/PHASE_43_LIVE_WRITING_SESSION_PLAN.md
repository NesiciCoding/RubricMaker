# Phase 43 — Live Writing Session (WeWillWrite-style)

**Status:** Research + mockup complete. **Design decisions signed off 10 Nov 2026. Implementation shipped through 43.6 in the Phase 43 stack (#1160–#1169); §6 records the shipped schema deltas.** This document is the design authority, not a build log.
**Source:** [#851 — A we-will-write Like synchronous writing task](https://github.com/NesiciCoding/RubricMaker/issues/851) (`enhancement`, `priority: low`, `role:teacher`, `role:student`, `route:student`, `database`).
**Mockup:** [`docs/mockups/live-writing-session.html`](mockups/live-writing-session.html) — self-contained, light/dark, screens for teacher setup, projector, finals, insights and the full student loop.
**Tracking issues:** 43.1 [#1159](https://github.com/NesiciCoding/RubricMaker/issues/1159) · 43.2 [#1155](https://github.com/NesiciCoding/RubricMaker/issues/1155) · 43.3 [#1158](https://github.com/NesiciCoding/RubricMaker/issues/1158) · 43.4 [#1154](https://github.com/NesiciCoding/RubricMaker/issues/1154) · 43.5 [#1156](https://github.com/NesiciCoding/RubricMaker/issues/1156) · 43.6 [#1153](https://github.com/NesiciCoding/RubricMaker/issues/1153) · 43.7 [#1157](https://github.com/NesiciCoding/RubricMaker/issues/1157)
**Why now:** WeWillWrite is not available in the Netherlands; the teacher who filed #851 wants the classroom loop, not a copy of the brand. RubricMaker already owns almost every underlying primitive (roster, essay editor, timer, live presence, CEFR profiling, grading, portals) — what is missing is the _session orchestration_ around them.

**Signed-off decisions (10 Nov 2026):**

- **Zero AI.** No generated text, prompt images, hint content, literary-device detection, feedback, grades or winners. Every former "AI" job is deterministic statistics, roster data, or an explicit teacher action.
- **Roster identity is the integration seam.** Joining always resolves to a class `student_id`; that is what lets session writing flow into the existing grading loop instead of becoming throwaway text.
- **Rounds:** configurable, default **one** (cap at 3 in v1).
- **Hints:** teacher-toggleable **and teacher-authored**, revealed one at a time.
- **Voting:** one vote per pair per round; the teacher can reopen and redistribute a round for quality control.
- **CEFR:** a vocabulary estimate used as an **early indicator** (alongside placement evidence). Never auto-aggregated into CEFR leveling, never auto-graded.
- **Join:** public code + roster name picker; **portal join is an option and skips the picker**.
- **Prompt images:** media bucket only — never data URLs or share-code payloads.
- **Retention:** same lifecycle as essay submissions; deletable per session.
- **Prompt sharing:** belongs in the existing school marketplace (43.7), with tags for subject/focus/level.

---

## 1. What the issue asks for

| #   | Requirement                                                                                                     | Covered by |
| --- | --------------------------------------------------------------------------------------------------------------- | ---------- |
| 2a  | Teacher writes a prompt, optional image                                                                         | §5.1, 43.2 |
| 2b1 | Projection page with join link + code (Kahoot/Blooket style)                                                    | §5.2, 43.2 |
| 2b2 | Projection shows a leaderboard with a simple A1–C2 level and live word counts                                   | §5.2, §7   |
| 2b3 | Timer showing how long students have to write                                                                   | §5.2, 43.3 |
| 2b4 | After the timer: screen shows all texts anonymously, teacher can reveal names                                   | §5.4, 43.5 |
| 3a  | Student joins with the code, then picks their name from the class roster; also joinable from the student portal | §5.3, 43.1 |
| 3b  | Student screen follows the essay writing screen, with prompt, timer, level, live word count                     | §5.3, 43.3 |
| 3c  | At time-up: auto hand-in, then a 3-option self-evaluation with emoji                                            | §5.3, 43.4 |
| 3d  | Then read two peers' texts and vote for the better one; teacher sees the votes; toggleable                      | §5.3, 43.4 |

---

## 2. Research: how WeWillWrite actually runs a session

Sources: [wewillwrite.com](https://wewillwrite.com/), [How it works](https://wewillwrite.com/how-it-works), [Product / teacher + student views](https://wewillwrite.com/product), [Implementation](https://wewillwrite.com/implementation), [FAQ](https://wewillwrite.com/faq), [Accessibility](https://wewillwrite.com/resources/accessibility-and-student-support), [Pricing](https://wewillwrite.com/pricing).

**The loop (Choose → Run → Reflect):**

1. **Choose.** The teacher picks a challenge (prompt + writing focus + image + suggested time) from a library or writes their own, and sets the timer. Nothing is prepared or printed.
2. **Run.** The teacher opens a projection screen. Students go to a join URL, enter the PIN shown on screen, type their first and last name once, and are placed in a **team of 2–4** (teams are hidden from students, animal mascots). Writing is **2–5 minute bursts**; the projection shows a live word count per team and a ticking timer. The teacher can **start, pause, end** and **adjust the writing time**; timing can scale across a session to build stamina.
3. **Reflect.** Students **self-assess** (visible later to the teacher). The class reads **anonymous** texts and **votes**; the teacher can **replace or remove** any text before the finals. Finalists appear on the projector. The teacher leads the discussion; texts are anonymous to classmates but never to the teacher.
4. **Teacher Insights (after the lesson).** Class overview, per-session insights and a per-student portfolio across the year: who writes more than they used to, whose writing is strengthening, what the class is ready for next.

**Boundary conditions worth copying:**

- **No student accounts.** PIN join, name typed once, up to 100 students per session, 3–100 participants. No roster sync, nothing installed, any browser.
- **AI is deliberately limited.** It generates some prompt images, highlights literary devices in final texts for discussion, and filters names/profanity. It **never writes for a student, never grades, and never picks a winner** — students vote. (RubricMaker's own rule is stricter: **no AI generation at all**, which this design honours.)
- **Accessibility is first-class**: scaffolded hint cards (up to 5), pause, adjustable time, text-to-speech/speech-to-text/screen-reader compatibility, team writing to lower individual pressure.
- **Teacher control over the social layer**: replace a text, moderate names/language, hide identities to peers.
- **Commercial shape**: free tier with limited prompts and last-session insights; per-teacher licence for unlimited prompts and full insights.

**Rejected outright for RubricMaker:** none of WeWillWrite's AI uses are adopted — not prompt images, not literary-device highlighting, not name/profanity filtering through a model, and not generated "Teacher Insights". Every equivalent here is deterministic or teacher-driven: images are uploaded by the teacher into the media bucket, highlights come from the existing transition-word and sentence statistics, filtering is a plain word-list plus teacher moderation, and insights are counts, distributions and self-checks. If a feature cannot be built deterministically, it is cut rather than generated.

**What that means for us:** the product is _short, synchronous, social writing with an audience_, not another long-form assignment. RubricMaker must not turn essays into this; it should add a separate, lightweight **session** layer that _feeds_ the essay/grading pipeline afterwards.

---

## 3. Gap analysis against RubricMaker today

| Capability                      | WeWillWrite          | RubricMaker today                                                                              | Decision                                                                          |
| ------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Prompt + optional image + focus | Challenge library    | Essay title/prompt, no image, no focus tags                                                    | Add to session only (43.2); do **not** widen `EssayTemplate`                      |
| Code join, no student account   | PIN, name typed      | Share codes are per-student essay URLs; portal students have real accounts                     | Add session join code + roster name pick (43.1)                                   |
| Whole-class projection surface  | Yes                  | `LiveMonitorPage` is a teacher dashboard, not a projector                                      | New `/live/:id/project` window (43.2)                                             |
| Live word counts + presence     | Yes                  | Already: live monitor heartbeats, snapshots, writing pace, word-count history                  | Reuse `useLiveSessionTelemetry` pattern (43.2/43.3)                               |
| Timer + auto hand-in            | Yes                  | Essay has `timeLimitMinutes`, countdown, auto-submit, timed-attempt receipt                    | Reuse; sync from session instead of per-student URL                               |
| A1–C2 level indicator           | Yes (in insights)    | Deterministic vocabulary profiler (`cefrVocabularyProfiler.ts`), CEFR badges, CEFR aggregators | Reuse, label as an estimate, minimum-word guard (43.3/§7)                         |
| Self-assessment with emoji      | Yes                  | `SelfAssessPage` uses a 4-point confidence scale + reflection                                  | New lightweight 3-point check (43.4); do not repurpose the rubric self-assessment |
| Peer reading + voting           | Yes                  | Anonymous essay share codes, peer review with rubric criteria (`PeerReviewView`)               | New lightweight two-text vote (43.4); rubric peer review stays the deep option    |
| Anonymous finals + reveal       | Yes                  | Live monitor hides names; essay submissions are identifiable                                   | New final gallery (43.5)                                                          |
| Teacher insights / portfolio    | Yes                  | `EssayTextStats`, vocabulary dashboard, student profile, statistics                            | Reuse stats; session summary + optional send-to-grading (43.5)                    |
| Grading                         | Explicitly absent    | Full rubric grading (`GradeStudent`)                                                           | Deliberate advantage: session texts can become gradable `EssaySubmission`s        |
| No AI                           | AI limited to 3 uses | Project rule: no AI generation at all                                                          | Keep: deterministic stats only                                                    |

---

## 4. Integration strategy (recommended)

**Treat a live session as a transient orchestration layer over the existing essay pipeline — not as a new assignment type and not as a separate product.**

```
class roster + optional rubric
        │
        ▼
live_writing_session (draft → lobby → writing → selfcheck → voting → finals → closed)
        │                       realtime: presence + word counts (ephemeral)
        ▼
participant rows (text, stats, self-check) ──► finals gallery ──► session insights
        │                                              │
        └──────────────► optional "send to grading" ───┘
                              creates EssaySubmission rows
                              (teacherKey + rubricId) → GradeStudent, analytics, portfolio
```

Five pillars:

1. **Reuse, don't fork.** Same `EssayEditor`, same word/time rules (`validateEssayConfig`, `countWords`), same telemetry channel conventions, same `EssayAdapter` session/auth model, same `CefrBadge`/`SegmentedToggle`/`Avatar`/`Topbar` UI. A new editor or a second timer implementation would be the main long-term cost. Participant identity always resolves to a class roster `student_id`, so a text is attributable the moment it is written — that is the seam into grading, not an afterthought.
2. **Ephemeral by default, durable on purpose.** Live counts and presence ride the realtime broadcast (like monitoring); only texts, votes and self-checks are written to tables, and only at meaningful boundaries (auto-save every few seconds, hand-in, vote, reveal).
3. **Cloud-only, honestly.** A cross-device live session needs Supabase. In local/offline mode `/live` shows an explanatory empty state ("Live sessions need a cloud connection" + how to connect), consistent with the existing reduced-capability rule. Do **not** fake it with `BroadcastChannel` on one machine.
4. **Teacher is always the audience owner.** Peers see text only in the voting/finals phase and only anonymously; the teacher always sees who wrote what and can moderate. This is the privacy contract that makes code-join acceptable.
5. **No AI, no exceptions.** Prompt images are teacher uploads, hints are teacher-written, finals highlights are transition/sentence statistics, level estimates are vocabulary profiling, and no winner is ever declared by software. This is stricter than WeWillWrite and non-negotiable for this project.

---

## 5. Experience design (what the mockup shows)

Mockup screens: **Teacher setup · Teacher projector · Finals · Session insights · Student join · Student writing · Self-check · Peer vote**.

### 5.1 Teacher setup (`/live/:sessionId`, phase `draft`)

A two-column console, matching the Essay Builder's card rhythm:

- **Prompt card** — title, prompt text, optional image drop (stored in the media bucket, never in a share code), writing-focus chips (free text + suggested: sensory detail, show-don't-tell, dialogue, tension), up to three **teacher-authored hint cards** (editable, with a sensible default set) and a link to the teacher's saved prompt bank. The hints switch in session options hides them entirely.
- **Class & roster card** — class picker with student count; copy: "Students pick their own name from this roster. No accounts or emails needed." Toggle: "Also show in the student portal" (issue 3a).
- **Timing card** — writing minutes (default 5, 1–20), self-check minutes (2), reading/voting minutes (3) and **rounds** (default 1, 1–3). Each round repeats the same prompt for everyone, keeps the same roster identity, and reopens voting for that round.
- **Session options card** — peer voting, anonymous texts to peers, show live CEFR estimate, allow hint cards, lock joins after start, moderate before finals, allow early hand-in.
- **Rubric link card** — optional rubric; enables "send all texts to grading".
- **Start card** — summary line (`26 students · 10 min · peer vote on`), join preview (code + URL), **Start session**, "Save as template" (later).

The primary button starts the lobby and opens the projector window.

### 5.2 Teacher projector (`/live/:sessionId/project`)

A separate route so the teacher can move it to the second screen while keeping the console on the laptop.

- **Lobby:** huge join URL + 6-character code (e.g. `RM-4821`), "19 of 26 joined" roster chips filling in, "Start writing" enabled at ≥1 participant, class name.
- **Writing:** the prompt and image stay visible; a large countdown; "Words written" total; a **progress board**, not a quality leaderboard — rows show display name/anonymous label, word count, bar, and a CEFR estimate chip. Ranking by words only, and the teacher can switch it off (`showProgressBoard`).
- **Controls:** pause/resume, +1 minute, end writing early, end session. Timer authority is the server timestamp, not each browser's interval.
- **Self-check & voting:** simple "the class is reflecting / reading and voting" progress with counts.

Design notes baked into the mockup: a words-only leaderboard rewards verbosity, so it is labelled as pace/progress, never as "best"; the CEFR chip only appears after ~25 words to avoid labelling fragments.

### 5.3 Student side (`/join`, `/join/:code`, portal card)

No account required, but the name must come from the roster so the teacher gets attributable data:

1. **Join** — code entry; the class and teacher name are shown only after a valid code; then a searchable name picker ("Find your name") in two columns. Accessibility: the picker is a normal list of buttons, not a custom combobox; "Not in the list? Ask your teacher."
2. **Waiting room** — name, class, session title, "Waiting for your teacher to start", a check that your device works.
3. **Writing** — deliberately close to `StudentEssayPage`: compact header (title, timer, word count, CEFR chip), prompt + image in a sidebar, the TipTap editor, optional hint cards ("open a hint" reveals one at a time), draft-saved indicator, "Hand in early" secondary action. Auto hand-in at 0:00.
4. **Self-check** — "Time's up — your text was handed in." Three large options: 🙂 happy / 😐 neutral / 😕 not happy, plus an optional one-line "What would you change?" and Continue.
5. **Peer vote** — two anonymous class texts side by side (never their own, never two from the same writer), "Which is stronger?" per card, progress `1 of 2`, then a thank-you state. Teacher sees who voted for whom; students never do.

Portal entry: the **Assignments** tab gets a "Live write" card when a session for the student's class is open, linking to `/join/:code`. Portal join is a session option; when it is on, the signed-in portal identity **skips both the code entry and the name picker**, because the student is already authenticated. Public join always goes through the picker.

### 5.4 Finals (`/live/:sessionId`, phase `finals`)

Card gallery of all handed-in texts, anonymous by default; sort by votes / newest / longest; teacher actions **Spotlight** (large readable view), **Reveal names**, **Hide**, **Send to grading**. Spotlight shows deterministic writing stats already in the app (word/sentence counts, sentence-length variance, transition words, CEFR estimate) and highlights transition words/long sentences. No AI commentary, no device detection, no "winner" declaration — the teacher leads the discussion.

### 5.5 Session insights (`/live/:sessionId`, phase `closed`)

Summary tiles (participants, median words, average CEFR estimate labelled **early indicator**, self-check split), a per-student table (name, words, CEFR estimate, self-check, votes received, handed-in status, open portfolio), CSV export, "send all to grading with rubric X", "run another round with this class". Fits the existing Statistics/Student profile language rather than inventing a new analytical model. Nothing here mutates the CEFR profile or a grade.

---

## 6. Data model, realtime and security

New tables (next migration number is **100**; keep the sequential `supabase/migrations/` convention — see `supabase/CLAUDE.md`):

```sql
live_writing_sessions
  id uuid pk, teacher_id uuid, class_id uuid,
  title text, prompt text, prompt_image_path text, focus_tags text[],
  hints jsonb,               -- up to 3 teacher-authored cards; empty when hints are off
  writing_seconds int, selfcheck_seconds int, reading_seconds int,
  round_count int default 1, current_round int default 1,
  options jsonb,             -- peerVoting, anonymous, showLevel, hints, moderation,
                             -- lockAfterStart, allowEarlyHandIn, showProgressBoard, portalJoin
  rubric_id uuid null,
  join_code text unique, join_code_expires_at timestamptz,
  status text check (... 'draft','lobby','writing','selfcheck','voting','finals','closed'),
  voting_open boolean default true,
  started_at timestamptz, phase_changed_at timestamptz, closed_at timestamptz,
  display_order int, created_at, updated_at

live_writing_participants
  id uuid pk, session_id uuid fk, student_id uuid fk (roster),
  display_name text, join_token_hash text,
  joined_at, last_seen_at,
  status text check ('joined','writing','handed_in','self_checked','voted')

live_writing_responses
  id uuid pk, session_id uuid fk, participant_id uuid fk, round_index int,
  text_html text, word_count int, stats jsonb, cefr_estimate text,
  self_rating text check ('happy','neutral','unhappy'), self_note text,
  handed_in_at timestamptz,
  unique (participant_id, round_index)

live_writing_votes
  id uuid pk, session_id uuid, round_index int, voter_participant_id uuid,
  shown_participant_ids uuid[], chosen_participant_id uuid, created_at,
  unique (session_id, round_index, voter_participant_id)
```

**Shipped schema deltas (43.1–43.6)** — the tables above keep their shape, with these differences:

- `join_token_hash` shipped as a plaintext `join_token`, returned once to the participant at join and matched by the RPCs.
- There is no separate `selfcheck` session status: self-checks are accepted while the session is in `voting`.
- `voting_open` shipped as `votes_open boolean not null default false`.
- Join codes expire after **24 hours** (not 3); the throttle is a pruned join-attempt table.
- Vote pair validation shipped in 43.4: `submit_live_writing_vote` rejects a pair that is not that round's pairing.

**Access model**

- Teacher policies follow the existing owner/school/co-teacher rules (same shape as tests/essays): select/insert/update own sessions; co-teachers where the class is shared view-only or view & grade per the existing class-sharing contract.
- **Students get no direct table access.** Joining and writing go through `SECURITY DEFINER` RPCs:
    - `join_live_writing_session(code, student_id)` → participant id + one-time join token (stored hashed); validates code, session status, `lockAfterStart`, and that the student is in the session's class; rate-limited per IP/code.
    - `save_live_writing_text(participant_id, token, round_index, html)` → throttled upsert; the server recomputes `countWords`, stats and the vocabulary estimate rather than trusting the client.
    - `hand_in_live_writing(participant_id, token, round_index)` → idempotent; freezes that round's text.
    - `submit_live_writing_selfcheck(...)`, `submit_live_writing_vote(round_index, shown[], chosen)` → validate the voter is a participant, the shown pair excludes the voter, the pair matches the round's generated pairing, and `voting_open` is true.
    - `reopen_live_writing_voting(session_id, round_index)` (teacher-only) → clears that round's votes, regenerates pairings and reopens voting. Redistribution creates **new pairs**, never the same pair reassigned; every reopen is recorded on the round.
    - RPCs return the minimum columns; peers' text is never readable through the anon key.
- **Realtime** (broadcast only, `monitor:*` conventions): channel `live:${sessionId}` carries `presence`, `progress` (participant id + word count + phase) and `phase` (teacher → students). Texts never travel on the broadcast. Students subscribe with their participant id, not their email.
- The projector reads only the session row plus participants; it never needs the join token.
- **Code format:** 6 chars from an unambiguous alphabet, case-insensitive, 3-hour expiry, one active session per code. Brute-force mitigation: rate limit + short TTL + code shown only after teacher start.

**Lifecycle authority:** `phase_changed_at` + configured durations define the countdown; every client derives remaining time from the server timestamp (plus a clock-skew correction on join), so pausing or extending applies class-wide instead of per device.

---

## 7. The A1–C2 level indicator (deterministic, no AI)

Use the existing vocabulary profiler rather than a new model:

- `scanText()` from `src/utils/cefrVocabularyProfiler.ts` → level counts → `estimateLevelFromCounts()` → `CefrLevel`.
- Show it through `CefrBadge`, with the `developing` (dashed) style until the text has **≥ 25 words**; below that show "—" and the copy "Write a little more to see an estimate".
- Label it everywhere as **"CEFR estimate · vocabulary"**, never "level", never a grade, and never feed it into grading or CEFR aggregation automatically. A teacher can choose to attach the session's texts to a rubric, but the grade stays manual by design.
- **Aggregation contract (decided):** the estimate is an **early indicator** only. It is never written into `cefrStudentAggregator`, placement results or a student's CEFR profile automatically. It may be shown beside them (e.g. "last live session: B1 est.") for teacher judgement, in the same spirit as placement evidence — but the indicator never promotes itself to a level.
- The teacher insight can show the class's pooled distribution using `poolLevelCounts()` — the same aggregation the vocabulary dashboard already uses — as a distribution, not a level assignment.

This satisfies 2b2 ("simple level indicator A1–C2") with zero AI: a deterministic vocabulary profile, an explicit early-indicator label, and a teacher in control of what it feeds.

---

## 8. Routes, files and reuse

**New routes**

| Path                       | Audience | Purpose                                              |
| -------------------------- | -------- | ---------------------------------------------------- |
| `/live`                    | Teacher  | Sessions list (draft/live/closed), new session       |
| `/live/:sessionId`         | Teacher  | Console: setup → lobby → writing → finals → insights |
| `/live/:sessionId/project` | Teacher  | Projector window (no sidebar chrome)                 |
| `/join`                    | Public   | Code entry                                           |
| `/join/:code`              | Public   | Name picker → session                                |

Portal: live-session card in the **Assignments** tab of `StudentPortalPage` linking to `/join/:code`; no change to `/portal/:studentId`.

**Likely new files** — `src/pages/LiveWritingPage.tsx` (console), `LiveWritingProjectorPage.tsx`, `StudentLiveWritePage.tsx`, `src/components/LiveWriting/*` (setup cards, join roster, progress board, finals gallery, self-check, vote), `src/services/database/LiveWritingAdapter.ts`, `src/hooks/useLiveWritingSession.ts`, `src/utils/liveWriting.ts` (code generation, phase math, vote pairing), plus migration `100_live_writing_sessions.sql`.

**Explicit reuse** — `EssayEditor`, `countWords`/`htmlToPlainText`, `validateEssayConfig`, `useLiveSessionTelemetry` (presence/heartbeat/snapshot conventions), `LiveMonitorPage` (word-history/pace signals, hide-names pattern), `cefrVocabularyProfiler`, `EssayTextStats`, `EssayAdapter.submitEssay` (send to grading), `SelfAssessPage` interaction patterns, `CefrBadge`, `SegmentedToggle`, `Avatar`, `Topbar`, `EmptyState`, `ToastContext`, `shareCode.ts` for the projector URL only.

---

## 9. Phased delivery

### 43.1 Foundation — schema, join, roster, routes _(medium)_ · [#1159](https://github.com/NesiciCoding/RubricMaker/issues/1159)

Migration, types in `src/types/index.ts`, adapter + RPCs, code generation, `/live` list, draft console shell (including the rounds control, default 1), `/join` + name picker, portal card with optional picker bypass, local-mode empty state, i18n keys (all five locales).

**Acceptance:** teacher creates a draft with one round (and can raise it to 3); student joins with code + roster name; second device sees the participant in the lobby; a portal student with portal join enabled lands without the picker; a student outside the class and an invalid/expired code are rejected; codes are rate-limited; local mode explains itself instead of failing; two-account isolation verified.

### 43.2 Projection + lobby + timer _(medium)_ · [#1155](https://github.com/NesiciCoding/RubricMaker/issues/1155)

Projector route, join URL/QR, presence roster, start/pause/+1 min/end, server-authoritative countdown, progress board with word counts and guarded CEFR chips, projector-safe typography.

**Acceptance:** projector survives a refresh/reconnect; pause and +1 min apply to every student; no participant text appears on the projector before finals; timer stays within ~1 s of the server across devices.

### 43.3 Student writing _(medium–large)_ · [#1158](https://github.com/NesiciCoding/RubricMaker/issues/1158)

Editor screen close to `StudentEssayPage`, prompt/image, timer, live word count, teacher-authored hints, autosave, early hand-in, auto hand-in at 0:00, reconnect/resume, round switching when `round_count > 1`.

**Acceptance:** draft restored after reload; auto hand-in fires once (idempotent); word count matches the server; the hints switch hides the panel entirely and hints reveal one at a time; CEFR estimate appears only after the threshold and stays an estimate; a second round starts from a clean editor with the same prompt; phone/tablet layout usable; screen-reader labels on timer and word count.

### 43.4 Self-check + peer voting _(medium)_ · [#1154](https://github.com/NesiciCoding/RubricMaker/issues/1154)

Three-option self-check + optional note; pairing logic (two peers, not self, not the same writer twice); vote persistence; teacher toggle; results visible only to teacher. **One vote per pair per round**, with a teacher-only reopen that clears the round's votes and generates fresh pairs.

**Acceptance:** timer expiry → self-check only after hand-in; exactly one vote per participant per round, enforced by the unique constraint; self/duplicate pairing impossible; re-voting within a round is impossible until the teacher reopens it, after which the old vote is gone and the new pair is different; teacher sees vote counts and who voted, students see none; reopen is visible in the round log.

### 43.5 Finals + insights + grading hand-off _(large)_ · [#1156](https://github.com/NesiciCoding/RubricMaker/issues/1156)

Anonymous gallery, sort, spotlight with deterministic stats, reveal/hide/replace, send-to-grading creating `EssaySubmission`s under a `teacherKey` + rubric, session summary, per-student table, CSV, "another round". Session estimates remain an early indicator and never alter the CEFR profile.

**Acceptance:** names hidden by default and reveal is explicit; hidden texts are excluded from the gallery and votes; send-to-grading creates exactly one submission per participant (idempotent); those submissions appear in Essay List/GradeStudent and the student portal; insights numbers match the participant rows.

### 43.6 Hardening, docs, release _(small–medium)_ · [#1153](https://github.com/NesiciCoding/RubricMaker/issues/1153)

Add every new route to `A11Y_ROUTES`, i18n parity, Playwright specs (two-browser session happy path + reconnect + invalid code), reduced-motion and screen-reader pass on the projector, DocsPage tab + `ROUTE_TREE`, README routes/features, LandingPage teacher + student cards, load-test the realtime channel at 30–100 students.

### 43.7 Prompt sharing in the school marketplace _(later — depends on marketplace tagging)_ · [#1157](https://github.com/NesiciCoding/RubricMaker/issues/1157)

A live-session prompt (title, prompt text, image, focus tags, suggested timing) can be published to the existing **school marketplace** as a starter task, and cloned by a colleague. This is the teacher-saved prompt bank, not a new marketplace.

**Scope:** reuse `MarketplacePage` publishing/cloning; add a `live_prompt` resource type; store the image in the same media bucket with the publisher's school scoping. **Tagging is the gate:** subject, language, CEFR band, writing focus and school year must be first-class fields, otherwise the library is unusable.

**Acceptance:** a teacher publishes a prompt with tags, a colleague clones it into a draft session, images resolve for the cloner, unpublishing hides it from search, and no student data or session results ever travel with the prompt.

---

## 10. Risks and mitigations

| Risk                                                            | Mitigation                                                                                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roster leak on a public join page                               | Names only after a valid code; no emails/IDs; rate-limit code attempts; short TTL                                                                  |
| Anonymous texts aren't really anonymous to peers                | No participant ids/text on the broadcast channel; voting payloads sent to RPCs only; strip identifying metadata before pairing                     |
| Public-code session hijack / spam text                          | Class-membership check, join lock, per-participant token, teacher moderation, text length cap                                                      |
| Timer drift between devices                                     | Server `phase_changed_at` + duration, skew correction, periodic phase re-sync                                                                      |
| Leaderboard rewards verbosity                                   | Rank is labelled progress, optional, and never presented as quality; no grades attached                                                            |
| Realtime cost at 100 students                                   | Throttled progress broadcasts (e.g. 1/3 s), snapshots instead of diffs, no text on the wire                                                        |
| Guest writing collides with the portal's authenticated identity | One participant row per student per session; joining twice replaces the token, not the row                                                         |
| Storage growth from full texts                                  | Text length cap, stats-only after close (configurable retention), optional "keep texts" toggle                                                     |
| Local/self-hosted mode expectation                              | Explicit empty state; feature flagged off without Supabase, documented                                                                             |
| Accessibility regressions (timer, emoji scale, reveal)          | Timer as `role="timer"` with polite announcements only at milestones; emoji cards carry text labels; reveal is a labelled toggle; axe gate in 43.6 |
| Scope creep into full peer review                               | Keep the vote to two texts / one pick; deep peer review remains `PeerReviewView`                                                                   |

---

## 11. Verification plan

- Unit: phase math, code generation/normalisation, vote pairing, CEFR threshold, stats recomputation, reducer-free adapter mappers.
- RPC/RLS: join outside class, expired/locked code, double hand-in, foreign participant vote, teacher-only reads; two-account isolation.
- E2E (Playwright, two contexts): create → project → join → write → auto hand-in → self-check → vote → finals reveal → send to grading; plus reconnect mid-write and invalid code.
- Accessibility: new routes in the axe gate; keyboard-only join and voting; projector contrast checked at 7:1 like the rest of the palette.
- Manual: 30-device classroom smoke test (or k6 realtime channel test) before calling it classroom-ready.

---

## 12. Decisions on the record

| Question              | Decision                                                                                                      | Consequence for the build                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One round or several? | **Configurable, default one** (cap 3).                                                                        | `round_count` + `current_round`; responses and votes carry `round_index`; the model never needs a migration to add rounds.                                        |
| Leaderboard?          | **On, progress-framed, hideable**, never a quality ranking.                                                   | `showProgressBoard`; sorted by word count only; labelled as progress everywhere.                                                                                  |
| Voting rules?         | **One vote per pair per round**; teacher can reopen and redistribute.                                         | Unique `(session, round, voter)`; reopen clears the round's votes and generates new pairs; logged per round.                                                      |
| CEFR aggregation?     | **Not automatic.** Early indicator, like placement evidence. Auto-grading never fills deterministic leveling. | Estimate stored on the response only; join to the profile is a display-level indicator; attaching to a rubric is an explicit teacher action.                      |
| Portal join?          | **Optional**, and **skips the name picker** when on.                                                          | `portalJoin` option; authenticated student is pre-bound; public join keeps the picker.                                                                            |
| Prompt images?        | **Media bucket only**, 2 MB.                                                                                  | `prompt_image_path`; no base64 in share codes; cleanup with the session.                                                                                          |
| Retention?            | **Same as essays**, teacher-deletable.                                                                        | Reuse the essay retention policy and delete path; texts are not treated as ephemeral cache.                                                                       |
| Prompt sharing?       | **Existing school marketplace**, later phase, tags required.                                                  | 43.7; resource type + subject/level/focus tags; no new marketplace.                                                                                               |
| AI anywhere?          | **No.**                                                                                                       | Images are teacher uploads; hints are teacher-written; highlights are transition/sentence stats; levels are vocabulary profiles; no generated feedback or winner. |

---

## 13. Non-goals (explicitly out of scope)

- AI of any kind: writing, images, hints, feedback, grading, literary-device detection, filtering or AI-chosen winners.
- A separate prompt marketplace outside the existing school marketplace (43.7 owns sharing and tagging).
- Hidden teams/animal mascots, bot players, generated prompt images.
- Long-form assignments, take-home writing, or replacing `EssayAssignment`.
- Offline live sessions across devices.
- Rubric-based peer review inside the session (existing `PeerReviewView` covers that deeply).

---

## 14. Documentation, i18n and release checklist

- New i18n namespace `liveWrite` (or `essays.live_*`) added to **en, nl, fr, de, es**; `usedKeys.test.ts` and locale parity must pass.
- DocsPage: new **Live writing** section (teacher setup, projector, student loop, privacy) and `ROUTE_TREE` entries with a `Student` badge for `/join/:code`.
- README: routes table rows, feature bullet, key utility modules (`liveWriting.ts`, `LiveWritingAdapter.ts`).
- LandingPage: one teacher card ("Run a whole-class writing sprint") and one student card ("Write, reflect, vote").
- `A11Y_ROUTES` for `/live`, `/live/:id/project`, `/join`, `/join/:code`.
- Consider a feature flag/`settings` entry so a school can disable code-join sessions.
