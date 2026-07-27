// v1.2.130: краткое время последнего сообщения для строки списка чатов (правая
// колонка на линии имени) — Telegram-style.
//
// Форматы (эталон Telegram Desktop/Web список диалогов):
//   сегодня           → 'HH:MM'  (напр. '12:45')
//   вчера             → 'вчера'
//   на этой неделе    → короткий день недели ('пн', 'вт', ...)
//   раньше            → 'DD.MM.YY'
//   нет времени (0)   → '' (пустая строка — время не рисуем)
//
// nowMs — для тестов (мокать «сейчас»), по умолчанию Date.now().

const DAY = 24 * 60 * 60 * 1000

function pad2(n) { return String(n).padStart(2, '0') }

export function formatChatListTime(tsMs, nowMs = Date.now()) {
  const ts = Number(tsMs)
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const d = new Date(ts)
  const now = new Date(nowMs)

  // Сегодня → HH:MM
  if (now.toDateString() === d.toDateString()) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
  // Вчера
  const yesterday = new Date(nowMs - DAY)
  if (yesterday.toDateString() === d.toDateString()) return 'вчера'
  // На этой неделе (< 7 дней назад) → короткий день недели
  if (nowMs - ts < 7 * DAY) {
    const days = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
    return days[d.getDay()]
  }
  // Раньше → DD.MM.YY
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`
}
