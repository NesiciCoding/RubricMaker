/**
 * Item 42 — Activity Dashboard matrix (roadmap Phase 4).
 *
 * `25-grading-task-assignment.spec.ts` already covers the grading-task
 * assign/delete sub-feature (Phase 8.3), but the dashboard's own core
 * purpose — the activity × class submission matrix, the rubric link/unlink
 * toggle, and the year/track filters — had zero coverage. Found while
 * auditing routes for coverage gaps after closing out items 36-41.
 * Offline-capable (no Supabase needed).
 */
import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent, buildStudentRubric } from '../fixtures/data.factory';
import { ActivityDashboardPage } from '../pages/ActivityDashboardPage';

test.describe('Activity Dashboard', () => {
    test('shows an empty state with no rubrics, tests, or essays', async ({ appPage }) => {
        const page = new ActivityDashboardPage(appPage);
        await page.goto();
        await expect(page.emptyState()).toBeVisible();
    });

    test('the matrix shows submission progress, and linking a rubric to a class toggles the button', async ({
        appPage,
        seedStorage,
    }) => {
        const cls = buildClass({ id: 'class-ad-1', name: 'Matrix Class' });
        const rubric = buildRubric({ id: 'rubric-ad-1', name: 'Matrix Rubric' });
        const student = buildStudent(cls.id, { id: 'student-ad-1', name: 'Matrix Student' });
        await seedStorage({ rm_classes: [cls], rm_rubrics: [rubric], rm_students: [student] });

        const page = new ActivityDashboardPage(appPage);
        await page.goto();

        // Not yet linked: 0 of 1 student submitted, "Link" offered.
        await expect(page.cell('Matrix Rubric')).toContainText('0/1');
        await expect(page.cell('Matrix Rubric').getByRole('button', { name: 'Link' })).toBeVisible();

        await page.toggleLink('Matrix Rubric');
        await expect(page.cell('Matrix Rubric').getByRole('button', { name: 'Unlink' })).toBeVisible({
            timeout: 5_000,
        });
    });

    test('a graded student is reflected in the submission count', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'class-ad-2', name: 'Graded Class' });
        const rubric = buildRubric({ id: 'rubric-ad-2', name: 'Graded Rubric' });
        const student = buildStudent(cls.id, { id: 'student-ad-2', name: 'Graded Student' });
        const studentRubric = buildStudentRubric(rubric, student);
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
            rm_student_rubrics: [studentRubric],
        });

        const page = new ActivityDashboardPage(appPage);
        await page.goto();

        await expect(page.cell('Graded Rubric')).toContainText('1/1');
    });

    test('the year filter narrows which class columns are shown', async ({ appPage, seedStorage }) => {
        const year1Class = buildClass({ id: 'class-ad-y1', name: 'Jaar 1 Class', year: 'jaar-1' });
        const year2Class = buildClass({ id: 'class-ad-y2', name: 'Jaar 2 Class', year: 'jaar-2' });
        const rubric = buildRubric({ id: 'rubric-ad-year', name: 'Year Filter Rubric' });
        await seedStorage({ rm_classes: [year1Class, year2Class], rm_rubrics: [rubric] });

        const page = new ActivityDashboardPage(appPage);
        await page.goto();

        // "Jaar 1 Class" also matches option text in the sidebar's Active-class select and
        // the Standards Coverage select — scope to the matrix's own column header.
        const year1Header = appPage.getByRole('columnheader', { name: /Jaar 1 Class/ });
        const year2Header = appPage.getByRole('columnheader', { name: /Jaar 2 Class/ });
        await expect(year1Header).toBeVisible();
        await expect(year2Header).toBeVisible();

        await page.selectYearFilter('Jaar 1');

        await expect(year1Header).toBeVisible();
        await expect(year2Header).not.toBeVisible();
    });
});
