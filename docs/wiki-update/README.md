# Wiki update patches (2026-11-19)

These four patches update the GitHub wiki (`RubricMaker.wiki`). They were prepared in a session that could not push to the wiki, so they are applied by hand. Apply them in order; they touch only Markdown.

```bash
# 1. Clone the wiki (a separate repo)
git clone https://github.com/NesiciCoding/RubricMaker.wiki.git
cd RubricMaker.wiki
git log --oneline -1          # should be 4a22e43 "chore: refresh wiki screenshots (2026-11-11)"

# 2. Apply the patches from this repo checkout (adjust the path)
git am /path/to/RubricMaker/docs/wiki-update/000*.patch

# 3. Check, then push to the wiki's master branch
git log --oneline -5
git push origin master
```

If the wiki has changed since 4a22e43 and `git am` stops with a conflict, run `git am --abort`, then `git pull --rebase origin master` and try again; resolve conflicts in the listed files (mostly `Features.md`, `Home.md`, `_Sidebar.md`).

What the patches do:

1. Audit fixes (sharing model, migration count, FSRS version, Live Writing), `Features` split into short overview + deep-dive articles, one article per question type, Placement testing, Live Writing, Sharing & Co-teaching, Admin Dashboard, Research Agenda.
2. Adds the _Research Findings_ page.
3. Second research pass: other Dutch CEFR sources, more findings.
4. Reflects the new select-all / hot-text scoring rule and the staircase explanation.

After pushing, delete this folder (the patches are no longer needed). Tracking issues: #1266 (deviations) and #1268 (unresearched questions).
