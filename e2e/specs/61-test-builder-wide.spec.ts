/**
 * The test builder's three-zone layout (outline rail, focus pane, inspector) only exists at
 * ≥1400px. Every other spec runs at 1280, so nothing exercised it in a real browser and axe never
 * saw the rail, the settings drawer, the checks screen or the inspector tablist (#1217).
 *
 * This spec runs in the `wide` and `wide-firefox` projects (1500×1000) only — the 1280 projects
 * ignore it — and both are part of CI's e2e shards.
 */
import { test, expect } from '../fixtures/app.fixture';
import type { Locator } from '@playwright/test';
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

test.describe('test builder — A4 preview toolbar (#1275)', () => {
    const toolbarButtons = '.tiptap-toolbar .toolbar-btn';

    async function toolbarState(sheet: Locator): Promise<{ zoom: number; inverse: number }> {
        return sheet.evaluate((page) => ({
            zoom: Number.parseFloat(page.style.getPropertyValue('zoom')),
            inverse: Number.parseFloat(page.style.getPropertyValue('--a4-zoom')),
        }));
    }

    // The page keeps its print scale, so at 0.3 a toolbar that shrank with the sheet would measure
    // 7.8 px, and one that escaped the sheet's zoom entirely would measure 87 px. axe only gates
    // the 24 px AA rule (both failures can still clear it at some scales), so assert the 26 px.
    async function expectAuthoredToolbarSize(sheet: Locator, zoom: number): Promise<void> {
        await expect.poll(async () => (await toolbarState(sheet)).zoom).toBeCloseTo(zoom, 2);
        const { inverse } = await toolbarState(sheet);
        expect(inverse).toBeCloseTo(1 / zoom, 2);

        const buttons = sheet.locator(toolbarButtons);
        await expect(buttons).toHaveCount(12);
        const sizes = await buttons.evaluateAll((elements) =>
            elements.map((button) => {
                const box = button.getBoundingClientRect();
                return { width: box.width, height: box.height };
            })
        );
        for (const size of sizes) {
            expect(Math.abs(size.width - 26), `button width at zoom ${zoom}`).toBeLessThanOrEqual(1);
            expect(Math.abs(size.height - 26), `button height at zoom ${zoom}`).toBeLessThanOrEqual(1);
        }
    }

    async function expectToolbarsClearOfText(sheet: Locator, zoom: number): Promise<void> {
        const frames = await sheet.evaluate((page) => {
            const rect = (node: Element) => {
                const box = node.getBoundingClientRect();
                return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
            };
            return [...page.querySelectorAll('.a4-preview-editable')].map((editor) => ({
                editor: rect(editor),
                toolbar: rect(editor.querySelector('.tiptap-toolbar')!),
                text: rect(editor.querySelector('.tiptap-editor-content')!),
            }));
        });

        expect(frames).toHaveLength(3);
        for (const { editor, toolbar, text } of frames) {
            const slack = 1;
            // The counter-scaled toolbar has to stay inside its editor frame rather than spill over
            // the printed page, and it has to sit beside the text, never on top of it.
            expect(toolbar.left).toBeGreaterThanOrEqual(editor.left - slack);
            expect(toolbar.top).toBeGreaterThanOrEqual(editor.top - slack);
            expect(toolbar.right).toBeLessThanOrEqual(editor.right + slack);
            expect(toolbar.bottom).toBeLessThanOrEqual(editor.bottom + slack);
            expect(
                text.top >= toolbar.bottom - slack || text.bottom <= toolbar.top + slack,
                `the toolbar covers the page text at zoom ${zoom}`
            ).toBe(true);
        }
    }

    test('keeps its buttons at 26 px and clear of the page text at min and max zoom', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();

        const sheet = appPage.getByTestId('a4-page');
        await expect(sheet).toBeVisible();

        const zoomOut = appPage.getByTestId('a4-zoom-out');
        const zoomIn = appPage.getByTestId('a4-zoom-in');

        for (let i = 0; i < 12; i += 1) await zoomOut.click();
        await expectAuthoredToolbarSize(sheet, 0.3);
        await expectToolbarsClearOfText(sheet, 0.3);

        // Enough steps to clamp at the 1.5 maximum whatever the fit scale was.
        for (let i = 0; i < 30; i += 1) await zoomIn.click();
        await expectAuthoredToolbarSize(sheet, 1.5);
        await expectToolbarsClearOfText(sheet, 1.5);
    });
});

test.describe('test builder — keyboard authoring (#1214)', () => {
    test('adds, jumps and lists the shortcuts without a mouse', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();

        const focus = appPage.getByTestId('question-focus');
        const rail = appPage.locator('nav[aria-labelledby="test-outline-heading"]');
        const rows = rail.locator('[data-testid^="outline-question-"]');

        // N opens the type picker; the question it creates opens in the focus pane.
        await appPage.locator('body').click({ position: { x: 5, y: 5 } });
        await appPage.keyboard.press('n');
        await appPage.locator('[data-question-type="multiple-choice"]').click();
        await appPage.keyboard.press('n');
        await appPage.locator('[data-question-type="short-answer"]').click();
        await expect(rows).toHaveCount(2);
        await expect(focus).toContainText('Question 2');

        // Alt+Up opens the previous question and puts focus on its heading, announced.
        await appPage.keyboard.press('Alt+ArrowUp');
        await expect(focus).toContainText('Question 1');
        await expect(appPage.locator('[id^="question-heading-"]:focus')).toHaveCount(1);

        // Ctrl+K is the builder's jump, not the topbar's search: a number goes to that question.
        await appPage.keyboard.press('Control+k');
        await appPage.getByTestId('quick-jump-input').fill('2');
        await appPage.keyboard.press('Enter');
        await expect(focus).toContainText('Question 2');

        // ? lists the shortcuts and Escape closes the list again.
        await appPage.keyboard.press('Shift+Slash');
        await expect(appPage.getByTestId('shortcuts-list')).toBeVisible();
        await expect(appPage.getByTestId('shortcuts-list')).toContainText('Alt+↓');
        await appPage.keyboard.press('Escape');
        await expect(appPage.getByTestId('shortcuts-list')).toHaveCount(0);

        // The outline keeps a single tab stop, and the arrow keys move it.
        await expect(rail.locator('[data-tree-row][tabindex="0"]')).toHaveCount(1);
    });
});
