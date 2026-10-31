/**
 * ESLint config for Business OS backend (NestJS 10 + TypeScript 5).
 *
 * Kept intentionally pragmatic: the goal is catching real defects (unused
 * vars/imports, unreachable code, bad patterns) without a 10k-line diff.
 * Type-aware rules are disabled because they need `parserOptions.project`
 * and are too slow for a pre-commit/CI gate on this codebase.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2021,
  },
  plugins: ['@typescript-eslint'],
  extends: ['plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    jest: true,
    es2021: true,
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '*.js',
  ],
  rules: {
    // The domain layer legitimately uses `any` for DTO/json payloads.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-empty-object-type': 'off',
    '@typescript-eslint/no-empty-interface': 'off',
    '@typescript-eslint/no-unsafe-function-type': 'off',
  },
};
