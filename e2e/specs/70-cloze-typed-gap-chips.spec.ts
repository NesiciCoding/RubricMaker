/** Typed cloze gaps list their accepted answers as chips: add several at once, remove one, save with Enter. */
import { test, expect } from '../fixtures/app.fixture';
import { TestBuilderPage } from '../pages/TestBuilderPage';

test.describe('cloze editor — typed gap answers as chips', () => {
    test('answers are added, removed and saved as chips', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();
        await builder.addQuestion('cloze');

        await appPage.locator('.cloze-gap-editor-content').first().click();
        await appPage
            .getByRole('button', { name: /insert gap/i })
            .first()
            .click();
        const pill = appPage.locator('.cloze-gap-pill').first();
        await pill.focus();
        await appPage.keyboard.press('Enter');

        const dialog = appPage.getByRole('dialog');
        const chips = dialog.locator('.cloze-gap-popover-chip');
        await expect(chips).toHaveCount(1);

        const input = dialog.getByRole('textbox').first();
        await input.fill('go|goes');
        await input.press('Enter');
        await expect(chips).toHaveCount(3);

        await dialog
            .getByRole('button', { name: /remove answer/i })
            .first()
            .click();
        await expect(chips).toHaveCount(2);

        // Enter on the now-empty box saves; the pill shows the first remaining answer with the extras counted.
        await input.press('Enter');
        await expect(dialog).toBeHidden();
        // The default answer was removed, so `go` is first and `goes` is the one extra.
        await expect(pill).toHaveText('go+1');
    });
});
