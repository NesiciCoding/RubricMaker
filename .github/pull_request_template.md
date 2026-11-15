<!--
Fill in what applies and delete the rest. Keep it short: reviewers read the diff,
so use this to explain the *why* and to point at anything non-obvious.
-->

<!--
PR title format (Conventional Commits): `type(scope): imperative summary`
- type:  feat | fix | docs | refactor | perf | test | build | ci | chore
- scope: the area touched, e.g. grading, rubrics, live-writing, supabase, a11y (optional)
- summary: lowercase, imperative, no trailing period, under ~72 characters
Examples: `feat(grading): add a rubric grading queue`
          `fix(students): open the row Grade menu in a portal`
Breaking change? Add `!` after the scope: `feat(store)!: ...`
-->

## Summary

<!-- What does this change, and why? Link the issue: "Closes #123". -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup (no behaviour change)
- [ ] Performance
- [ ] Docs / CI / tooling
- [ ] Database migration or edge function (`supabase/`)

## How to test

<!-- Steps a reviewer can follow, or the tests that cover it. -->

## Screenshots / recordings

<!-- For UI changes: before/after, in light and dark theme. Delete if not applicable. -->

## Checklist

**Quality gates**

- [ ] PR title follows `type(scope): summary` (see the format at the top)
- [ ] `npm run check` passes (typecheck, lint, format, unit tests)
- [ ] Tests added or updated; coverage thresholds still met
- [ ] Playwright e2e added or updated for user-facing flows (`e2e/specs/`)
- [ ] New routes added to `A11Y_ROUTES`; no new accessibility violations (`npm run e2e:a11y`)

**Conventions** (see `CLAUDE.md`)

- [ ] User-visible strings use `t()` and keys exist in all locales (en, nl, fr, de, es)
- [ ] Persistence goes through `src/store/storage.ts` / `StorageSync`; no direct `localStorage` writes
- [ ] State is read via the domain hooks (`useRoster`, `useAuthoring`, …); no new state library
- [ ] No AI/LLM content-generation features

**Documentation** (required for user-facing changes)

- [ ] `src/pages/DocsPage.tsx` updated (tab content and `ROUTE_TREE` for new routes)
- [ ] `README.md` updated (Routes table, Features, Key utility modules)
- [ ] `src/pages/LandingPage.tsx` updated if a significant teacher/student feature changed
- [ ] Not applicable: no user-facing change

**Supabase** (only if `supabase/` changed — see `supabase/CLAUDE.md`)

- [ ] Migration is numbered sequentially and includes RLS policies for new tables
- [ ] Works with `npm run db:reset` and `npm run e2e:supabase`
- [ ] App still runs offline (without `VITE_SUPABASE_URL`) with reduced capabilities

## Notes for reviewers

<!-- Risks, trade-offs, follow-ups, or areas where you'd like extra scrutiny. Delete if empty. -->
