import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent } from '../fixtures/data.factory';
import { PeerReviewViewPage } from '../pages/PeerReviewViewPage';

test.describe('Peer review submission', () => {
    test('a reviewer scores a peer, saves, and the review persists across reload', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'pr-class', name: 'PR Class' });
        const rubric = buildRubric({ id: 'pr-rubric', name: 'PR Rubric' });
        const student = buildStudent(cls.id, { id: 'pr-student', name: 'Reviewed Student' });

        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
        });

        const page = new PeerReviewViewPage(appPage);
        await page.goto(rubric.id, student.id);

        await expect(appPage.getByText('Reviewed Student')).toBeVisible();
        await page.selectLevel(0, 'Good');
        await page.fillCriterionComment(0, 'Nice structure and clear argument.');
        await page.save();
        await page.waitForSaved();

        await appPage.reload();
        await expect(appPage.locator('.card.selectable.active')).toContainText('Good');
        await expect(appPage.locator('.ProseMirror').first()).toContainText('Nice structure and clear argument.');
    });

    test('adding a round starts a fresh, independently-scored entry', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'pr-class-2', name: 'PR Class 2' });
        const rubric = buildRubric({ id: 'pr-rubric-2', name: 'PR Rubric 2' });
        const student = buildStudent(cls.id, { id: 'pr-student-2', name: 'Round Student' });

        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
        });

        const page = new PeerReviewViewPage(appPage);
        await page.goto(rubric.id, student.id);

        await page.selectLevel(0, 'Excellent');
        await page.save();
        await page.waitForSaved();

        await page.addRound();
        await expect(page.roundButton(2)).toBeVisible();
        await expect(appPage.locator('.card.selectable.active')).toHaveCount(0);

        await page.selectLevel(0, 'Poor');
        await page.save();
        await page.waitForSaved();

        await page.selectRound(1);
        await expect(appPage.locator('.card.selectable.active')).toContainText('Excellent');
    });

    test('view analytics button navigates to the peer review analytics page', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'pr-class-3', name: 'PR Class 3' });
        const rubric = buildRubric({ id: 'pr-rubric-3', name: 'PR Rubric 3' });
        const student = buildStudent(cls.id, { id: 'pr-student-3', name: 'Analytics Nav Student' });

        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
        });

        const page = new PeerReviewViewPage(appPage);
        await page.goto(rubric.id, student.id);
        await page.goToAnalytics();

        await expect(appPage).toHaveURL(new RegExp(`/peer-analytics/${rubric.id}`));
    });
});
