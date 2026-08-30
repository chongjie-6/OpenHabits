import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-ssr']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // The SSR entry runs at build time in Node and is never hot-reloaded, so the
    // Fast Refresh rule about mixing components with other exports does not apply.
    files: ['src/entry-server.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // The service worker is hand-written and runs in its own global scope, so it
    // sees `self`, `caches` and `clients` rather than `window`.
    files: ['public/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
  {
    // Build scripts are Node, not the browser.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
