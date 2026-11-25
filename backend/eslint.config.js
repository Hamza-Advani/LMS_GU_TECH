import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.demo-data'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts'], languageOptions: { globals: globals.node },
    rules: {
      // Supabase rows are untyped (no generated DB types) and the demo emulator is dynamic by design.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    } },
);
