import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// v0.87.7: vitest для React-компонентов (отдельно от основных .test.cjs статических тестов)
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    // v0.97.0 (Phase 1): main/**/*.vitest.js — для AI adapter тестов в main/ai/
    // v1.2.448: добавлена shared/** — папка была НЕ включена, и тесты в ней МОЛЧА не
    // запускались (shared/userStatusMap.vitest.js не запускался с момента создания, а при
    // переезде src/shared/ в shared/ из прогона выпало бы ещё 5 файлов). Страж, который
    // это ловит, — в src/__tests__/sharedWiring.test.cjs («тесты, которые никто не запускает»).
    include: ['src/**/*.vitest.jsx', 'src/**/*.vitest.js', 'main/**/*.vitest.js',
      'shared/**/*.vitest.js', 'shared/**/*.vitest.jsx'],
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
