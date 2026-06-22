/**
 * Item 23 — Co-grading & moderation (Phase 8.1 of the roadmap).
 *
 * A second-marker grade reuses the peer-review data model end to end: it is
 * a StudentRubric with isPeerReview=true and gradedBy set to the colleague's
 * name/email (distinguished from a real student peer review purely by
 * gradedBy not matching a known student id — see
 * src/utils/coGradingModerationQueue.ts's isSecondMarkerEntry heuristic).
 */
import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent, buildStudentRubric } from '../fixtures/data.factory';
import { GradeStudentPage } from '../pages/GradeStudentPage';
import { ModerationQueuePage } from '../pages/ModerationQueuePage';

test.describe('Co-grading & moderation', () => {
    test('disagreeing second-marker grade appears in the moderation queue with a per-criterion delta', async ({
        appPage,
        seedStorage,
    }) => {
        const cls = buildClass({ id: 'class-comod-1', name: 'Comod Class' });
        const rubric = buildRubric({ id: 'rubric-comod-1', name: 'Comod Rubric' });
        const student = buildStudent(cls.id, { id: 'student-comod-1', name: 'Disputed Student' });
        const baseline = buildStudentRubric(rubric, student, { id: 'sr-baseline-1', gradedBy: 'teacher-a' });
        const secondMarker = buildStudentRubric(rubric, student, {
            id: 'sr-second-1',
            isPeerReview: true,
            gradedBy: 'colleague@school.org',
            entries: [
                {
                    criterionId: rubric.criteria[0].id,
                    levelId: rubric.criteria[0].levels[3].id, // "Poor" — far from baseline's "Excellent"
                    comment: '',
                    checkedSubItems: [],
                },
            ],
        });
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
            rm_student_rubrics: [baseline],
            rm_peer_reviews: [secondMarker],
        });

        const page = new ModerationQueuePage(appPage);
        await page.goto();

        const card = page.disputeCard('Disputed Student');
        await expect(card).toBeVisible({ timeout: 5_000 });
        await expect(card).toContainText('Comod Rubric');
        await expect(card).toContainText('colleague@school.org');
    });

    test('agreeing second-marker grade does not appear', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'class-comod-2', name: 'Comod Class 2' });
        const rubric = buildRubric({ id: 'rubric-comod-2', name: 'Comod Rubric 2' });
        const student = buildStudent(cls.id, { id: 'student-comod-2', name: 'Agreed Student' });
        const baseline = buildStudentRubric(rubric, student, { id: 'sr-baseline-2', gradedBy: 'teacher-a' });
        const secondMarker = buildStudentRubric(rubric, student, {
            id: 'sr-second-2',
            isPeerReview: true,
            gradedBy: 'colleague@school.org',
        }); // same level as baseline (buildStudentRubric defaults to levels[0] for every entry)
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
            rm_student_rubrics: [baseline],
            rm_peer_reviews: [secondMarker],
        });

        const page = new ModerationQueuePage(appPage);
        await page.goto();

        await expect(page.emptyState()).toBeVisible({ timeout: 5_000 });
    });

    test('a real student peer review is never treated as a co-grading dispute', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'class-comod-3', name: 'Comod Class 3' });
        const rubric = buildRubric({ id: 'rubric-comod-3', name: 'Comod Rubric 3' });
        const student = buildStudent(cls.id, { id: 'student-comod-3', name: 'Peer Reviewed Student' });
        const reviewer = buildStudent(cls.id, { id: 'student-comod-3-reviewer', name: 'Peer Reviewer' });
        const baseline = buildStudentRubric(rubric, student, { id: 'sr-baseline-3', gradedBy: 'teacher-a' });
        const peerReview = buildStudentRubric(rubric, student, {
            id: 'sr-peer-3',
            isPeerReview: true,
            gradedBy: reviewer.id, // a real student id — not a co-grading colleague
            entries: [
                {
                    criterionId: rubric.criteria[0].id,
                    levelId: rubric.criteria[0].levels[3].id,
                    comment: '',
                    checkedSubItems: [],
                },
            ],
        });
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student, reviewer],
            rm_student_rubrics: [baseline],
            rm_peer_reviews: [peerReview],
        });

        const page = new ModerationQueuePage(appPage);
        await page.goto();

        await expect(page.emptyState()).toBeVisible({ timeout: 5_000 });
    });

    test('keeping the original grade removes the dispute from the queue', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'class-comod-4', name: 'Comod Class 4' });
        const rubric = buildRubric({ id: 'rubric-comod-4', name: 'Comod Rubric 4' });
        const student = buildStudent(cls.id, { id: 'student-comod-4', name: 'Resolvable Student' });
        const baseline = buildStudentRubric(rubric, student, { id: 'sr-baseline-4', gradedBy: 'teacher-a' });
        const secondMarker = buildStudentRubric(rubric, student, {
            id: 'sr-second-4',
            isPeerReview: true,
            gradedBy: 'colleague@school.org',
            entries: [
                {
                    criterionId: rubric.criteria[0].id,
                    levelId: rubric.criteria[0].levels[3].id,
                    comment: '',
                    checkedSubItems: [],
                },
            ],
        });
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
            rm_student_rubrics: [baseline],
            rm_peer_reviews: [secondMarker],
        });

        const page = new ModerationQueuePage(appPage);
        await page.goto();

        await expect(page.disputeCard('Resolvable Student')).toBeVisible({ timeout: 5_000 });
        await page.keepOriginal('Resolvable Student');
        await expect(page.emptyState()).toBeVisible({ timeout: 5_000 });
    });

    test('Co-grade button on a graded student opens the second-marker review screen', async ({
        appPage,
        seedStorage,
    }) => {
        const cls = buildClass({ id: 'class-comod-5', name: 'Comod Class 5' });
        const rubric = buildRubric({ id: 'rubric-comod-5', name: 'Comod Rubric 5' });
        const student = buildStudent(cls.id, { id: 'student-comod-5', name: 'Co-grade Launch Student' });
        const baseline = buildStudentRubric(rubric, student, { id: 'sr-baseline-5', gradedBy: 'teacher-a' });
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
            rm_student_rubrics: [baseline],
        });

        const gradePage = new GradeStudentPage(appPage);
        await gradePage.goto(rubric.id, student.id);

        await appPage.getByRole('button', { name: /co-grade/i }).click();
        await appPage.getByPlaceholder(/j\.smith@school\.org/i).fill('colleague@school.org');
        await appPage.getByRole('button', { name: /start co-grading/i }).click();

        await appPage.waitForURL(/\/peer-review\//, { timeout: 10_000 });
        await expect(appPage.getByText('Writing Quality')).toBeVisible({ timeout: 10_000 });
    });
});
