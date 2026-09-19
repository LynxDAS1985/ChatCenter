// main/notification-limits.js — v1.2.489
//
// Предел «вечных» карточек уведомлений (dismissMs=0 — «не закрывать сами») по РЕАЛЬНОЙ высоте.
// Подключается в notification.html ПОСЛЕ notification-helpers.js и notification-album.js, ДО
// notification.js; кладёт функции в общий набор window.__ccNotifHelpers (набор ДОПОЛНЯЕТСЯ,
// порядок трёх файлов-помощников между собой не важен, важно — до notification.js).
//
// ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ: notification-helpers.js стоял 291/300 строк (v1.2.488) — следующая правка
// окна туда бы не влезла; notification.js — 719/730. Правило проекта: не резать комментарии, а
// разделять файл (как альбом в v1.2.479). Файл ОБЯЗАН быть в списке копирования сборки
// electron.vite.config.js — иначе собранная программа окно не соберёт.
//
// ЗАЧЕМ ВООБЩЕ (v1.2.488): число-предел MAX_PERSISTENT_ITEMS (notification.js) считает карточку
// в 180 точек, а раскрытая (настройка «раскрывать сразу») бывает 130…420 по длине текста →
// 6 карточек = 1083…2516 точек при экране 796 (журнал 19.09.2026, дело
// .memory-bank/notif-window-input-loss-case.md). Поэтому перед добавлением новой «вечной»
// карточки меряем ФАКТИЧЕСКИЕ высоты и снимаем старейшие, пока стопка + место под новую не
// влезет в экран. Число-предел остаётся ВНЕШНИМ потолком (страж notificationWindowBounds.test.cjs).
// Гаснущие сами (dismissMs>0) не затронуты — их предел 6 как был.
//
// ДВА УРОКА РЕВЬЮ v1.2.488 (оба закрыты здесь, v1.2.489):
//  1. Закрывающаяся карточка (0,4 с анимации, для мыши отключена: style.pointerEvents='none')
//     считалась в высоту → снимали на одну лишнюю. Теперь пропускаем её, как это делает calcHeight.
//  2. Место под новую бралось по высоте самой свежей карточки: после высокого альбома (~400)
//     короткая карточка снимала лишнюю. Медиана НЕ спасает (проверено числами: [200,200,400] при
//     796 → медиана 200 → всё равно снимаем 2). Берём ПОСТОЯННЫЕ 160 точек (свёрнутая ≈141 по
//     журналу): недооценили высокую карточку → стопка разово вылезет на её «лишние» точки, окно
//     зажмётся до экрана (main), а следующее уведомление снимет лишнее. Переоценка хуже: карточка
//     теряется навсегда. Недооценка — самоисправляется.

const NOTIF_SCREEN_MARGIN_PX = 10 // как NOTIF_SCREEN_MARGIN в main/handlers/notifHandlers.js
const PERSISTENT_MIN_KEEP = 1     // одну карточку оставляем всегда, даже если она сама выше экрана
const NEW_CARD_RESERVE_PX = 160   // место под новую карточку — постоянное (почему не медиана — выше)
const CARD_GAP_PX = 4             // зазор между карточками — как в calcHeight

/** Сколько точек main отводит окну: рабочая область экрана минус поля сверху и снизу. */
function persistentBudgetPx(screen) {
  const h = Number(screen && screen.availHeight) || 800
  return h - NOTIF_SCREEN_MARGIN_PX * 2
}

/**
 * Высоты ЖИВЫХ карточек в окне от старой к новой. Пропускаем:
 *   • не отрисованные (0);
 *   • закрывающиеся (style.pointerEvents === 'none' ставит dismissItem) — они место освободят через
 *     0,4 с, считать их = снять лишнюю (урок ревью v1.2.488, тест-ловушка в notifPersistentTrim).
 */
function cardHeights(container) {
  const out = []
  for (const c of container.children) {
    if (c.style && c.style.pointerEvents === 'none') continue
    const h = c.offsetHeight
    if (h > 0) out.push(h)
  }
  return out
}

/**
 * ЧИСТО: сколько СТАРЕЙШИХ карточек убрать, чтобы стопка + место под новую влезли в budgetPx.
 * @param {number[]} heights высоты живых карточек от старой к новой
 * @param {number} budgetPx сколько точек доступно
 */
function decidePersistentTrim(heights, budgetPx) {
  if (!heights || heights.length === 0) return 0
  const reserve = NEW_CARD_RESERVE_PX + CARD_GAP_PX
  let sum = heights.reduce((a, h) => a + h + CARD_GAP_PX, 0)
  let drop = 0
  while (heights.length - drop > PERSISTENT_MIN_KEEP && sum + reserve > budgetPx) {
    sum -= heights[drop] + CARD_GAP_PX
    drop++
  }
  return drop
}

/** Нужно ли убрать старейшую «вечную» карточку перед добавлением новой. Пишет в журнал, почему. */
function shouldTrimOldest(container, screen) {
  const heights = cardHeights(container)
  const budget = persistentBudgetPx(screen)
  const drop = decidePersistentTrim(heights, budget)
  if (drop > 0) {
    try {
      window.notifApi.log('INFO', 'trim-by-height: карточек=' + heights.length + ' высота=' + heights.reduce((a, h) => a + h + CARD_GAP_PX, 0)
        + ' бюджет=' + budget + ' → убираю старейшую (всего к снятию ' + drop + ')')
    } catch (_) {}
  }
  return drop > 0
}

Object.assign(window.__ccNotifHelpers = window.__ccNotifHelpers || {}, { decidePersistentTrim, persistentBudgetPx, shouldTrimOldest, cardHeights })
