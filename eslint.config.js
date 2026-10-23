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
   */
  /*
   * BIG-12: Atlas's own turn code, bundled from `../atlas` for the tablet by
   * `scripts/build-atlas-engine.mjs`. Atlas lints its source in its own repo;
   * this is esbuild's output of it.
   */
  globalIgnores(['dist', 'design-system', 'src/lib/atlas/engine/atlasEngine.generated.js']),
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
