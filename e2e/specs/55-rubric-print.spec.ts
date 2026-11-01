/**
 * "Print Rubric" in the editor prints the whole sheet (#1004).
 *
 * It used to call `window.print()` on the builder itself, so the dialog showed one viewport of the
 * app — sidebar, toolbar and the top sliver of the rubric — instead of the rubric. It now goes
 * through the same blank-rubric document as "Export PDF", which is what this spec holds it to: the
 * print frame must carry the title and every criterion, not whatever happened to be on screen.
 */
import { test, expect } from '../fixtures/app.fixture';
import { buildRubric } from '../fixtures/data.factory';
import type { RubricCriterion } from '../../src/types';

const criterion = (id: string, title: string): RubricCriterion => ({
    id,
    title,
    description: '',
    weight: 33,
    levels: [
        {
            id: `${id}-high`,
            label: 'Excellent',
            minPoints: 3,
            maxPoints: 4,
            description: 'Does this well',
            subItems: [],
        },
        { id: `${id}-low`, label: 'Not yet', minPoints: 0, maxPoints: 2, description: 'Needs work', subItems: [] },
    ],
});

test.describe('Print Rubric', () => {
    test('prints the whole rubric instead of the visible editor', async ({ appPage, seedStorage }) => {
        const rubric = buildRubric({
            id: 'print-check',
            name: 'Print check rubric',
            criteria: [
                criterion('pc1', 'Criterion Alpha'),
                criterion('pc2', 'Criterion Beta'),
                criterion('pc3', 'Criterion Gamma'),
            ],
        });
        await seedStorage({ rm_rubrics: [rubric] });

        await appPage.goto('/#/rubrics/print-check');
        await appPage.reload();
        await appPage.waitForSelector('.main-area');

        // Keep the print frame's document: the flow tears the frame down once the dialog is done.
        await appPage.evaluate(() => {
            const store = window as unknown as { __printed: string };
            store.__printed = '';
            const grab = () => {
                const html = document.querySelector('iframe')?.contentDocument?.documentElement?.innerHTML;
                if (html && html.includes('Criterion Alpha')) store.__printed = html;
            };
            new MutationObserver(grab).observe(document.body, { childList: true });
            setInterval(grab, 10);
        });

        await appPage.getByRole('button', { name: /^Export$/ }).click();
        await appPage.getByRole('menuitem', { name: /Print Rubric/i }).click();

        await expect
            .poll(() => appPage.evaluate(() => (window as unknown as { __printed: string }).__printed), {
                timeout: 15_000,
            })
            .toContain('Print check rubric');

        const printed = await appPage.evaluate(() => (window as unknown as { __printed: string }).__printed);
        // Every criterion, including the ones far below the fold of the builder.
        for (const title of ['Criterion Alpha', 'Criterion Beta', 'Criterion Gamma']) {
            expect(printed, title).toContain(title);
        }
        // The level columns come from the first criterion's levels and are shared by the grid.
        expect(printed).toContain('Excellent');
        expect(printed).toContain('Does this well');
        // A4 portrait, as the rubric's format asks for.
        expect(printed).toContain('size: portrait');
        // The app chrome never reaches the page.
        expect(printed).not.toContain('rubricBuilder');
    });
});
