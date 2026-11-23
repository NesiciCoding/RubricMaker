/**
 * Authoring flows added to the test builder's question editor: turning a selected word into a cloze gap,
 * pasting a worksheet with ____ blanks, and custom true/false wording. Runs in the default 1280px layout,
 * where each question is a card in the list.
 */
import { test, expect } from '../fixtures/app.fixture';
import { TestBuilderPage } from '../pages/TestBuilderPage';

const clozeEditor = (page: import('@playwright/test').Page) => page.locator('.cloze-gap-editor-content').first();

test.describe('test builder — question authoring', () => {
    test('a selected word becomes the gap, which carries a number', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();
        await builder.addQuestion('cloze');

        const editor = clozeEditor(appPage);
        await editor.fill('The cat sat on the mat');
        // Double-clicking a word selects exactly that word.
        await editor.getByText('The cat sat on the mat').dblclick({ position: { x: 28, y: 8 } });
        await appPage
            .getByRole('button', { name: /insert gap/i })
            .first()
            .click();

        const pills = appPage.locator('.cloze-gap-pill');
        await expect(pills).toHaveCount(1);
        await expect(pills.first()).toContainText('cat');
        await expect(editor).toContainText('The');
        await expect(editor).toContainText('sat on the mat');
        // The number is a CSS counter, which the browser reports as the expression rather than the resolved digit.
        const number = await pills.first().evaluate((el) => getComputedStyle(el, '::before').content);
        expect(number).toBe('counter(cloze-gap)');
    });

    test('pasting a worksheet with ____ blanks creates the gaps', async ({ appPage, browserName }) => {
        // A synthetic ClipboardEvent carrying text is only honoured by Chromium; the real paste is the same code path.
        test.skip(browserName !== 'chromium', 'synthetic paste events are not reliable outside Chromium');
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();
        await builder.addQuestion('cloze');

        const editor = clozeEditor(appPage);
        await editor.click();
        await editor.evaluate((el) => {
            const data = new DataTransfer();
            data.setData('text/plain', 'I ____ to ____ every day.');
            el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        });

        await expect(appPage.locator('.cloze-gap-pill')).toHaveCount(2);
        await expect(editor).toContainText('every day.');
    });

    test('a true/false question can use its own wording', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();
        await builder.addQuestion('true-false');

        const card = builder.questionCard(0);
        await card.getByLabel(/first button/i).fill('Yes');
        await card.getByLabel(/second button/i).fill('No');
        await expect(card.getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
        await expect(card.getByRole('button', { name: 'No', exact: true })).toBeVisible();
    });
});
