/**
 * Target size audit — WCAG 2.5.5 (AAA), 44×44 CSS px.
 *
 * The stylesheet guards (`src/__tests__/targetSizeCss.test.ts`) can only prove that a rule *says*
 * 44 px. This spec measures what the browser actually paints, on the routes with the densest
 * controls, at a desktop and a phone width — which is the only way to catch a target shrunk by an
 * inline `style`, a transform, or a container that reflows.
 *
 * Scope: buttons and form controls. Inline prose links are exempt under 2.5.5 (they are targets
 * only within a sentence), and checkboxes/radios take their hit area from the `<label>` wrapping
 * them, so both are out of scope here and listed in docs/a11y/REPORT.md §10 instead.
 *
 * The route list is the pages whose controls are all built from the shared primitives (`.btn`,
 * `.toolbar-btn`, `.nav-item`, the field rules). The component-level widgets that are still under
 * 44 px — the Cards/List toggles, the cohort chips, the sortable table headers, the Docs rail — are
 * measured and listed in REPORT §10; add their routes here as each one is fixed.
 *
 *   npm run e2e:target-size
 */
import { test, type Page } from '@playwright/test';
import { A11Y_ROUTES, seedApp, waitForRoute } from '../fixtures/a11y.fixture';

const TARGET = 44;

/** The builders: every control they render comes from the shared primitives. */
const TARGET_SIZE_ROUTES = [
    '/rubrics/new',
    '/rubrics/rubric-a11y-1',
    '/tests/new',
    '/essays/new',
    '/essays/essay-a11y-1',
];

const ROUTES = A11Y_ROUTES.filter((route) => TARGET_SIZE_ROUTES.includes(route.path));

type UndersizedTarget = { element: string; text: string; width: number; height: number };

const measure = (minimum: number): UndersizedTarget[] => {
    const CONTROL =
        'button, [role="button"], input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea';

    const describe = (element: Element): string => {
        const parts: string[] = [];
        let node: Element | null = element;
        while (node && node !== document.body && parts.length < 4) {
            const classes = [...node.classList].slice(0, 3).join('.');
            parts.unshift(
                `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${classes ? `.${classes}` : ''}`
            );
            node = node.parentElement;
        }
        return parts.join(' > ');
    };

    const undersized: UndersizedTarget[] = [];
    for (const element of document.querySelectorAll(CONTROL)) {
        if (element.closest('[inert], [hidden], [aria-hidden="true"]')) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        if (rect.width + 0.5 >= minimum && rect.height + 0.5 >= minimum) continue;
        undersized.push({
            element: describe(element),
            text: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40),
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
        });
    }
    return undersized;
};

async function audit(page: Page, route: string): Promise<UndersizedTarget[]> {
    await page.goto(`/#${route}`);
    await waitForRoute(page);
    return page.evaluate(measure, TARGET);
}

test.describe('44 px targets (WCAG 2.5.5)', () => {
    for (const route of ROUTES) {
        test(`${route.label} (${route.path})`, async ({ page }, testInfo) => {
            await seedApp(page, 'light');
            const undersized = await audit(page, route.path);
            const viewport = testInfo.project.use.viewport;
            const label = viewport ? `${viewport.width}×${viewport.height}` : 'default viewport';

            test.expect(
                undersized,
                `${undersized.length} control(s) under ${TARGET}×${TARGET} px on ${route.path} at ${label}:\n` +
                    undersized
                        .slice(0, 12)
                        .map((target) => `  ${target.width}×${target.height} — ${target.element} “${target.text}”`)
                        .join('\n') +
                    (undersized.length > 12 ? `\n  …and ${undersized.length - 12} more` : '')
            ).toEqual([]);
        });
    }
});
