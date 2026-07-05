import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent, buildStudentRubric } from '../fixtures/data.factory';
import { PeerReviewAnalyticsPage } from '../pages/PeerReviewAnalyticsPage';

test.describe('Peer review analytics', () => {
    test('empty state shown when no peer reviews exist yet', async ({ appPage, seedStorage }) => {
        const rubric = buildRubric({ id: 'pra-empty-rubric', name: 'Empty Rubric' });
        await seedStorage({ rm_rubrics: [rubric] });

        const page = new PeerReviewAnalyticsPage(appPage);
        await page.goto(rubric.id);

        await expect(page.emptyState()).toBeVisible();
    });

    test('reviewer table and round filter reflect seeded multi-round reviews', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'pra-class', name: 'PRA Class' });
        const rubric = buildRubric({ id: 'pra-rubric', name: 'PRA Rubric' });
        const criterionId = rubric.criteria[0].id;
        const goodLevelId = rubric.criteria[0].levels[1].id; // Good
        const excellentLevelId = rubric.criteria[0].levels[0].id; // Excellent
        const student1 = buildStudent(cls.id, { id: 'pra-s1', name: 'PRA Student 1' });
        const student2 = buildStudent(cls.id, { id: 'pra-s2', name: 'PRA Student 2' });
        const reviewer = buildStudent(cls.id, { id: 'pra-reviewer', name: 'PRA Reviewer' });

        const baseline1 = buildStudentRubric(rubric, student1, { id: 'pra-baseline-1', gradedBy: 'teacher' });
        const baseline2 = buildStudentRubric(rubric, student2, { id: 'pra-baseline-2', gradedBy: 'teacher' });

        const round1Review = {
            ...buildStudentRubric(rubric, student1, {
                id: 'pra-review-r1',
                isPeerReview: true,
                round: 1,
                gradedBy: reviewer.id,
                entries: [{ criterionId, levelId: goodLevelId, comment: 'Solid effort', checkedSubItems: [] }],
            }),
        };
        const round2Review = {
            ...buildStudentRubric(rubric, student2, {
                id: 'pra-review-r2',
                isPeerReview: true,
                round: 2,
                gradedBy: reviewer.id,
                entries: [{ criterionId, levelId: excellentLevelId, comment: 'Even better', checkedSubItems: [] }],
            }),
        };

        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student1, student2, reviewer],
            rm_student_rubrics: [baseline1, baseline2],
            rm_peer_reviews: [round1Review, round2Review],
        });

        const page = new PeerReviewAnalyticsPage(appPage);
        await page.goto(rubric.id);

        await expect(page.reviewerRows()).toHaveCount(1);
        await expect(page.reviewerRows().first()).toContainText('PRA Reviewer');
        await expect(page.reviewerRows().first()).toContainText('2'); // reviewCount

        await page.selectRound(1);
        await expect(page.reviewerRows()).toHaveCount(1);
        await expect(page.reviewerRows().first()).toContainText('1');

        await page.selectRound('all');
        await expect(page.reviewerRows().first()).toContainText('2');
    });
});
