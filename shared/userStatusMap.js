// v1.2.171: разбор статуса пользователя TDLib → { isOnline, lastSeenAt, userStatusType }.
// Единый источник для ДВУХ путей, раньше дублировавших логику:
//   1) начальная загрузка чата — tdlibMapper.js mapChat (объект user.status).
//   2) ЖИВОЕ обновление — updateUserStatus → мост tg:user-status → стор
//      (раньше tg:user-status никто не слушал, статус ставился один раз и не менялся).
//
// TDLib spec: https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1user_status.html
//   userStatusOnline           — сейчас в сети (expires — когда истекает)
//   userStatusOffline          — не в сети; was_online = unix-время последнего онлайна
//   userStatusRecently         — «был(а) недавно» (пользователь скрыл точное время)
//   userStatusLastWeek/Month   — «был(а) на этой неделе / в этом месяце» (скрыто)
//   userStatusEmpty            — статус неизвестен
//
// Точное время (lastSeenAt) TDLib даёт ТОЛЬКО для userStatusOffline.was_online.
// Для Recently/LastWeek/LastMonth времени нет — показываем словами по userStatusType
// (это делает src/native/utils/formatChatStatus.js).
export function mapUserStatus(status) {
  const userStatusType = status?.['@type'] || null
  let isOnline = false
  let lastSeenAt = null
  if (userStatusType === 'userStatusOnline') {
    isOnline = true
  } else if (userStatusType === 'userStatusOffline' && status?.was_online) {
    lastSeenAt = Number(status.was_online) * 1000
  }
  return { isOnline, lastSeenAt, userStatusType }
}
