/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';
import { checkoutStamp } from './e2e/appUrl.ts';

export default defineConfig({
    plugins: [
        react(),
        // Only emit the bundle-analysis page when explicitly requested (npm run build:analyze,
        // or CI's "Bundle Analysis" job which sets VITE_ANALYZE) — it's ~1.4MB and was
        // otherwise being precached onto every user's device by the PWA service worker below
        // (~20% of the precache manifest for a report nobody but a developer ever opens).
        ...(process.env.ANALYZE || process.env.VITE_ANALYZE
            ? [
                  visualizer({
                      filename: 'dist/stats.html',
                      gzipSize: true,
                      brotliSize: true,
                  }),
              ]
            : []),
        VitePWA({
            registerType: 'prompt',
            includeAssets: [
                'rubric-icon.svg',
                'pwa-192.png',
                'pwa-512.png',
                'pwa-512-maskable.png',
                'apple-touch-icon.png',
            ],
            manifest: {
                name: 'RubricMaker',
                short_name: 'RubricMaker',
                description: 'Create, fill, and export educational rubrics with ease',
                theme_color: '#3b82f6',
                background_color: '#0f1219',
                display: 'standalone',
                start_url: '.',
                scope: '.',
                icons: [
                    { src: 'rubric-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
                    { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            workbox: {
                // Belt-and-braces: stats.html is no longer emitted by default (see the ANALYZE
                // gate above), but exclude it by name too in case a local `ANALYZE=1` build is
                // ever accidentally deployed.
                //
                // Non-EN locale chunks are excluded from precache too — i18n.ts already lazy-loads
                // them on demand, but precaching still pulled all four onto every device regardless
                // of which language (if any) the visitor picks. The runtimeCaching CacheFirst route
                // below caches whichever ones actually get requested, so offline use of a language
                // still works once it's been opened at least once.
                // The pdf.js worker (~1.2MB) is only needed by PDF import, so it is cached on first
                // use instead of being precached onto every device.
                globIgnores: ['**/stats.html', '**/assets/{nl,fr,de,es}-*.js', '**/assets/pdf.worker*.js'],
                // vite-plugin-pwa otherwise defaults to a cache-only NavigationRoute for index.html,
                // which would shadow the network-first navigation route below.
                navigateFallback: null,
                // Likewise the precache route would answer `/` from its cached index.html (it maps a
                // trailing slash to the directory index) before the navigation route ever ran.
                directoryIndex: '',
                // Never let the service worker cache Supabase requests — a cached
                // response could make a failed sync request look like it succeeded.
                // Path-only (no host) so this matches both hosted (*.supabase.co)
                // and self-hosted/reverse-proxied Supabase deployments.
                runtimeCaching: [
                    {
                        // Navigations go to the network first, so a reload always picks up the
                        // latest deploy instead of a precached shell from whichever build the worker
                        // was installed with. The precached shell is only the offline / outage
                        // fallback (a brief origin or reverse-proxy 502 mid-session must not drop a
                        // student onto an error page). A 200 that isn't our app — the HestiaCP
                        // "web server is ready" skeleton a domain rebuild can drop into the docroot —
                        // is treated as a failure, so it is never shown or cached over the real shell.
                        urlPattern: ({ request, url }) =>
                            request.mode === 'navigate' &&
                            !/\/(rest|auth|realtime|storage|functions)\/v\d+\//.test(url.pathname),
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'rm-app-shell',
                            networkTimeoutSeconds: 6,
                            expiration: { maxEntries: 4 },
                            precacheFallback: { fallbackURL: 'index.html' },
                            plugins: [
                                {
                                    fetchDidSucceed: async ({ response }) => {
                                        if (response.status >= 500) {
                                            throw new Error(`Navigation failed with ${response.status}`);
                                        }
                                        const type = response.headers.get('content-type') || '';
                                        if (!response.ok || !type.includes('text/html')) return response;
                                        const body = await response.clone().text();
                                        if (!body.includes('name="apple-mobile-web-app-title" content="RubricMaker"')) {
                                            throw new Error('Navigation returned a page that is not RubricMaker');
                                        }
                                        return response;
                                    },
                                },
                            ],
                        },
                    },
                    {
                        urlPattern: /\/(rest|auth|realtime|storage|functions)\/v\d+\//,
                        handler: 'NetworkOnly',
                    },
                    {
                        urlPattern: /\/assets\/(nl|fr|de|es)-[^/]+\.js$/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'rm-locale-chunks',
                            expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
                        },
                    },
                    {
                        urlPattern: /\/assets\/pdf\.worker[^/]*\.js$/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'rm-pdf-worker',
                            expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 365 },
                        },
                    },
                    {
                        // Self-hosted fonts (#701): already served from our own origin, cached on
                        // first use so an offline session keeps the right face — and like the locale
                        // chunks, kept out of the precache so a visitor who never opens an export
                        // doesn't download every print font up front. StaleWhileRevalidate rather
                        // than CacheFirst because fonts.css keeps a stable URL: a regenerated sheet
                        // (new @font-face rules, changed unicode-range) must reach users on their next
                        // load instead of waiting out the one-year cache entry.
                        urlPattern: /\/fonts\/[^/]+\.(?:woff2|css)$/,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'rm-fonts',
                            expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
                        },
                    },
                ],
            },
        }),
    ],
    base: './',
    build: {
        rollupOptions: {
            output: {
                // Emit `.mjs` assets (the pdf.js worker) as `.js`: plenty of servers have no `.mjs`
                // entry in their MIME table and answer `application/octet-stream`, which browsers
                // reject for module scripts — PDF import then dies with "Setting up fake worker".
                assetFileNames: (asset) =>
                    (asset.names?.[0] ?? '').endsWith('.mjs')
                        ? 'assets/[name]-[hash].js'
                        : 'assets/[name]-[hash][extname]',
            },
        },
    },
    // Advertise which checkout this dev server is serving. The e2e suite compares this stamp with
    // its own root, so a server left running from another worktree can't silently pass the run
    // against the wrong code (#1015). Vite resolves its root from cwd, so cwd is the served tree.
    server: {
        headers: { 'x-rm-checkout': checkoutStamp(process.cwd()) },
    },
    // @supabase/supabase-js is only reachable via a nested dynamic import now
    // (AppContext -> services/database/lazyDb.ts -> import('./index')), which the
    // dev-server's dependency pre-bundler can miss during its initial scan — the
    // first request that hits it then triggers a "new dependency discovered"
    // re-optimization + full reload mid-session. Listing it explicitly pre-bundles
    // it at cold start instead. Dev-only: no effect on the production build/chunking.
    optimizeDeps: {
        include: ['@supabase/supabase-js'],
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/vitest.setup.ts'],
        globals: true,
        exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/worktrees/**', '**/.freebuff/**', 'e2e/**'],
        // JUnit output powers the auto-quarantine detector (the Quarantine Check
        // workflow's detect-flaky job downloads unit-results/results.xml from
        // recent CI runs). Written on every run; the file is gitignored.
        reporters: ['default', 'junit'],
        outputFile: {
            junit: 'unit-results/results.xml',
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'json-summary', 'html'],
            reportOnFailure: true,
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/**/*.test.{ts,tsx}',
                'src/**/__tests__/**',
                // Entry points and setup — not unit-testable in isolation
                'src/main.tsx',
                'src/App.tsx',
                'src/i18n.ts',
                // Static data constants — no executable logic
                'src/data/**',
                'src/types/**',
                // External service integrations — require auth/network
                'src/services/**',
                // Browser-API-heavy utilities that require Tesseract/canvas/PDF rendering
                'src/utils/textExtraction.ts',
                'src/utils/pdfExport.ts',
                'src/utils/docxExport.ts',
                'src/utils/docxTemplateExport.ts',
                // Browser Notification API + sessionStorage — not unit-testable in jsdom
                'src/components/Layout/NotificationBell.tsx',
                // Static documentation page — no executable logic to unit-test
                'src/pages/PrivacyPage.tsx',
                // Essay feature — browser-API-heavy (TipTap canvas, sessionStorage, navigator, QR canvas, file-saver)
                'src/pages/StudentEssayPage.tsx',
                'src/components/Editor/TiptapEditor.tsx',
                'src/components/Editor/EssayEditor.tsx',
                'src/components/Essay/EssayAssignmentModal.tsx',
                'src/components/Essay/EssaySlipSheet.tsx',
                // Auth/onboarding flows — require full Supabase + router context to render meaningfully
                'src/pages/OnboardingPage.tsx',
                // Admin dashboard — depends on live Supabase data and full app context
                'src/pages/AdminPage.tsx',
                // Chart components — SVG/CSS render output; logic covered by frameworkAggregator.test.ts
                'src/components/Statistics/BloomsPyramidChart.tsx',
                'src/components/Statistics/FrameworkRoseChart.tsx',
                // Student self-assessment panel — UI wrapper; aggregation logic tested separately
                'src/components/Students/RubricSelfAssessPanel.tsx',
            ],
            all: true,
            thresholds: {
                lines: 65,
                statements: 65,
                functions: 60,
                branches: 58,
            },
        },
    },
} as any);
