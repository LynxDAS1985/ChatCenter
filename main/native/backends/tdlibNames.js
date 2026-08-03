// v1.2.171: имена пользователя/чата из объектов TDLib.
// Вынесено из tdlibClient.js (файл был на лимите 650/650 — освобождаем место).
// tdlibClient.js импортирует их обратно и РЕЭКСПОРТИРУЕТ (tdlibBackend.js берёт
// userDisplayName из tdlibClient — реэкспорт сохраняет старый путь импорта).

// first_name + last_name → «Имя Фамилия»; иначе @username; иначе ''.
export function userDisplayName(user) {
  if (!user) return ''
  const first = user.first_name || ''
  const last = user.last_name || ''
  const composed = `${first} ${last}`.trim()
  if (composed) return composed
  const uname = user.usernames?.active_usernames?.[0]
  return uname ? `@${uname}` : ''
}

// TDLib chat title fallback
export function chatDisplayName(chat) {
  if (!chat) return ''
  return chat.title || ''
}
