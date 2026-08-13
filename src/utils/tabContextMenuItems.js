// v1.2.250 — конструктор пунктов контекстного меню вкладки/значка источника.
// Вынесен из TabBar.jsx, чтобы логику «какие пункты показывать» можно было
// проверить юнит-тестом без монтирования всего TabBar (у него ~30 пропсов).
//
// Правила:
//   • Нативный источник («Общий чат», isNative) НЕ имеет веб-страницы → пункты
//     «Перезагрузить / Диагностика и логи / Копировать URL» для него бессмысленны
//     (ничего не делают, copyUrl копировал бы about:blank) → скрываем. Касается
//     и нативной вкладки, и значка рейла (меню общее) — это намеренно (см. decisions ADR-031).
//   • Закреплённая вкладка (pinned) не показывает «Закрыть».

/**
 * @param {Object} opts
 * @param {boolean} opts.isNative — источник нативный (TDLib «Общий чат»)?
 * @param {boolean} opts.pinned   — вкладка закреплена?
 * @returns {Array<{action:string, icon:string, label:string, color?:string}>}
 */
export function buildTabContextMenuItems({ isNative = false, pinned = false } = {}) {
  return [
    ...(!isNative ? [
      { action: 'reload', icon: '🔄', label: 'Перезагрузить' },
      { action: 'notifLog', icon: '📊', label: 'Диагностика и логи' },
      { action: 'copyUrl', icon: '📋', label: 'Копировать URL' },
    ] : []),
    { action: 'edit', icon: '✏️', label: 'Изменить вкладку' },
    { action: 'pin', icon: pinned ? '📌' : '🔒', label: pinned ? 'Открепить вкладку' : 'Закрепить вкладку' },
    ...(!pinned ? [{ action: 'close', icon: '✕', label: 'Закрыть вкладку', color: '#f87171' }] : []),
  ]
}
