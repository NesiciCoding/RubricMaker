/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/worktrees/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
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
        // Static documentation page — no executable logic to unit-test
        'src/pages/PrivacyPage.tsx',
        // Essay feature — browser-API-heavy (TipTap canvas, sessionStorage, navigator, QR canvas, file-saver)
        'src/pages/StudentEssayPage.tsx',
        'src/components/Editor/TiptapEditor.tsx',
        'src/components/Editor/EssayEditor.tsx',
        'src/components/Essay/EssayAssignmentModal.tsx',
        'src/components/Essay/EssaySlipSheet.tsx',
      ],
      all: true,
      thresholds: {
        lines: 50,
        statements: 47,
        functions: 37,
        branches: 37,
      },
    },
  }
} as any)
