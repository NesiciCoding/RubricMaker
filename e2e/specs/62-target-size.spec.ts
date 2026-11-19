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
 * `.toolbar-btn`, `.nav-item`, the field rules) or from the widget clusters fixed in the 2.5.5
 * closeout: the class/cohort/status chip rows, `SegmentedToggle`, the sortable table headers, the
 * profile tabs, the Docs rail and the question editor's inline formatting toolbar. Every other
 * cluster still under 44 px is measured and listed in REPORT §10; add its routes here as it is fixed.
 *
 * A control is skipped when it is not a target at all: `pointer-events: none` behind a styled
 * proxy button, transparent, or too small to paint (the colour `<input>`s the editor opens from a
 * toolbar button render as 2×2 px with `pointer-events: none`).
 *
 *   npm run e2e:target-size
 */
import { test, type Page } from '@playwright/test';
import { A11Y_ROUTES, seedApp, waitForRoute } from '../fixtures/a11y.fixture';

const TARGET = 44;

/**
 * Routes whose controls are all at the 44 px floor: the builders, every page carrying the chip rows
 * or the Cards/List toggle, the sortable student table, the profile tabs, the Docs rail and the
 * question editor's toolbar.
 */
const TARGET_SIZE_ROUTES = [
    // Builders: every control comes from a shared primitive.
    '/rubrics/new',
    '/rubrics/rubric-a11y-1',
    '/tests/new',
    '/essays/new',
    '/essays/essay-a11y-1',
    // Chip rows and the Cards/List toggles.
    '/rubrics',
    '/tests',
    '/rubrics/rubric-a11y-1/grade',
    '/cefr-overview',
    '/grammar-overview',
    '/vocabulary',
    // Cohort chips + sortable table headers.
    '/students',
    // Overview / Portfolio tabs.
    '/students/student-a11y-1',
    // Section rail.
    '/docs',
    // The question editor's inline formatting toolbar.
    '/tests/test-a11y-1',
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
        if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') continue;
        if (Number(style.opacity) === 0) continue;
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
    test('every audited route exists in A11Y_ROUTES', () => {
        // A typo in TARGET_SIZE_ROUTES would otherwise shrink the audit silently.
        test.expect(ROUTES.map((route) => route.path).sort()).toEqual([...TARGET_SIZE_ROUTES].sort());
    });

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
