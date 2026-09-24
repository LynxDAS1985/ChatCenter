// Переходник: сам текст скрипта для страницы Ozon живёт в shared/ozonNavigateScript.js
// (скрипт для ЧУЖОЙ страницы — по правилу ADR-044 его место в shared/, вне бюджета экранов).
// Здесь оставлен реэкспорт, чтобы navigateToChat.js звал все навигаторы единообразно.
export { buildOzonScript } from '../../../shared/ozonNavigateScript.js'
