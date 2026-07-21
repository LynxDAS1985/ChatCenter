// v1.2.95: строим поле `album` для payload уведомления нативного Telegram.
// Для media-group (несколько фото/видео одним постом, есть message.groupedId) — как было.
// Для ОДИНОЧНОГО фото/видео с готовой мини-картинкой (strippedThumb) — тоже строим
// карточку-«альбом» из ОДНОЙ плитки, чтобы картинка показывалась в уведомлении так же,
// как у поста из нескольких фото (рисовалка renderAlbumGrid умеет 1 плитку — «wide»).
// Ссылки-превью (mediaType === 'link') сюда НЕ попадают: у них картинка внутри web_page,
// её мы отдельно не извлекаем (см. decisions.md ADR-019).
//
// Лежит в корневом shared/ (как vkExecFallback.js), а НЕ в src/, чтобы не входить в
// общий renderer-бюджет (лимит не поднимаем — правило проекта). Чистая функция без
// Electron/DOM → покрыта юнит-тестом src/native/store/notifAlbum.vitest.js.

/**
 * @param {object|null} message — сообщение native-формата (id, groupedId, mediaType, strippedThumb, text)
 * @param {string} chatId — полный chatId ('accountId:rawId')
 * @returns {object|null} поле album для payload, либо null (текстовая карточка)
 */
export function buildNotifAlbum(message, chatId) {
  if (!message) return null
  // media-group — поведение как до v1.2.95 (объект тот же).
  if (message.groupedId) {
    return {
      id: String(message.groupedId),
      chatId,
      tileThumb: message.strippedThumb || null,
      tileMessageId: message.id != null ? String(message.id) : null,
      tileText: message.text || null,
    }
  }
  // одиночное фото/видео с мини-картинкой → карточка из одной плитки.
  const isSinglePhotoVideo = !!message.strippedThumb && (message.mediaType === 'photo' || message.mediaType === 'video')
  if (!isSinglePhotoVideo || message.id == null) return null
  return {
    id: 'single_' + String(message.id),
    chatId,
    tileThumb: message.strippedThumb || null,
    tileMessageId: String(message.id),
    tileText: message.text || null,
  }
}
