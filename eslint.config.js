import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettierConfig from 'eslint-config-prettier'
import maxDomainsInRenderHook from './eslint/rules/max-domains-in-render-hook.js'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettierConfig],
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // react-hooks v5 strict rules — patterns are widespread; kept off until incremental cleanup
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
    },
  },
  {
    // Tests compose domain hooks explicitly; subscribing a single renderHook to more than
    // three domains re-renders the probe on unrelated domain changes and defeats the
    // isolation it exists to verify. Such tests should select exactly the slices they read
    // via useStoreSelector (src/context/useStore) instead.
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    plugins: {
      local: { rules: { 'max-domains-in-render-hook': maxDomainsInRenderHook } },
    },
    rules: {
      'local/max-domains-in-render-hook': 'error',
    },
  }
)
