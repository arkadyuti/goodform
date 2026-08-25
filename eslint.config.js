import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'server/drizzle/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Type-aware rules, where the type checker can see the whole program. These
  // are the ones that catch what review misses: a promise nobody awaited, an
  // async function handed to something expecting void, a value read off an
  // unchecked `any`. Server and shared first — no JSX, so the fallout is
  // tractable; web joins them below with the noisiest rules relaxed.
  {
    files: ['server/**/*.ts', 'shared/**/*.ts', 'web/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // React event props are typed `() => void`, so every `onClick={async …}`
      // trips this. Flagging all of them would drown the rule's real finds —
      // an async callback handed to `setTimeout`, `forEach`, or anywhere the
      // caller sequences on the return value. The risk that matters here is an
      // unhandled rejection, and `MutationCache.onError` in main.tsx catches
      // that at runtime for every mutation, which lint cannot do.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // Config files belong to no tsconfig, so type-aware rules cannot run on them.
  {
    files: ['**/*.config.{ts,js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    rules: {
      // Unused names are an error, but a leading underscore marks one that is
      // deliberately ignored — a positional callback argument, mainly.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // `any` erases the checking this codebase relies on, but a stray one
      // should not block a deploy.
      '@typescript-eslint/no-explicit-any': 'warn',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // The CSV export embeds a deliberate BOM in a template literal so Excel
      // opens UTF-8 names correctly. Stripping it would silently break that.
      'no-irregular-whitespace': ['error', { skipTemplates: true }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Browser code.
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Node code.
  {
    files: ['server/**/*.ts', '**/*.config.{ts,js,mjs}', '**/scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },

  // Plain JS shipped to the browser without a build step.
  {
    files: ['web/public/**/*.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.browser },
      sourceType: 'script',
    },
  },
);
