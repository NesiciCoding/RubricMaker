/// <reference types="vitest" />
import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: [
      { find: /^@tiptap\/pm\/([\w-]+)$/, replacement: path.resolve(__dirname, 'node_modules/prosemirror-$1/dist/index.js') },
      { find: /^@tiptap\/([\w-]+)$/, replacement: path.resolve(__dirname, 'node_modules/@tiptap/$1/src/index.ts') },
    ],
  },
  optimizeDeps: {
    exclude: [
      '@tiptap/core',
      '@tiptap/extension-blockquote',
      '@tiptap/extension-bold',
      '@tiptap/extension-bubble-menu',
      '@tiptap/extension-bullet-list',
      '@tiptap/extension-code',
      '@tiptap/extension-code-block',
      '@tiptap/extension-document',
      '@tiptap/extension-dropcursor',
      '@tiptap/extension-floating-menu',
      '@tiptap/extension-gapcursor',
      '@tiptap/extension-hard-break',
      '@tiptap/extension-heading',
      '@tiptap/extension-horizontal-rule',
      '@tiptap/extension-italic',
      '@tiptap/extension-link',
      '@tiptap/extension-list',
      '@tiptap/extension-list-item',
      '@tiptap/extension-list-keymap',
      '@tiptap/extension-ordered-list',
      '@tiptap/extension-paragraph',
      '@tiptap/extension-strike',
      '@tiptap/extension-text',
      '@tiptap/extension-underline',
      '@tiptap/extensions',
      '@tiptap/pm',
      '@tiptap/react',
      '@tiptap/starter-kit'
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  }
} as any)
