// shared/chatListWidth.js — v1.2.460
//
// ЧИСТЫЕ расчёты ширины списка чатов: границы, потолок от размера окна, порог «узкого вида».
// Ни React, ни обращений к странице — поэтому проверяется числами, без запуска приложения.
//
// ЗАЧЕМ ВЫНЕСЕНО (правило проекта «не резать комментарии, а разделять файл»):
//   • [src/native/hooks/useChatListResize.js] стоял 144/150 — следующая правка не влезала;
//   • у интерфейса есть ОБЩАЯ планка строк (`src/` без тестов), и на 2026-09-15 в ней
//     оставалось 4 строки из 34640. Перенос внутри `src/` её бы не разгрузил — папка
//     `shared/` в эту планку не входит. Тот же приём применён в v1.2.448 (общий код),
//     v1.2.454-455 (`panelWidthCap.js`) и v1.2.455 (`inboxScrollToBottom.js`).
//
// Кто пользуется: сам хук перетаскивания (`useChatListResize.js`) и экран переписки
// (`src/native/modes/InboxMode.jsx` — при загрузке сохранённой ширины и для выбора вида списка).

export const CHAT_LIST_MIN_WIDTH = 60
export const CHAT_LIST_MAX_WIDTH = 600
export const CHAT_LIST_DEFAULT_WIDTH = 340
// v0.95.9: порог 160 → 128 (вторая итерация —20% от 160). Юзер: "слишком рано".
// Compact включается когда юзер сжал до ~128px. Цепочка: 200 (v0.95.7) → 160 (v0.95.8) → 128.
export const CHAT_LIST_COMPACT_THRESHOLD = 128

// v1.2.457 (TODO-40): доля окна, шире которой список чатов не бывает. Раньше он о размере
// окна не знал вовсе: сохранённые 340 точек на узком окне съедали место у самой переписки.
export const CHAT_LIST_MAX_WINDOW_SHARE = 0.4

/**
 * Предел ширины списка чатов для ТЕКУЩЕГО окна.
 * Окно нельзя сузить меньше 900 точек (minWidth: 900 в main/utils/windowManager.js),
 * значит предел никогда не опускается ниже 360 — это больше порога «узкого вида» (128),
 * поэтому список не может внезапно оказаться зажатым в узкий вид из-за потолка.
 * @param {number} windowWidth ширина окна (window.innerWidth)
 */
export function chatListMaxPx(windowWidth) {
  const byWindow = Number.isFinite(windowWidth) && windowWidth > 0
    ? Math.floor(windowWidth * CHAT_LIST_MAX_WINDOW_SHARE)
    : CHAT_LIST_MAX_WIDTH
  return Math.max(CHAT_LIST_MIN_WIDTH, Math.min(CHAT_LIST_MAX_WIDTH, byWindow))
}

/**
 * Ограничение ширины списка чатов.
 * 🔴 ВАЖНО, ПОЧЕМУ ОГРАНИЧИВАЕМ ЧИСЛО, А НЕ ВЁРСТКУ (в отличие от панели ИИ, где потолок
 * задан правилом вёрстки — shared/panelWidthCap.js): «узкий вид» списка (одни аватарки)
 * включается по ЭТОМУ ЖЕ числу (isChatListCompact ниже). Ограничь мы вёрстку — показанная
 * ширина уменьшилась бы, а решение про узкий вид осталось прежним: панель узкая, а строки
 * внутри рисуются широкими и обрезаются. Ограничивая само число, мы держим вид и ширину
 * согласованными по построению.
 * ⚠️ Плата за это: пересчёт происходит при загрузке настроек и при перетаскивании, но НЕ
 * на лету при изменении размера окна (для «на лету» нужен наблюдатель за размером —
 * это новое хранилище в приложении; см. TODO-40 в .memory-bank/code-todo.md).
 * 🔴 Через эту функцию ОБЯЗАНЫ проходить ВСЕ пути изменения ширины — загрузка настроек,
 * перетаскивание и сброс двойным щелчком (ADR-058). Отдельный путь «в обход» — дефект,
 * даже если сегодня он недостижим.
 * @param {number} w желаемая ширина
 * @param {number} [windowWidth] ширина окна; не передана — берём текущее окно
 */
export function clampChatListWidth(w, windowWidth) {
  if (!Number.isFinite(w)) return CHAT_LIST_DEFAULT_WIDTH
  const win = Number.isFinite(windowWidth)
    ? windowWidth
    : (typeof window !== 'undefined' ? window.innerWidth : undefined)
  return Math.max(CHAT_LIST_MIN_WIDTH, Math.min(chatListMaxPx(win), w))
}

export function isChatListCompact(width) {
  return Number.isFinite(width) && width < CHAT_LIST_COMPACT_THRESHOLD
}
