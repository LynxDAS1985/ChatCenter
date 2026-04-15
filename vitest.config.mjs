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
  },
})
