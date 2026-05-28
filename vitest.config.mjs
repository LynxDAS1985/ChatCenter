import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// v0.87.7: vitest для React-компонентов (отдельно от основных .test.cjs статических тестов)
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.vitest.jsx', 'src/**/*.vitest.js'],
    css: false,
    // v0.87.32: фиксируем UTC для toLocaleTimeString/DateString в snapshot-тестах
    setupFiles: ['./vitest.setup.js'],
    // v0.95.4: 15с вместо дефолтных 5с — Windows CI runner медленнее Ubuntu,
    // cold-start первого теста в файле (модуль+happy-dom+первый рендер React 19)
    // даёт 5-6с (AccountContextMenu.vitest.jsx: 5671мс vs 13-36мс остальные).
    // Это потолок, не фиксированное ожидание — нормальные тесты не замедляются.
    testTimeout: 15000,
  },
})
