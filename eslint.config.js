// ESLint 9 flat config — минимальный, ловит критические ошибки
import js from '@eslint/js'
import globals from 'globals'

export default [
  // Игнорируем build output, node_modules, preload scripts (CJS в ESM проекте), тесты
  { ignores: ['out/**', 'dist/**', 'node_modules/**', '**/*.cjs', '**/*.test.*', 'main/preloads/**'] },

  // Renderer (React) — browser globals
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Безопасность (КРИТИЧЕСКИЕ — блокируют коммит)
      'no-eval': 'error',
      'no-implied-eval': 'error',

      // Структурные ошибки
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'warn',
      'no-debugger': 'warn',

      // no-undef: OFF — ESLint без TypeScript не понимает React JSX, createWebviewSetup closure, destructured hook returns
      // Реальные ReferenceError ловятся тестом componentScope + build
      'no-undef': 'off',
      // no-unused-vars: OFF — слишком много false positives при destructuring hooks
      // Реальный мёртвый код ловится build (tree-shaking) + code review
      'no-unused-vars': 'off',

      'no-console': 'off',
    },
  },

  // Main process — Node.js globals
  {
    files: ['main/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
]
