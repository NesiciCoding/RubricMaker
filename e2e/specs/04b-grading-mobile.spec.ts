import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent } from '../fixtures/data.factory';
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
                        { id: 'lvl-exc', label: 'Excellent', minPoints: 3, maxPoints: 5, description: '', subItems: [] },
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
