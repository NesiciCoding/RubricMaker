/**
 * Accessibility gate — every route, light and dark.
 *
 * Fails on axe-core serious/critical violations. Known, accepted debt is
 * recorded in e2e/a11y-baseline.json so this gate catches regressions without
 * blocking on the existing findings from docs/a11y/REPORT.md.
 *
 *   npm run e2e:a11y                 # gate (uses the baseline)
 *   A11Y_STRICT=1 npm run e2e:a11y   # zero tolerance, the end state
 *   A11Y_UPDATE_BASELINE=1 npm run e2e:a11y && npm run e2e:a11y:baseline
 */
import { test } from '@playwright/test';
import {
    A11Y_ROUTES,
    A11Y_THEMES,
    evaluateScan,
    loadBaseline,
    runAxe,
    seedApp,
    toScan,
    waitForRoute,
    writeBaselinePart,
} from '../fixtures/a11y.fixture';

const strict = process.env.A11Y_STRICT === '1';
const updateBaseline = process.env.A11Y_UPDATE_BASELINE === '1';

if (strict && updateBaseline) {
    throw new Error('A11Y_STRICT=1 and A11Y_UPDATE_BASELINE=1 are mutually exclusive');
}

test.describe('accessibility baseline', () => {
    test.skip(updateBaseline, 'baseline is being regenerated');

    test('covers every route in both themes', () => {
        const baseline = loadBaseline();
        const missing: string[] = [];
        for (const route of A11Y_ROUTES) {
            for (const theme of A11Y_THEMES) {
                if (!baseline.entries.some((entry) => entry.route === route.path && entry.theme === theme)) {
                    missing.push(`${theme} ${route.path}`);
                }
            }
        }
        // A missing row means a new route was added without re-baselining. Once
        // the debt is paid, delete the file and run strict mode instead.
        test.expect(missing, `No a11y baseline for:\n${missing.join('\n')}`).toEqual([]);
    });

    test('has no entries for routes that no longer exist', () => {
        const baseline = loadBaseline();
        const routes = new Set(A11Y_ROUTES.map((route) => route.path));
        const stale = baseline.entries
            .filter((entry) => !routes.has(entry.route))
            .map((entry) => `${entry.theme} ${entry.route}`);
        test.expect(stale, `Stale a11y baseline entries:\n${stale.join('\n')}`).toEqual([]);
    });
});

for (const theme of A11Y_THEMES) {
    test.describe(`accessibility — ${theme}`, () => {
        for (const route of A11Y_ROUTES) {
            test(`${route.label} (${route.path})`, async ({ page }) => {
                const pageErrors: string[] = [];
                page.on('pageerror', (error) => pageErrors.push(error.message));

                await seedApp(page, theme);
                await page.goto(`/#${route.path}`);
                await waitForRoute(page);

                const results = await runAxe(page);
                const scan = toScan(route, theme, page.url(), results);

                await test.info().attach('axe-results.json', {
                    body: JSON.stringify(scan, null, 2),
                    contentType: 'application/json',
                });

                test.expect(
                    pageErrors,
                    `Uncaught page errors made this scan unreliable:\n${pageErrors.join('\n')}`
                ).toEqual([]);

                if (updateBaseline) {
                    writeBaselinePart(scan);
                    return;
                }

                const evaluation = evaluateScan(scan, loadBaseline(), { strict });
                for (const improvement of evaluation.improvements) {
                    test.info().annotations.push({ type: 'a11y-baseline', description: improvement });
                }

                test.expect(
                    evaluation.failures,
                    `${evaluation.failures.length} accessibility violation(s) on ${theme} ${route.path}.\n` +
                        'Fix them, or re-baseline accepted debt with: A11Y_UPDATE_BASELINE=1 npm run e2e:a11y && npm run e2e:a11y:baseline\n\n' +
                        evaluation.failures.join('\n\n')
                ).toEqual([]);
            });
        }
    });
}
