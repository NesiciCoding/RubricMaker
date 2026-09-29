import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent, buildStudentRubric } from '../fixtures/data.factory';

test.describe('Comparative grading (smoke)', () => {
    test('comparative grading page loads with seeded students', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'comp-class', name: 'Comp Class' });
        const rubric = buildRubric({ id: 'comp-rubric', name: 'Comp Rubric' });
        const s1 = buildStudent(cls.id, { id: 'comp-s1', name: 'Comp Student 1' });
        const s2 = buildStudent(cls.id, { id: 'comp-s2', name: 'Comp Student 2' });
        const sr1 = buildStudentRubric(rubric, s1);
        const sr2 = buildStudentRubric(rubric, s2);

        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [s1, s2],
            rm_student_rubrics: [sr1, sr2],
        });

        // Hash-only navigation doesn't reload the page, so React never re-reads the
        // seeded localStorage — force a reload, mirroring BasePage.navigate()'s fix
        // for the same issue.
        await appPage.goto(`/#/grade-comparative/${cls.id}/${rubric.id}`);
        await appPage.reload();
        await expect(appPage.locator('.main-area')).toBeVisible({ timeout: 10_000 });
        await expect(appPage.getByRole('heading', { name: 'Comp Student 1' })).toBeVisible();
    });

    test('a completed matchup persists across reload and enforces the per-student cap', async ({
        appPage,
        seedStorage,
    }) => {
        // A per-rubric limit of 1, with one matchup already completed (and persisted) between
        // s1 and s2, means both are already at their cap before the page even loads — proving
        // the count comes from storage, not a browser-session-only in-memory counter.
        const cls = buildClass({ id: 'comp-class-2', name: 'Comp Class 2' });
        const rubric = buildRubric({ id: 'comp-rubric-2', name: 'Comp Rubric 2', comparativeMatchupLimit: 1 });
        const s1 = buildStudent(cls.id, { id: 'comp-s3', name: 'Comp Student 3' });
        const s2 = buildStudent(cls.id, { id: 'comp-s4', name: 'Comp Student 4' });
        const s3 = buildStudent(cls.id, { id: 'comp-s5', name: 'Comp Student 5' });

        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [s1, s2, s3],
            rm_student_rubrics: [],
            rm_comparative_matchups: [
                {
                    id: 'comp-m1',
                    rubricId: rubric.id,
                    studentAId: s1.id,
                    studentBId: s2.id,
                    gradedAt: new Date().toISOString(),
                },
            ],
        });

        await appPage.goto(`/#/grade-comparative/${cls.id}/${rubric.id}`);
        await appPage.reload();
        // With s1 and s2 already at the limit, only s3 remains eligible — fewer than the 2
        // needed for a matchup, so the session opens straight into "complete" on first load.
        await expect(appPage.getByText('Session Complete')).toBeVisible({ timeout: 10_000 });
    });
});
