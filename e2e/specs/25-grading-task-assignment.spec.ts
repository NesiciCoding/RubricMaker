/**
 * Item 25 — Grading task assignment (Phase 8.3 of the roadmap).
 *
 * From the Activity Dashboard, a teacher can batch-assign a class's ungraded
 * submissions for a rubric to a specific colleague. Tasks are derived state
 * (no separate "done" flag): a task disappears once a matching StudentRubric
 * exists for that student/rubric (see src/utils/coGradingModerationQueue.ts-
 * adjacent logic in ActivityDashboardPage.tsx's `pendingTasks` memo).
 */
import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent, buildStudentRubric } from '../fixtures/data.factory';
import { ActivityDashboardPage } from '../pages/ActivityDashboardPage';

test.describe('Grading task assignment', () => {
    test('assigning an ungraded cell creates a pending task that persists after reload', async ({
        appPage,
        seedStorage,
    }) => {
        const cls = buildClass({ id: 'class-task-1', name: 'Task Class' });
        const rubric = buildRubric({ id: 'rubric-task-1', name: 'Task Rubric' });
        const student = buildStudent(cls.id, { id: 'student-task-1', name: 'Ungraded Student' });
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
        });

        const page = new ActivityDashboardPage(appPage);
        await page.goto();

        await page.clickAssign('Task Rubric');
        await page.fillAssignTeacher('colleague@school.org');
        await page.confirmAssign();

        await expect(page.pendingTasksPanel()).toBeVisible({ timeout: 5_000 });
        await expect(page.pendingTasksPanel()).toContainText('Ungraded Student');
        await expect(page.pendingTasksPanel()).toContainText('colleague@school.org');

        await appPage.reload();
        await expect(page.pendingTasksPanel()).toBeVisible({ timeout: 10_000 });
        await expect(page.pendingTasksPanel()).toContainText('Ungraded Student');
    });

    test('deleting a pending task removes it', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'class-task-2', name: 'Task Class 2' });
        const rubric = buildRubric({ id: 'rubric-task-2', name: 'Task Rubric 2' });
        const student = buildStudent(cls.id, { id: 'student-task-2', name: 'Another Student' });
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
            rm_grading_tasks: [
                {
                    id: 'gt-1',
                    rubricId: rubric.id,
                    studentId: student.id,
                    assignedToTeacher: 'colleague@school.org',
                    assignedAt: new Date().toISOString(),
                },
            ],
        });

        const page = new ActivityDashboardPage(appPage);
        await page.goto();

        await expect(page.pendingTasksPanel()).toBeVisible({ timeout: 5_000 });
        await page.deletePendingTask();
        await expect(page.pendingTasksPanel()).not.toBeVisible({ timeout: 5_000 });
    });

    test('a task is not shown once the student has been graded', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'class-task-3', name: 'Task Class 3' });
        const rubric = buildRubric({ id: 'rubric-task-3', name: 'Task Rubric 3' });
        const student = buildStudent(cls.id, { id: 'student-task-3', name: 'Graded Student' });
        const studentRubric = buildStudentRubric(rubric, student);
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
            rm_student_rubrics: [studentRubric],
            rm_grading_tasks: [
                {
                    id: 'gt-2',
                    rubricId: rubric.id,
                    studentId: student.id,
                    assignedToTeacher: 'colleague@school.org',
                    assignedAt: new Date().toISOString(),
                },
            ],
        });

        const page = new ActivityDashboardPage(appPage);
        await page.goto();

        await expect(page.pendingTasksPanel()).not.toBeVisible({ timeout: 5_000 });
    });
});
