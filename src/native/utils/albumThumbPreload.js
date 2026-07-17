// v1.2.74 (A1): догрузка ЧЁТКОГО превью плитки альбома в окно уведомления.
//
// Проблема: в карточке уведомления плитки показывают strippedThumb (minithumbnail —
// намеренно РАЗМЫТЫЙ крошечный кадр из TDLib, мгновенный, но мутный). Он не заменяется
// сам → плитки остаются мутными. См. .memory-bank/mistakes/notifications-ribbon.md.
//
// Решение: из главного окна (где есть window.api и доступ к TDLib) качаем быстрый
// чёткий превью (tg:download-media thumb:true, ~10-50 КБ) и шлём его путь в окно
// уведомления (канал notif:album-thumb → main пересылает окну). Окно заменяет мутную
// плитку на чёткую и убирает крутилку (applyAlbumSharp в notification-helpers.js).
//
// Путь возвращается как cc-media:// — этот протокол зарегистрирован глобально
// (main/native/ccMediaProtocol.js, protocol.handle на default-сессии), а окно
// уведомления работает в default-сессии → cc-media в background-image отображается.

/**
 * Запускает фоновую догрузку чёткого превью для одной части альбома.
 * Для не-альбомных или не-медиа сообщений — ничего не делает.
 * @param {object} message — сообщение native-формата (id, groupedId, mediaType, ...)
 * @param {string} chatId — полный chatId ('accountId:rawId')
 */
export function preloadAlbumThumb(message, chatId) {
  if (!message || !message.groupedId || message.id == null || !chatId) return
  const t = message.mediaType
  if (t !== 'photo' && t !== 'video') return // превью есть только у фото/видео
  try {
    window.api?.invoke('tg:download-media', { chatId, messageId: message.id, thumb: true })
      .then((r) => {
        if (r && r.ok && r.path) {
          try {
            window.api?.send('notif:album-thumb', {
              albumId: String(message.groupedId),
              messageId: String(message.id),
              src: r.path,
            })
          } catch (_) {}
        }
      })
      .catch(() => {})
  } catch (_) {}
}
