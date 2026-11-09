# RubricMaker — Design & UX Audit Plan

Focus: Usability & flows + Visual consistency | Order: everything in order | Issues: grouped epics

## 1. How we audit (together)

**Method per page (15–20 min each, you + me):**

1. Open page on desktop + mobile width (share screen or I drive via Preview).
2. Walk the primary task (e.g. grade a student, build a test).
3. Score 7 heuristics: Findability, Task flow, Feedback, Consistency, Empty/Loading/Error states, Mobile, Accessibility.
4. Verdict: Keep / Polish / Fix (with screenshot + severity: blocker / major / minor / nit).
5. Log fixes straight into the grouped epic for that area.

**Session order (everything in order):**

- Batch 1: Entry & Shell (Landing, Onboarding, Dashboard shell, 404, Privacy, Docs)
- Batch 2: Teacher home (Dashboard, Activity, Statistics, Students, Profile, Attachments, Export)
- Batch 3: Rubric core (List, Builder, Preview link, Grade, Comparative, Speaking)
- Batch 4: Feedback & peer (Self-assess, Peer review, Peer analytics, Feedback link, Comment/Question banks)
- Batch 5: Tests & essays (Test list/builder/take/results/scores/queue, Essay list/builder/write, Live monitor)
- Batch 6: Student portal world (Portal, CEFR ×3, Vocab, Flashcards ×3, News flashes)
- Batch 7: Collaboration & system (Marketplace, Moderation, Messages, Notifications, Settings, Admin)
- Batch 8: Primitives & modals sweep (all shared components)

**Issue structure (grouped epics — your choice):**

- Epic 1: Shell & Navigation (Sidebar, Topbar, Tour, Skeletons, Error/Empty states)
- Epic 2: Teacher workflow (Dashboard → Rubrics → Grading)
- Epic 3: Assessment (Tests + Essays + Monitor + Queues)
- Epic 4: Student experience (Portal + share links + Flashcards + CEFR/Vocab)
- Epic 5: Collaboration (Marketplace, Moderation, Messages, Notifications)
- Epic 6: System (Settings, Admin, Privacy, Docs, i18n, Theming)
- Each finding = checklist item with: page, screenshot, severity, heuristic, current vs expected, acceptance criteria.

## 2. Full page inventory (55 surfaces)

### Batch 1 — Entry & Shell

1. `LandingPage` (`showLanding`) — first impression, value prop, CTA to app/login
2. `OnboardingPage` (`needsOnboarding`) — first-run setup
3. `NotFoundPage` (`*`) — dead-end handling
4. `PrivacyPage` (`/privacy` + portal variant) — trust, readability
5. `DocsPage` (`/docs`) — help findability
6. Shell: `Sidebar` + `Topbar` + `NotificationBell` + `MobileMenu` + `skip-nav` + `PageTour` + `MigrationPrompt`

### Batch 2 — Teacher home

7. `Dashboard` (`/`) — daily hub
8. `ActivityDashboardPage` (`/activity-dashboard`) — activity feed vs Dashboard overlap?
9. `StatisticsPage` (`/statistics`) — charts, filters
10. `StudentsPage` (`/students`) — roster management
11. `StudentProfilePage` (`/students/:id`) — single student story
12. `AttachmentsPage` (`/attachments`) — file library
13. `ExportPage` (`/export`) — export mental model

### Batch 3 — Rubric core

14. `RubricList` (`/rubrics`) — browse/search/reuse
15. `RubricBuilder` (`/rubrics/new`, `/rubrics/:id`) — heaviest editor
16. `RubricPreviewPage` (`/preview/:code` share link, no login) — public trust
17. `GradeStudent` (`/rubrics/:rubricId/grade/:studentId`) — core grading task
18. `ComparativeGrading` (`/grade-comparative/:classId/:rubricId`) — side-by-side grading
19. `SpeakingSession` (`/speaking/:rubricId/:studentId`) — live capture + recording

### Batch 4 — Feedback & peer

20. `SelfAssessPage` (`/rubrics/:rubricId/self-assess/:studentId`) — student self-rating
21. `PeerReviewView` (`/rubrics/:rubricId/peer-review/:studentId`) — peer task
22. `PeerReviewAnalyticsPage` (`/peer-analytics/:rubricId`) — agreement/outliers
23. `StudentFeedbackPage` (`/feedback/:code` share link) — read-only feedback
24. `CommentBankPage` (`/comments`) — reuse comments
25. `QuestionBankPage` (`/question-bank`) — reuse questions

### Batch 5 — Tests & essays

26. `TestListPage` (`/tests`) — test library
27. `TestBuilderPage` (`/tests/new`, `/tests/:id`) — incl. Placement/MST/Staircase modes
28. `StudentTestPage` (`/test/:code` share link) — timed, offline, adaptive, audio answers
29. `TestResultsPage` (`/tests/:testId/results/:studentTestId`) — scoring + CEFR path
30. `TestScoreSheetPage` (`/tests/:id/scores`) — class overview
31. `TestGradingQueuePage` (`/tests/:testId/grade`) — open-ended grading
32. `EssayListPage` (`/essays`) + `EssayBuilderPage` (`/essays/new`, `/essays/:teacherKey`)
33. `StudentEssayPage` (`/essay/:code` share link) — writing environment
34. `LiveMonitorPage` (`/tests/:testId/monitor` + `/essays/:assignmentId/monitor`) — live proctoring

### Batch 6 — Student portal world

35. `StudentPortalPage` (`/portal/:studentId`) — scroll-jump sections hub
36. `StudentCefrOverviewPage` (`/students/:id/cefr-overview`) + `CefrOverviewPage` (`/cefr-overview`) + `StudentLearningPathPage` (`/students/:id/learning-path`)
37. `VocabularyDashboardPage` (`/vocabulary`)
38. `FlashcardsPage` (`/flashcards`) + `FlashcardDeckPage` (`/flashcards/:id`) + `StudentFlashcardStudyPage` (`/portal/:studentId/flashcards/:deckId` FSRS study)
39. `StudentTestPage` embedded + `NewsFlashesPage` (`/news-flashes`)

### Batch 7 — Collaboration & system

40. `MarketplacePage` (`/marketplace`) — discover/install
41. `ModerationQueuePage` (`/moderation`) — trust & safety queue
42. `MessagesPage` (`/messages`) — teacher↔student messaging
43. `NotificationsPage` (`/notifications`) — vs bell redundancy?
44. `SettingsPage` (`/settings`) — incl. role switch, theme, language, local vs DB
45. `AdminPage` (`/admin`) — gated admin
46. `StudentPortalPage` teacher-preview (`/portal/:studentId` as teacher) — what teacher sees

### Batch 8 — Primitives & modals

- `ui/Modal`, `ui/ConfirmDialog`, `Modals/ReconcileModal`, `Modals/RubricVersionDiffModal`
- `ui/DropdownMenu`, `ui/HelpPopover`, `ui/SegmentedToggle`, `ui/ToggleChipGroup`, `ui/ClassFilterChips`, `ui/CardGrid/Tile/Grip`
- `ui/EmptyState`, `ui/Skeleton`, `ui/RouteSkeleton`, `ui/AppShellSkeleton`, `ui/TabbedPageSkeleton`, `ui/ErrorBoundary`, `ui/UpdateAvailableToast`, `ui/HydrationProgress`, `ui/SlipSheet`, `ui/CountdownTimer`, `ui/Avatar`, `ui/LanguageSelect`
- Domain modals/popovers to inventory per page: share-link generators, TestAssignment modal, grading comment pickers, audio recorder permissions, QR/share-code dialogs, TipTap toolbars, filter/sort controls.

## 3. Questions per page (extensive)

### Universal (ask on EVERY page)

- U1. What is the single primary task? Can a first-time user state it in 5 sec?
- U2. Is the next action visually primary and above the fold?
- U3. Empty/loading/error: does each state explain what to do next (not just "No data")?
- U4. Consistency: same buttons, headings, spacing, terminology as the rest of the app?
- U5. Mobile 360px: usable without horizontal scroll? Touch targets ≥44px? Sticky actions reachable?
- U6. Feedback: every consequential action confirms (toast/inline) or is silent?
- U7. Destructive actions guarded by ConfirmDialog with undo where possible?

### Batch 1

**Landing:** Does value prop + 1 CTA win in 5 sec? Login vs local-mode path clear? Visual parity with app theme?
**Onboarding:** Steps skippable/revisitable? Progress shown? Does finishing land on Dashboard with sample data or a dead empty state?
**404:** Does it say where you are, why, and 1-click home/back? Preserves nav or full dead-end?
**Privacy:** Readable hierarchy (not a wall)? Portal variant avoids double `<main>` landmark?
**Docs:** Searchable? Deep-linkable sections? Outdated screenshots?
**Shell:** Sidebar labels match routes? Active state obvious? Mobile drawer traps focus? Skip-link works with HashRouter? Tour doesn't re-trigger? Bell badge vs Notifications page duplicated?

### Batch 2

**Dashboard:** Top 3 teacher tasks reachable in 1 click? Widgets consistent? Tutorial vs real data conflict?
**ActivityDashboard vs Dashboard:** Why do both exist — overlap or distinct job? Which one should survive?
**Statistics:** Filters discoverable? Charts labeled, color-blind safe, readable on mobile? Export action near insight?
**StudentsPage:** Add/import/search bulk flows obvious? Email-link status visible? Roster empty state guides import?
**StudentProfile:** One story (progress → evidence → next step) or scattered tabs? CEFR badge meaning clear? Teacher vs student view leak?
**Attachments:** Previews work (PDF/DOCX/image)? Orphaned files surfaced? Upload progress + errors clear?
**Export:** Format choice explains consequences (PDF vs DOCX vs CSV)? Long-export progress/cancel?

### Batch 3

**RubricList:** Search/filter/sort mental model clear? New vs duplicate vs import distinguished? Card vs table density toggle needed?
**RubricBuilder:** Heaviest risk — levels/criteria drag clear? Autosave visible? Version diff discoverable? Validation blocks publish with inline reasons, not silent fail? TipTap toolbar consistent with Essay/Test builders? Keyboard-only authoring possible?
**Preview link:** Public page builds trust without login? No teacher-only data leaks? Print-friendly?
**GradeStudent:** Can you grade 30 students without losing place? Scores autosave + unsaved indicator? Comment bank 1-click? Remount-on-studentId loses draft?
**Comparative:** Side-by-side readable on laptop? ReconcileModal resolves conflicts clearly? Who-wins logic explained?
**Speaking:** Mic permission failure path? Recording state unmistakable? Transcript edit + scoring in one flow or context-switch hell?

### Batch 4

**SelfAssess:** Student wording vs teacher rubric jargon? Submit reversible? Teacher sees diff clearly?
**PeerReviewView:** Anonymity rules stated? Rubric simplified for peers? Incomplete-peer nudge?
**PeerAnalytics:** Agreement/outlier visuals actionable (not just pretty)? Drill-down to evidence?
**Feedback link:** Student understands score in 10 sec? Next-step guidance present? Mobile readable?
**CommentBank:** Insert-to-grading 1-click? Search/tag language (EN/NL)? Duplicates cleanup?
**QuestionBank:** Preview-before-insert? Level/CEFR tags accurate? Import-to-Test friction?

### Batch 5

**TestList:** Status (draft/published/assigned) glanceable? Share-code vs DB-assign confusion?
**TestBuilder:** Section→question hierarchy clear? Placement/MST/Staircase mode explained or footgun? Routing rules previewable? Auto-scorable count warning seen? Save/publish/assign distinct?
**StudentTest:** Timer + progress + flag palette clear? Offline/disconnect banner? Adaptive mode hides total appropriately? Audio-question recording fallback? Submit confirmation + receipt?
**TestResults:** Path-taken (placement) explained? Provisional CEFR badge caveats? Teacher override clear? Print/share?
**ScoreSheet:** Sort/filter by need (low scores, ungraded)? Bulk actions? Color scale accessible?
**GradingQueue:** Oldest-first? Rubric visible while grading writing? Save-next in 1 click?
**Essay list/builder:** Prompt + rubric + settings in one mental model? TeacherKey sharing understood?
**StudentEssay:** Distraction-free? Autosave + word count? Paste/template support? Submit lock-in clear?
**LiveMonitor:** Teacher sees who is stuck/offline in 5 sec? Nudge action feedback? Test vs essay mode consistent? Privacy (what students see when nudged)?

### Batch 6

**StudentPortal:** Scroll-jump sections discoverable? Work/flashcards/news/messages hierarchy for a 12-year-old? Teacher-preview vs student-view parity?
**CEFR ×3:** Provisional vs confirmed badges distinguished? Learning-path next step is 1 action, not a report dump?
**Vocabulary:** Dashboard answers "what to study next"? Level filters match CEFR pages?
**Flashcards ×3:** Deck → study loop obvious? FSRS scheduling explained in kid language? Embedded portal study vs standalone consistent? Empty deck state?
**NewsFlashes:** Reading level appropriate? TTS/audio? Link back to vocab/flashcards?

### Batch 7

**Marketplace:** Install vs preview vs permissions clear? Uninstall path? Quality/trust signals?
**Moderation:** Queue triage fast (approve/reject with reason in 2 clicks)? Policy visible? Audit trail?
**Messages:** Threads vs announcements? Unread handling? Student-safe (no free-contact leak)?
**Notifications:** Bell vs page — why both? Grouping, clearing, deep-links to source?
**Settings:** Role switch lock-out risk (#623) surfaced? Theme/language immediate? Local vs Supabase mode explained? Danger zone guarded?
**Admin:** Who can open it is obvious (no silent redirect to `/`)? Actions logged?

### Batch 8 — Primitives & modals

- Do all modals share one `Modal` (focus trap, Esc, overlay click, labelled)? Reconcile + VersionDiff conform?
- ConfirmDialog wording: action + consequence + safe default focus?
- Dropdowns keyboard-navigable? HelpPopovers not hover-only?
- EmptyStates all have icon + title + 1 action (no dead ends)?
- Skeletons match final layout (no CLS jump)? ErrorBoundary offers recovery, not just stack?
- Toasts: success/error/info distinct, action (Undo/View) where needed, not stacking forever?
- Toggles/chips/filters: selected state obvious, counts accurate?
- Cards/avatars/language select: consistent radius, type scale, truncation rules?
- Countdown/sync indicators: timezone-safe, offline-aware?

## 4. Next step

We start Batch 1 together: I drive, you react. Say the word and I open Landing → Onboarding → 404 → Privacy → Docs + Shell, asking the questions above live and filing Epic 1 findings as we go.
