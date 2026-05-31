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

        await appPage.goto(`/grade-comparative/${cls.id}/${rubric.id}`);
        await expect(appPage.locator('.main-area')).toBeVisible({ timeout: 10_000 });
        await expect(appPage.getByText('Comp Student 1')).toBeVisible();
    });
});
