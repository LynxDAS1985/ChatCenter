// v0.87.0: Native Telegram config — api_id / api_hash от my.telegram.org
// Источник: Short name "Demo33" (переименовано в "ChatCenter"), owner: автор проекта
// Эти креды вшиты в программу. Пользователи их не вводят. Legal: Telegram разрешает
// сторонним клиентам иметь один api_id на всё приложение (как Telegram Desktop, Unigram).
//
// ⚠️ БЕЗОПАСНОСТЬ:
// - НЕ публиковать api_hash в git (см. .gitignore)
// - Для смены: my.telegram.org → Reset app hash → обновить этот файл → rebuild

export const TELEGRAM_API_ID = 8392940
export const TELEGRAM_API_HASH = '33a9605b6f86a176e240cc141e864bf5'

// Настройки клиента GramJS
export const TELEGRAM_CLIENT_OPTIONS = {
  connectionRetries: 5,
  useWSS: false,
  deviceModel: 'ChatCenter Desktop',
  systemVersion: 'Windows 10',
  appVersion: '0.87.0',
  langCode: 'ru',
  systemLangCode: 'ru',
}

// Путь для session-файла (внутри userData)
export const SESSION_FILE_NAME = 'tg-session.txt'
