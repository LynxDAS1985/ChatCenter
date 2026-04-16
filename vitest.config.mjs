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
  },
})
