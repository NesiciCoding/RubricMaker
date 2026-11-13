import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent, buildStudentRubric } from '../fixtures/data.factory';
import { GradeStudentPage } from '../pages/GradeStudentPage';

// This spec only runs on the `mobile-chrome` project (see playwright.config.ts);
// it is ignored by the desktop projects.

test.describe('Mobile grading (touch viewport)', () => {
    test.beforeEach(async ({ seedStorage }) => {
        const cls = buildClass({ name: 'Test Class' });
        // The touch stepper only renders alongside a point-range slider, so give
        // the first level a min≠max range.
        const rubric = buildRubric({
            id: 'rubric-grade-mobile',
            name: 'Grade Mobile Rubric',
            totalMaxPoints: 5,
            criteria: [
                {
                    id: 'crit-mobile',
                    title: 'Writing Quality',
                    description: '',
                    weight: 100,
                    levels: [
                        {
                            id: 'lvl-exc',
                            label: 'Excellent',
                            minPoints: 3,
                            maxPoints: 5,
                            description: '',
                            subItems: [],
                        },
                        { id: 'lvl-good', label: 'Good', minPoints: 1, maxPoints: 2, description: '', subItems: [] },
                    ],
                },
            ],
        });
        const student = buildStudent(cls.id, { id: 'student-grade-mobile', name: 'Grade Mobile Student' });
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
        });
    });

    test('touch stepper is visible after selecting a level', async ({ appPage }) => {
        // The stepper is gated on `@media (hover: none)`; emulate a touch device
        // since headless Chromium doesn't report it from the Pixel 5 descriptor alone.
        const cdp = await appPage.context().newCDPSession(appPage);
        await cdp.send('Emulation.setEmulatedMedia', {
            features: [
                { name: 'hover', value: 'none' },
                { name: 'pointer', value: 'coarse' },
            ],
        });

        const page = new GradeStudentPage(appPage);
        await page.goto('rubric-grade-mobile', 'student-grade-mobile');

        await page.selectLevel(0, 'Excellent');

        await expect(page.getStepper().first()).toBeVisible({ timeout: 10_000 });
    });

    test('sticky grade footer is visible after grading', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto('rubric-grade-mobile', 'student-grade-mobile');

        await page.selectLevel(0, 'Excellent');

        await expect(page.getGradeFooter()).toBeVisible({ timeout: 10_000 });
    });
});

test.describe('Mobile rubric grading queue', () => {
    const rubric = buildRubric({ id: 'rubric-queue-mobile', name: 'Queue Mobile Rubric' });
    const cls = buildClass({ id: 'class-queue-mobile', name: 'Queue 3A', rubricIds: [rubric.id] });
    const graded = buildStudent(cls.id, { id: 'queue-graded', name: 'Amara Okafor' });
    const ungraded = buildStudent(cls.id, { id: 'queue-ungraded', name: 'Bram de Vries' });
    const notHandedIn = buildStudent(cls.id, { id: 'queue-not-handed-in', name: 'Cara Martin' });

    test.beforeEach(async ({ seedStorage }) => {
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [graded, ungraded, notHandedIn],
            rm_student_rubrics: [
                buildStudentRubric(rubric, graded),
                buildStudentRubric(rubric, notHandedIn, {
                    notHandedIn: true,
                    gradedAt: undefined,
                    entries: rubric.criteria.map((criterion) => ({
                        criterionId: criterion.id,
                        levelId: null,
                        comment: '',
                        checkedSubItems: [],
                    })),
                }),
            ],
        });
    });

    test('list keeps every Grade/Open action visible and named for its student', async ({ appPage }) => {
        await appPage.goto(`/#/rubrics/${rubric.id}/grade`);
        await appPage.reload();
        await appPage.waitForSelector('.main-area', { timeout: 20_000 });
        await expect(appPage.getByRole('heading', { name: /students graded/ })).toBeVisible({ timeout: 10_000 });

        await appPage.getByRole('button', { name: 'List' }).click();
        await expect(appPage.getByRole('table')).toBeVisible();

        await expect(appPage.locator('.queue-col-class').first()).toBeHidden();
        await expect(appPage.locator('.queue-col-score').first()).toBeHidden();

        const viewport = appPage.viewportSize();
        expect(viewport).not.toBeNull();
        const viewportWidth = viewport!.width;
        const actions = [
            { name: 'Open Amara Okafor', href: `/rubrics/${rubric.id}/grade/${graded.id}` },
            { name: 'Grade Bram de Vries', href: `/rubrics/${rubric.id}/grade/${ungraded.id}` },
            { name: 'Grade Cara Martin', href: `/rubrics/${rubric.id}/grade/${notHandedIn.id}` },
        ];

        for (const action of actions) {
            const link = appPage.getByRole('link', { name: action.name });
            await expect(link).toHaveAttribute('href', `#${action.href}`);
            await link.scrollIntoViewIfNeeded();
            await expect(link).toBeInViewport();
            const box = await link.boundingBox();
            expect(box, `${action.name} has no layout box`).not.toBeNull();
            expect(box!.x, `${action.name} starts off-screen`).toBeGreaterThanOrEqual(0);
            expect(box!.x + box!.width, `${action.name} extends past the viewport`).toBeLessThanOrEqual(
                viewportWidth + 1
            );
        }

        const overflow = await appPage.evaluate(() => {
            const content = document.querySelector('.page-content');
            return {
                page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                content: content ? content.scrollWidth - content.clientWidth : 0,
            };
        });
        expect(overflow.page, 'the queue page scrolls horizontally').toBeLessThanOrEqual(1);
        expect(overflow.content, 'the queue list scrolls horizontally').toBeLessThanOrEqual(1);
    });
});
