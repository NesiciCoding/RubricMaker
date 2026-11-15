import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent, buildStudentRubric } from '../fixtures/data.factory';
import { GradeStudentPage } from '../pages/GradeStudentPage';

const RUBRIC_ID = 'rubric-criterion-menu';
const PREVIOUS_ID = 'student-criterion-menu-previous';
const CURRENT_ID = 'student-criterion-menu-current';

const CRITERION_MENU = /criterion actions/i;

/** The one criterion card of the seeded rubric (the card layout, which is the default). */
function card(page: import('@playwright/test').Page) {
    return page.locator('.card.print-criterion').first();
}

test.describe('Grading criterion card context menu', () => {
    test.beforeEach(async ({ seedStorage }) => {
        const cls = buildClass({ id: 'class-criterion-menu', name: 'Menu Class' });
        const rubric = buildRubric({ id: RUBRIC_ID, name: 'Menu Rubric' });
        const previous = buildStudent(cls.id, { id: PREVIOUS_ID, name: 'Bram de Vries' });
        const current = buildStudent(cls.id, { id: CURRENT_ID, name: 'Anna Bakker' });
        const criterion = rubric.criteria[0];
        const previousGrade = buildStudentRubric(rubric, previous, {
            entries: [
                {
                    criterionId: criterion.id,
                    levelId: criterion.levels[0].id,
                    comment: '<p>Clear opening</p>',
                    checkedSubItems: [],
                },
            ],
        });
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [previous, current],
            rm_student_rubrics: [previousGrade],
        });
    });

    test('right-clicking a criterion card opens its actions', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto(RUBRIC_ID, CURRENT_ID);
        await expect(card(appPage)).toBeVisible({ timeout: 10_000 });

        await card(appPage).getByText('Writing Quality').click({ button: 'right' });

        const menu = appPage.getByRole('menu', { name: CRITERION_MENU });
        await expect(menu).toBeVisible();
        await expect(menu.getByRole('menuitem', { name: /open comment bank/i })).toBeVisible();
        // Nothing typed yet, so there is nothing to copy.
        await expect(menu.getByRole('menuitem', { name: /copy feedback/i })).toBeDisabled();
    });

    test('the menu opens from the keyboard with Shift+F10', async ({ appPage, browserName }) => {
        // Only Chromium turns a synthetic Shift+F10 into a contextmenu event; Firefox and WebKit leave that to the OS.
        test.skip(
            browserName !== 'chromium',
            'Shift+F10 does not raise contextmenu through Playwright outside Chromium'
        );
        const page = new GradeStudentPage(appPage);
        await page.goto(RUBRIC_ID, CURRENT_ID);
        await expect(card(appPage)).toBeVisible({ timeout: 10_000 });

        await card(appPage)
            .getByTitle(/open comment bank/i)
            .focus();
        await appPage.keyboard.press('Shift+F10');

        await expect(appPage.getByRole('menu', { name: CRITERION_MENU })).toBeVisible();
    });

    test('copies the feedback typed into the composer', async ({ appPage }) => {
        await appPage.addInitScript(() => {
            const copied: string[] = [];
            (window as unknown as { __copied: string[] }).__copied = copied;
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: {
                    writeText: (text: string) => {
                        copied.push(text);
                        return Promise.resolve();
                    },
                },
            });
        });
        const page = new GradeStudentPage(appPage);
        await page.goto(RUBRIC_ID, CURRENT_ID);
        await card(appPage)
            .getByTitle(/open comment bank/i)
            .click();

        const editor = card(appPage).locator('.ProseMirror[contenteditable="true"]');
        await editor.click();
        await appPage.keyboard.type('Strong thesis');

        await card(appPage).getByText('Writing Quality').click({ button: 'right' });
        await appPage.getByRole('menuitem', { name: /copy feedback/i }).click();

        await expect(appPage.getByRole('alert')).toContainText(/feedback copied/i);
        expect(await appPage.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([
            'Strong thesis',
        ]);
    });

    test('inserts the previous student feedback into the open composer', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto(RUBRIC_ID, CURRENT_ID);
        await card(appPage)
            .getByTitle(/open comment bank/i)
            .click();

        const editor = card(appPage).locator('.ProseMirror[contenteditable="true"]');
        await editor.click();

        await card(appPage).getByText('Writing Quality').click({ button: 'right' });
        await appPage.getByRole('menuitem', { name: /Bram de Vries/i }).click();

        await expect(editor).toContainText('Clear opening');
    });

    test('leaves the native menu alone inside the comment composer', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto(RUBRIC_ID, CURRENT_ID);
        await card(appPage)
            .getByTitle(/open comment bank/i)
            .click();

        await card(appPage).locator('.ProseMirror[contenteditable="true"]').click({ button: 'right' });

        await expect(appPage.getByRole('menu', { name: CRITERION_MENU })).toHaveCount(0);
    });

    test('the grid detail panel sets a level from the menu', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto(RUBRIC_ID, CURRENT_ID);
        await expect(card(appPage)).toBeVisible({ timeout: 10_000 });

        await appPage.getByRole('button', { name: /grid/i }).click();
        await appPage.locator('.grid-cell-btn').first().click();

        const panel = appPage.locator('.grading-detail');
        await expect(panel).toBeVisible();
        await panel.getByText('Writing Quality').first().click({ button: 'right' });

        await expect(appPage.getByRole('menuitemradio')).toHaveCount(4);
        await expect(appPage.getByRole('menuitemradio', { name: /Excellent/ })).toHaveAttribute('aria-checked', 'true');

        await appPage.getByRole('menuitemradio', { name: /Set level: Good/ }).click();
        await expect(panel.getByText('Good', { exact: true }).first()).toBeVisible();
    });
});
