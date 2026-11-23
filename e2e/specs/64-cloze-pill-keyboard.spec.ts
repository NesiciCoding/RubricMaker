/**
 * Gap pills in the cloze editor are real buttons for the keyboard: reachable with Tab, opened with Enter,
 * closed with Escape, and focus goes back to the pill instead of being lost.
 */
import { test, expect } from '../fixtures/app.fixture';
import { TestBuilderPage } from '../pages/TestBuilderPage';

test.describe('cloze editor — keyboard access to gap pills', () => {
    test('Tab reaches a pill, Enter opens its dialog and Escape returns focus to it', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();
        await builder.addQuestion('cloze');

        const editor = appPage.locator('.cloze-gap-editor-content').first();
        await editor.click();
        await appPage
            .getByRole('button', { name: /insert gap/i })
            .first()
            .click();

        const pill = appPage.locator('.cloze-gap-pill').first();
        await expect(pill).toHaveAttribute('role', 'button');
        await expect(pill).toHaveAccessibleName(/edit gap/i);

        await pill.focus();
        await expect(pill).toBeFocused();
        await appPage.keyboard.press('Enter');

        const dialog = appPage.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('textbox').first()).toBeFocused();

        await appPage.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(pill).toBeFocused();
    });
});
