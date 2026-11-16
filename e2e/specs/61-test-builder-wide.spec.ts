/**
 * The test builder's three-zone layout (outline rail, focus pane, inspector) only exists at
 * ≥1400px. Every other spec runs at 1280, so nothing exercised it in a real browser and axe never
 * saw the rail, the settings drawer, the checks screen or the inspector tablist (#1217).
 *
 * This spec runs in the `wide` project (1500×1000) only — the 1280 projects ignore it.
 */
import { test, expect } from '../fixtures/app.fixture';
import { TestBuilderPage } from '../pages/TestBuilderPage';
import {
    A11Y_THEMES,
    A11Y_WIDE_ROUTES,
    A11Y_WIDE_VIEWPORT,
    evaluateScan,
    loadBaseline,
    runAxe,
    seedApp,
    toScan,
    waitForRoute,
} from '../fixtures/a11y.fixture';

test.use({ viewport: A11Y_WIDE_VIEWPORT });

test.describe('test builder — wide layout', () => {
    test('rail, question switching, drawer, checks screen and inspector all work at 1500px', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();

        const rail = appPage.locator('nav[aria-labelledby="test-outline-heading"]');
        await expect(rail, 'the outline rail is missing at 1500px').toBeVisible();
        await expect(
            appPage.getByTestId('inspector-column'),
            'the inspector column is missing at 1500px'
        ).toBeVisible();

        const focus = appPage.getByTestId('question-focus');
        const rows = rail.locator('[data-testid^="outline-question-"]');
        // The focus pane holds one editor at a time here, so address it directly instead of through
        // TestBuilderPage.questionCard(index) — that filter matches the "Question 1 / 2" header.
        const promptEditor = () => focus.locator('.essay-editor-content, .cloze-gap-editor-content').first();

        // Adding from the rail opens the shared type picker.
        await rail.getByRole('button', { name: /add question/i }).click();
        await appPage.locator('[data-question-type="multiple-choice"]').click();
        await expect(rows).toHaveCount(1);

        await rail.getByRole('button', { name: /add question/i }).click();
        await appPage.locator('[data-question-type="short-answer"]').click();
        await expect(rows).toHaveCount(2);

        // Each row opens its question in the focus pane, which is the only editor mounted here.
        // Wait for the pane to show that question before typing: the swap is a React render behind
        // the click, and typing into the previous editor would land the text on the wrong question.
        await rows.nth(0).click();
        await expect(focus).toContainText('Question 1');
        await promptEditor().fill('Wide layout question one');
        await expect(rows.nth(0)).toContainText('Wide layout question one');

        await rows.nth(1).click();
        await expect(focus).toContainText('Question 2');
        await promptEditor().fill('Wide layout question two');
        await expect(rows.nth(1)).toContainText('Wide layout question two');

        // The rail is a switcher: opening the first question puts it back in the focus pane.
        await rows.nth(0).click();
        await expect(focus).toContainText('Wide layout question one');

        // Settings drawer, opened from the rail footer and from a setup tile.
        await appPage.getByTestId('outline_settings').click();
        await expect(appPage.getByTestId('settings-drawer')).toBeVisible();
        await appPage.getByTestId('settings-done').click();
        await expect(appPage.getByTestId('settings-drawer')).toHaveCount(0);

        await appPage.getByTestId('settings-tile-delivery').click();
        await expect(appPage.getByTestId('settings-drawer')).toBeVisible();
        await appPage.getByTestId('settings-done').click();

        // Checks screen lists the blocker and its jump really changes the open question: open the
        // second question first, then jump to the blocker, which belongs to the first one.
        await rows.nth(1).click();
        await expect(focus).toContainText('Wide layout question two');
        await appPage.getByTestId('checks_open').click();
        const checks = appPage.getByTestId('checks-panel');
        await expect(checks).toBeVisible();
        const blockerRow = checks.locator('[data-testid^="checks-row-"]').first();
        await expect(blockerRow, 'the unfinished first question has to be a blocker').toBeVisible();
        const blockerId = ((await blockerRow.getAttribute('data-testid')) ?? '').replace('checks-row-', '');
        await checks.getByTestId(`checks-jump-${blockerId}`).click();
        await expect(appPage.getByTestId('checks-panel')).toHaveCount(0);
        await expect(focus).toBeVisible();
        await expect(focus).toContainText('Wide layout question one');
        await expect(focus).not.toContainText('Wide layout question two');
        // The rail marks the same question as current, so the jump opened the blocker, not just any pane.
        await expect(rail.getByTestId(`outline-question-${blockerId}`)).toHaveAttribute('aria-current', 'true');

        // Inspector: the student view previews the open question, the paper tab still renders.
        await appPage.getByTestId('inspector-tab-question').click();
        const studentView = appPage.getByTestId('inspector-student-view');
        await expect(studentView).toBeVisible();
        await expect(studentView.getByTestId('answer-surface')).toBeVisible();
        await expect(studentView.locator('input, select, textarea, button').first()).toBeVisible();

        await appPage.getByTestId('inspector-tab-paper').click();
        await expect(appPage.getByTestId('a4-pane')).toBeVisible();
        await expect(appPage.getByTestId('inspector-column')).toBeVisible();

        // The columns are resizable: drag the rail's seam wider.
        const outline = appPage.locator('nav[aria-labelledby="test-outline-heading"]');
        const railWidth = (await outline.boundingBox())!.width;
        const seamBox = (await appPage.getByTestId('rail-resizer').boundingBox())!;
        await appPage.mouse.move(seamBox.x + seamBox.width / 2, seamBox.y + 60);
        await appPage.mouse.down();
        await appPage.mouse.move(seamBox.x + seamBox.width / 2 + 60, seamBox.y + 60, { steps: 4 });
        await appPage.mouse.up();
        await expect.poll(async () => (await outline.boundingBox())!.width).toBeGreaterThan(railWidth + 40);

        // The same handle works from the keyboard (Shift for a bigger step).
        const inspector = appPage.getByTestId('inspector-column');
        const inspectorWidth = (await inspector.boundingBox())!.width;
        await appPage.getByTestId('inspector-resizer').focus();
        await appPage.keyboard.press('Shift+ArrowLeft');
        await expect.poll(async () => (await inspector.boundingBox())!.width).toBeGreaterThan(inspectorWidth + 30);

        // Either side pane can take the whole pane and hand it back.
        await appPage.getByTestId('inspector_expand').click();
        await expect(outline).toHaveCount(0);
        await expect(appPage.getByTestId('question-focus')).toBeHidden();
        await expect(appPage.getByTestId('rail-resizer')).toHaveCount(0);
        expect((await inspector.boundingBox())!.width).toBeGreaterThan(inspectorWidth + 200);
        await appPage.getByTestId('inspector_expand').click();
        await expect(outline).toBeVisible();
        await expect(appPage.getByTestId('inspector-resizer')).toBeVisible();
    });
});

test.describe('test builder — accessibility at 1500px', () => {
    test.skip(process.env.A11Y_UPDATE_BASELINE === '1', 'baseline is being regenerated by the 1280 gate');

    for (const theme of A11Y_THEMES) {
        for (const route of A11Y_WIDE_ROUTES) {
            test(`${route.label} (${route.path}) — ${theme}`, async ({ appPage }) => {
                const pageErrors: string[] = [];
                appPage.on('pageerror', (error) => pageErrors.push(error.message));

                await seedApp(appPage, theme);
                await appPage.goto(`/#${route.path}`);
                await waitForRoute(appPage);

                const scan = toScan(route, theme, appPage.url(), await runAxe(appPage));
                await test.info().attach('axe-results.json', {
                    body: JSON.stringify(scan, null, 2),
                    contentType: 'application/json',
                });

                expect(pageErrors, `Uncaught page errors made this scan unreliable:\n${pageErrors.join('\n')}`).toEqual(
                    []
                );

                // The wide layout reuses the route's baseline entry: at 1500px it may not introduce a
                // rule the narrow layout does not already have, nor grow a baselined rule's node count.
                const evaluation = evaluateScan(scan, loadBaseline(), { strict: process.env.A11Y_STRICT === '1' });
                expect(
                    evaluation.failures,
                    `${evaluation.failures.length} accessibility violation(s) in the wide layout of ${route.path} ` +
                        `(${theme}).\n\n${evaluation.failures.join('\n\n')}`
                ).toEqual([]);
            });
        }
    }
});
