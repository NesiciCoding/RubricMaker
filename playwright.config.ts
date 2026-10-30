import { defineConfig, devices } from '@playwright/test';
import quarantine from './e2e/quarantine.json' with { type: 'json' };
import { APP_ORIGIN, DEV_SERVER_PORT, reuseExistingServer } from './e2e/appUrl';

// Flaky-spec quarantine: specs listed in e2e/quarantine.json (as
// "<file>.spec.ts" with a reason) are excluded from every gating project so
// they can't block the pipeline, and are run by the weekly Quarantine Check
// workflow (project below) which unquarantines them once they're stable.
// Add a spec here with a reason instead of deleting it.
const quarantinePatterns = quarantine.map((q) => `**/${q.spec}`);

export default defineConfig({
    testDir: './e2e/specs',
    // Fails the run when the port answers for a different checkout (#1015) instead of quietly
    // testing another worktree's code.
    globalSetup: './e2e/global-setup.ts',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: [
        ['list'],
        ['github'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['junit', { outputFile: 'playwright-results/results.xml' }],
    ],
    use: {
        // This checkout's own origin: 5173 for the first checkout, a stable neighbour for extra
        // worktrees. E2E_PORT or E2E_BASE_URL override it.
        baseURL: APP_ORIGIN,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'on-first-retry',
        headless: true,
        viewport: { width: 1280, height: 900 },
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            testIgnore: [
                '**/14-supabase-sync.spec.ts',
                '**/15-offline-startup.spec.ts',
                '**/16-rls-anon.spec.ts',
                '**/17-offline-sync-merge.spec.ts',
                '**/18-multi-device-sync.spec.ts',
                '**/20-essay-import-db.spec.ts',
                '**/04b-grading-mobile.spec.ts',
                '**/24-department-sharing.spec.ts',
                '**/34-speaking-session.spec.ts',
                '**/35-admin-dashboard.spec.ts',
                '**/36-marketplace.spec.ts',
                '**/37-live-monitor.spec.ts',
                '**/45-essay-monitor.spec.ts',
                '**/47-security-hardening.spec.ts',
                '**/48-profile-grade-policies.spec.ts',
                '**/49-retention-anonymization.spec.ts',
                '**/50-owner-data-backup.spec.ts',
                '**/51-a11y.spec.ts',
                ...quarantinePatterns,
            ],
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            testIgnore: [
                '**/14-supabase-sync.spec.ts',
                '**/15-offline-startup.spec.ts',
                '**/16-rls-anon.spec.ts',
                '**/17-offline-sync-merge.spec.ts',
                '**/18-multi-device-sync.spec.ts',
                '**/20-essay-import-db.spec.ts',
                '**/04b-grading-mobile.spec.ts',
                '**/24-department-sharing.spec.ts',
                '**/34-speaking-session.spec.ts',
                '**/35-admin-dashboard.spec.ts',
                '**/36-marketplace.spec.ts',
                '**/37-live-monitor.spec.ts',
                '**/45-essay-monitor.spec.ts',
                '**/47-security-hardening.spec.ts',
                '**/48-profile-grade-policies.spec.ts',
                '**/49-retention-anonymization.spec.ts',
                '**/50-owner-data-backup.spec.ts',
                '**/51-a11y.spec.ts',
                ...quarantinePatterns,
            ],
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
            testIgnore: [
                '**/14-supabase-sync.spec.ts',
                '**/15-offline-startup.spec.ts',
                '**/16-rls-anon.spec.ts',
                '**/17-offline-sync-merge.spec.ts',
                '**/18-multi-device-sync.spec.ts',
                '**/20-essay-import-db.spec.ts',
                '**/04b-grading-mobile.spec.ts',
                '**/24-department-sharing.spec.ts',
                '**/34-speaking-session.spec.ts',
                '**/35-admin-dashboard.spec.ts',
                '**/36-marketplace.spec.ts',
                '**/37-live-monitor.spec.ts',
                '**/45-essay-monitor.spec.ts',
                '**/47-security-hardening.spec.ts',
                '**/48-profile-grade-policies.spec.ts',
                '**/49-retention-anonymization.spec.ts',
                '**/50-owner-data-backup.spec.ts',
                '**/51-a11y.spec.ts',
                ...quarantinePatterns,
            ],
        },
        // Accessibility gate — every route in light and dark mode, axe-core
        // serious/critical only. Uses the baseline in e2e/a11y-baseline.json so
        // the gate blocks regressions without re-failing on known debt.
        // Run with: npm run e2e:a11y
        {
            name: 'a11y',
            use: { ...devices['Desktop Chrome'], reducedMotion: 'reduce' },
            testMatch: ['**/51-a11y.spec.ts'],
            testIgnore: [...quarantinePatterns],
        },
        // Speaking session recording — needs a fake camera/mic so MediaRecorder
        // has a stream to capture instead of hanging on a permission prompt.
        {
            name: 'chromium-fake-media',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: {
                    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
                },
            },
            testMatch: ['**/34-speaking-session.spec.ts'],
            testIgnore: [...quarantinePatterns],
        },
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 5'] },
            testMatch: [
                '**/01-local-mode.spec.ts',
                '**/04-grading.spec.ts',
                '**/04b-grading-mobile.spec.ts',
                '**/12-navigation.spec.ts',
            ],
            testIgnore: [...quarantinePatterns],
        },
        // Supabase integration tests — require `npm run db:start` before running.
        // Run with: npm run e2e:supabase
        {
            name: 'supabase',
            use: { ...devices['Desktop Chrome'] },
            testMatch: [
                '**/14-supabase-sync.spec.ts',
                '**/15-offline-startup.spec.ts',
                '**/16-rls-anon.spec.ts',
                '**/17-offline-sync-merge.spec.ts',
                '**/18-multi-device-sync.spec.ts',
                '**/20-essay-import-db.spec.ts',
                '**/24-department-sharing.spec.ts',
                '**/35-admin-dashboard.spec.ts',
                '**/36-marketplace.spec.ts',
                '**/37-live-monitor.spec.ts',
                '**/45-essay-monitor.spec.ts',
                '**/47-security-hardening.spec.ts',
                '**/48-profile-grade-policies.spec.ts',
                '**/49-retention-anonymization.spec.ts',
                '**/50-owner-data-backup.spec.ts',
            ],
            testIgnore: [...quarantinePatterns],
        },
        // Runs ONLY the quarantined specs (Desktop Chrome + fake media, since
        // recording specs are the usual flaky suspects). Not part of the gating
        // run — the weekly Quarantine Check workflow uses this project to
        // verify quarantined specs are stable again before unquarantining them.
        // With an empty e2e/quarantine.json this project matches nothing and
        // `--project=quarantine` exits 1 unless `--pass-with-no-tests` is
        // passed — the weekly workflow guards the empty list explicitly.
        {
            name: 'quarantine',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: {
                    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
                },
            },
            testMatch: quarantinePatterns,
        },
    ],
    // With an explicit E2E_BASE_URL the suite must not start (or need) a local server.
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              // --strictPort: if something else already holds the port, fail instead of silently
              // moving to another one that Playwright would never wait for.
              // --host 127.0.0.1: bind one address family explicitly. With the default `localhost`
              // Vite binds whichever family resolves first (`[::1]` on many Linux images), and the
              // identity probe in `e2e/global-setup.ts` then has to guess the same one (#1015).
              command: `npm run dev -- --port ${DEV_SERVER_PORT} --strictPort --host 127.0.0.1`,
              url: APP_ORIGIN,
              // Never default to reusing a server: it used to be the local default, and a server on
              // a fixed port from another checkout then made every run a false green (#1015).
              // Reuse is opt-in (E2E_REUSE_SERVER=1) and still has to pass the checkout stamp.
              reuseExistingServer: reuseExistingServer(process.env),
              timeout: 60_000,
          },
});
