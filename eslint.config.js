import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  /*
   * `design-system/` is the mirror of the Claude Design project —
   * vendored reference material, not app code. Nothing imports it and Vite
   * never builds it, but its `.d.ts` sidecars would otherwise be linted as
   * project source and held to rules they were never written against.
   * `promo/` is the Remotion promo video: its own package, deps and config.
   */
  globalIgnores(['dist', 'design-system', 'promo']),
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
])
