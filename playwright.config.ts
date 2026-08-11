import { defineConfig, devices } from '@playwright/test';
import quarantine from './e2e/quarantine.json' with { type: 'json' };

// Flaky-spec quarantine: specs listed in e2e/quarantine.json (as
// "<file>.spec.ts" with a reason) are excluded from every gating project so
// they can't block the pipeline, and are run by the weekly Quarantine Check
// workflow (project below) which unquarantines them once they're stable.
// Add a spec here with a reason instead of deleting it.
const quarantinePatterns = quarantine.map((q) => `**/${q.spec}`);

export default defineConfig({
    testDir: './e2e/specs',
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
        baseURL: 'http://localhost:5173',
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
                ...quarantinePatterns,
            ],
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
            ],
            testIgnore: [...quarantinePatterns],
        },
        // Runs ONLY the quarantined specs (Desktop Chrome + fake media, since
        // recording specs are the usual flaky suspects). Not part of the gating
        // run — the weekly Quarantine Check workflow uses this project to
        // verify quarantined specs are stable again before unquarantining them.
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
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
});
