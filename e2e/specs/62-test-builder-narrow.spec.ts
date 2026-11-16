/**
 * Below 1400px the builder used to fall back to the stacked drag-and-drop column. It now keeps the
 * wide layout's focus pane, with a question switcher standing in for the outline rail and the
 * inspector as a bottom sheet (#1220). The 1280–1366 laptops teachers actually use are the target,
 * so this spec runs at 1280 with the default projects and pins 1024 in its own describe.
 */
import { test, expect } from '../fixtures/app.fixture';
import { TestBuilderPage } from '../pages/TestBuilderPage';

test.describe('test builder — narrow layout at 1280px', () => {
    test('switches questions, opens the drawer, runs the checks and shows the student view', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();

        // The rail needs the third zone; narrow screens get the switcher instead, once there is a
        // question to switch to.
        await expect(appPage.locator('nav[aria-labelledby="test-outline-heading"]')).toHaveCount(0);
        await builder.addQuestion('multiple-choice');
        await builder.addQuestion('short-answer');

        const switcher = appPage.getByTestId('question-switcher');
        await expect(switcher).toBeVisible();
        const select = switcher.getByTestId('switcher-select');
        const focus = appPage.getByTestId('question-focus');
        await expect(select.locator('option')).toHaveCount(2);
        // The new question opens, so the pane starts on the second one.
        await expect(focus).toContainText('Question 2');

        const promptEditor = () => focus.locator('.essay-editor-content, .cloze-gap-editor-content').first();
        await promptEditor().fill('Narrow layout question two');
        await expect(select.locator('option').nth(1)).toContainText('Narrow layout question two');

        // Switching from the select and from the prev/next buttons swaps the single editor.
        const firstOption = await select.locator('option').nth(0).getAttribute('value');
        await select.selectOption(firstOption!);
        await expect(focus).toContainText('Question 1');
        await switcher.getByTestId('switcher-next').click();
        await expect(focus).toContainText('Question 2');
        await expect(promptEditor()).toContainText('Narrow layout question two');

        // Nothing overflows sideways at 1280 with the switcher on screen.
        const overflow = await appPage.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow, 'the narrow builder scrolls sideways').toBeLessThanOrEqual(0);

        // Settings drawer.
        await appPage.getByTestId('settings-tile-delivery').click();
        await expect(appPage.getByTestId('settings-drawer')).toBeVisible();
        await appPage.getByTestId('settings-done').click();
        await expect(appPage.getByTestId('settings-drawer')).toHaveCount(0);

        // Checks screen, then jump back to the question it blocks on.
        await appPage.getByTestId('checks_open').click();
        const checks = appPage.getByTestId('checks-panel');
        await expect(checks).toBeVisible();
        await checks.locator('[data-testid^="checks-jump-"]').first().click();
        await expect(appPage.getByTestId('checks-panel')).toHaveCount(0);
        await expect(focus).toBeVisible();

        // The inspector is a bottom sheet below 1400px: the student view opens inside it.
        await appPage.getByTestId('a4-preview-toggle').click();
        const sheet = appPage.getByTestId('inspector-sheet');
        await expect(sheet).toBeVisible();
        await expect(appPage.getByTestId('inspector-column')).toHaveCount(0);
        await sheet.getByTestId('inspector-tab-question').click();
        const studentView = sheet.getByTestId('inspector-student-view');
        await expect(studentView).toBeVisible();
        await expect(studentView.getByTestId('answer-surface')).toBeVisible();

        // The sheet dismisses from its own button and from Escape.
        await sheet.getByTestId('inspector-sheet-close').click();
        await expect(appPage.getByTestId('inspector-sheet')).toHaveCount(0);
        await appPage.getByTestId('a4-preview-toggle').click();
        await expect(appPage.getByTestId('inspector-sheet')).toBeVisible();
        await appPage.keyboard.press('Escape');
        await expect(appPage.getByTestId('inspector-sheet')).toHaveCount(0);
    });
});

test.describe('test builder — narrow layout at 1024px', () => {
    test.use({ viewport: { width: 1024, height: 900 } });

    test('keeps the switcher and the sheet usable on the smallest supported laptop', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();

        await builder.addQuestion('multiple-choice');
        const switcher = appPage.getByTestId('question-switcher');
        await expect(switcher).toBeVisible();
        await expect(switcher.getByTestId('switcher-select').locator('option')).toHaveCount(1);

        // A section is reachable from the switcher as well as the questions.
        await appPage.getByPlaceholder(/section name/i).fill('Part A');
        await appPage.getByPlaceholder(/section name/i).press('Enter');
        const sections = switcher.getByTestId('switcher-sections');
        await expect(sections).toBeVisible();
        await expect(sections.getByRole('button', { name: 'Part A' })).toBeVisible();

        // Opening the section workspace shows it in the switcher instead of a stale question,
        // and picking a question leaves the workspace again.
        await sections.getByRole('button', { name: 'Part A' }).click();
        const select = switcher.getByTestId('switcher-select');
        await expect(select.locator('option')).toHaveCount(2);
        await expect(select).toHaveValue('');
        await expect(select).toContainText('Section workspace');
        await select.selectOption({ index: 1 });
        await expect(select).not.toHaveValue('');
        await expect(select.locator('option')).toHaveCount(1);

        const overflow = await appPage.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow, 'the builder scrolls sideways at 1024').toBeLessThanOrEqual(0);

        await appPage.getByTestId('a4-preview-toggle').click();
        const sheet = appPage.getByTestId('inspector-sheet');
        await expect(sheet).toBeVisible();
        await expect(sheet.getByTestId('inspector-tab-paper')).toBeVisible();
        await sheet.getByTestId('inspector-sheet-close').click();
        await expect(appPage.getByTestId('inspector-sheet')).toHaveCount(0);
    });
});

test.describe('test builder — undo and the autosaved draft', () => {
    test('undoes a delete and offers the draft back after a reload', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();
        await builder.addQuestion('multiple-choice');
        await builder.addQuestion('short-answer');

        const focus = appPage.getByTestId('question-focus');
        const select = appPage.getByTestId('question-switcher').getByTestId('switcher-select');
        await expect(select.locator('option')).toHaveCount(2);

        // Delete the open question, then put it back from the topbar.
        await focus.getByRole('button', { name: /remove question/i }).click();
        await expect(select.locator('option')).toHaveCount(1);
        await appPage.getByTestId('builder_undo').click();
        await expect(select.locator('option')).toHaveCount(2);
        await expect(appPage.getByTestId('builder_redo')).toBeEnabled();

        // Type into the first question, let the draft save, then lose the tab.
        const firstOption = await select.locator('option').nth(0).getAttribute('value');
        await select.selectOption(firstOption!);
        await expect(focus).toContainText('Question 1');
        await focus.locator('.essay-editor-content').first().fill('Draft that must survive');
        await expect(appPage.getByTestId('draft_status')).toHaveText(/draft saved/i);

        await appPage.reload();
        const banner = appPage.getByTestId('draft-banner');
        await expect(banner).toBeVisible();
        await banner.getByRole('button', { name: /restore draft/i }).click();
        await expect(banner).toHaveCount(0);
        await expect(focus.locator('.essay-editor-content').first()).toContainText('Draft that must survive');
    });
});
