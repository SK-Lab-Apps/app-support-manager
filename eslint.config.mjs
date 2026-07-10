// Root ESLint flat config for packages/* (apps/web has its own Next.js ESLint setup).
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/lib/**',
      '**/node_modules/**',
      'apps/**',
      'supabase/functions/**', // Deno runtime — linted/checked by `deno check`, not Node ESLint
      '**/example/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
);
