/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['rubric-icon.svg', 'pwa-192.png', 'pwa-512.png'],
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
        ],
      },
      workbox: {
        // Never let the service worker cache Supabase requests — a cached
        // response could make a failed sync request look like it succeeded.
        // Path-only (no host) so this matches both hosted (*.supabase.co)
        // and self-hosted/reverse-proxied Supabase deployments.
        runtimeCaching: [
          {
            urlPattern: /\/(rest|auth|realtime|storage|functions)\/v\d+\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  base: './',
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    globals: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/worktrees/**',
      'e2e/**',
    ],
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
  }
} as any)
