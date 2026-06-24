export default {
  plugins: {
    // v1.2.17: Tailwind 4 — PostCSS-плагин вынесен в отдельный пакет @tailwindcss/postcss.
    // autoprefixer убран: Tailwind 4 сам добавляет вендорные префиксы (Lightning CSS).
    '@tailwindcss/postcss': {}
  }
}
