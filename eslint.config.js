// ESLint 9 flat config — минимальный, ловит критические ошибки
import js from '@eslint/js'
import globals from 'globals'

export default [
  // Игнорируем build output и node_modules
  { ignores: ['out/**', 'dist/**', 'node_modules/**', '**/*.cjs', '**/*.test.*', 'main/preloads/**'] },

  // Общие правила для всех JS/JSX
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
      // Критические — ловят ReferenceError (ловушки 48, 50)
      'no-undef': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // Безопасность
      'no-eval': 'error',
      'no-implied-eval': 'error',

      // Частые ошибки
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'warn',
      'no-constant-condition': 'warn',
      'no-debugger': 'warn',
      'eqeqeq': ['warn', 'smart'],

      // Всё остальное — ВЫКЛЮЧЕНО (не мешаем стилю кода)
      'no-console': 'off',
      'semi': 'off',
      'quotes': 'off',
      'indent': 'off',
      'comma-dangle': 'off',
      'no-trailing-spaces': 'off',
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
      'no-undef': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'warn',
      'eqeqeq': ['warn', 'smart'],
      'no-console': 'off',
    },
  },
]
