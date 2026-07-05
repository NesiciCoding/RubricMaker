import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e/specs',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: [
        ['list'],
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
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
});
