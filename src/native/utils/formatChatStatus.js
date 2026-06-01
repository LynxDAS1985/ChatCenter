// v0.95.29: форматирование статуса чата для header — Telegram-style.
//
// Возвращает строку статуса под именем чата:
//   user:    'в сети' | 'был(а) в HH:MM' | 'был(а) X мин назад' | 'был(а) недавно'
//   group:   'N участников, N онлайн'
//   channel: 'N подписчиков'
//
// Эталон: Telegram Desktop/Web показывают именно такие форматы.
// https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1user_status.html
//
// Параметры:
//   chat.type — 'user' | 'group' | 'channel'
//   chat.isOnline — boolean (для user)
//   chat.lastSeenAt — unix ms (для user offline) или null
//   chat.userStatusType — 'userStatusOnline'|'userStatusOffline'|'userStatusRecently'|...
//   chat.memberCount — число (для group/channel)
//   isTyping — bool (приоритет, перебивает статус)
//
// nowMs — для тестов (мокать Date.now()), default = Date.now()

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function pad2(n) { return String(n).padStart(2, '0') }
function plural(n, one, few, many) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function formatLastSeen(lastSeenMs, nowMs) {
  if (!Number.isFinite(lastSeenMs) || lastSeenMs <= 0) return 'был(а) недавно'
  const ago = nowMs - lastSeenMs
  if (ago < MIN) return 'был(а) только что'
  if (ago < HOUR) {
    const m = Math.floor(ago / MIN)
    return `был(а) ${m} ${plural(m, 'мин', 'мин', 'мин')} назад`
  }
  // Сегодня — показать время HH:MM
  const now = new Date(nowMs)
  const seen = new Date(lastSeenMs)
  const isSameDay = now.toDateString() === seen.toDateString()
  if (isSameDay) {
    return `был(а) в ${pad2(seen.getHours())}:${pad2(seen.getMinutes())}`
  }
  // Вчера
  const yesterday = new Date(nowMs - DAY)
  if (yesterday.toDateString() === seen.toDateString()) {
    return `был(а) вчера в ${pad2(seen.getHours())}:${pad2(seen.getMinutes())}`
  }
  // На этой неделе — день недели
  if (ago < 7 * DAY) {
    const days = ['воскр', 'понед', 'вторн', 'среду', 'четв', 'пятн', 'субб']
    return `был(а) в ${days[seen.getDay()]} в ${pad2(seen.getHours())}:${pad2(seen.getMinutes())}`
  }
  // Дальше — дата
  const day = pad2(seen.getDate())
  const month = pad2(seen.getMonth() + 1)
  return `был(а) ${day}.${month}.${seen.getFullYear()}`
}

export function formatChatStatus(chat, { isTyping = false, nowMs = Date.now() } = {}) {
  if (!chat) return ''
  if (isTyping) return 'печатает...'
  if (chat.type === 'user') {
    if (chat.isOnline) return 'в сети'
    if (chat.userStatusType === 'userStatusRecently') return 'был(а) недавно'
    if (chat.userStatusType === 'userStatusLastWeek') return 'был(а) на этой неделе'
    if (chat.userStatusType === 'userStatusLastMonth') return 'был(а) в этом месяце'
    if (chat.userStatusType === 'userStatusEmpty') return 'давно не был(а)'
    if (chat.lastSeenAt) return formatLastSeen(chat.lastSeenAt, nowMs)
    return 'был(а) недавно'
  }
  if (chat.type === 'group') {
    const n = Number(chat.memberCount) || 0
    if (n <= 0) return 'группа'
    return `${n.toLocaleString('ru')} ${plural(n, 'участник', 'участника', 'участников')}`
  }
  if (chat.type === 'channel') {
    const n = Number(chat.memberCount) || 0
    if (n <= 0) return 'канал'
    return `${n.toLocaleString('ru')} ${plural(n, 'подписчик', 'подписчика', 'подписчиков')}`
  }
  return ''
}
