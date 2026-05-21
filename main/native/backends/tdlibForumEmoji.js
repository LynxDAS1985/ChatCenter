// v0.91.6: загрузка custom emoji для иконок форум-тем (вернули GramJS-feature).
//
// При миграции на TDLib (v0.89.0) эта функциональность была утеряна:
// в GramJS backend темы получали `iconEmojiUrl` через `messages.GetCustomEmojiDocuments`
// + кэширование в `tg-media/custom_emoji_<id>.<ext>`. Полная история — в
// .memory-bank/group-topic-investigation.md (строки 681-743).
//
// TDLib equivalent — [`getCustomEmojiStickers`](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_custom_emoji_stickers.html):
//   { '@type': 'getCustomEmojiStickers', custom_emoji_ids: [int64...] }
//   → { stickers: [Sticker] }
//
// Каждый Sticker имеет:
//   - sticker.full_type.custom_emoji_id (string int64) — для маппинга
//   - sticker.format = { '@type': 'stickerFormatWebp'|'stickerFormatWebm'|'stickerFormatTgs' }
//   - sticker.sticker = File (TDLib File object, нужен downloadFile)
//   - sticker.emoji (string) — alt emoji (можно показать пока не загрузился)
//
// Стратегия:
//   1. Собрать unique iconCustomEmojiId из topics
//   2. invoke getCustomEmojiStickers (batch)
//   3. Для каждого sticker — downloadFile (limit ~10 параллельно, остальное не блокирует)
//   4. stabilizeForPlayback → cc-media://media/<name>
//   5. Map<emoji_id, { url, mime, alt }>
//   6. На topics применить — добавить поля iconEmojiUrl/iconEmojiMimeType/iconEmoji
//
// .tgs (animated lottie) — Chromium не рендерит в <img>. UI fall-back на alt emoji
// (sticker.emoji) когда mime === application/x-tgsticker.

import { downloadFile, stabilizeForPlayback } from './tdlibMedia.js'

// In-memory кэш — для resolved emojis в рамках сессии. Ключ = emojiId, значение =
// { url, mime, alt }. Cache живёт пока процесс не перезапущен. При перезапуске
// файлы остаются в tg-media/, повторное скачивание не нужно (TDLib local cache).
const emojiCache = new Map()

function stickerMime(format) {
  const ft = format?.['@type']
  if (ft === 'stickerFormatWebp') return 'image/webp'
  if (ft === 'stickerFormatWebm') return 'video/webm'
  if (ft === 'stickerFormatTgs') return 'application/x-tgsticker'
  return ''
}

/**
 * Resolves all custom emoji icons for given topics, mutating each topic with
 * iconEmojiUrl / iconEmojiMimeType / iconEmoji where possible.
 *
 * @param {Array} topics — массив тем (изменяется на месте)
 * @param {object} ctx
 * @param {object} ctx.client — TDLib client (invoke)
 * @param {object} ctx.manager — TDLib manager (downloadFile)
 * @param {string} ctx.accountId — для downloadFile
 * @param {string} [ctx.userDataDir] — для stabilizeForPlayback (cc-media URL)
 */
export async function resolveTopicEmojis(topics, ctx) {
  if (!Array.isArray(topics) || topics.length === 0) return topics
  if (!ctx?.client || !ctx?.manager || !ctx?.accountId) return topics

  // Собираем unique IDs которых нет в кэше.
  const idsToFetch = []
  const seen = new Set()
  for (const t of topics) {
    const id = t.iconCustomEmojiId
    if (!id) continue
    if (seen.has(id)) continue
    seen.add(id)
    if (!emojiCache.has(id)) idsToFetch.push(id)
  }

  // Если есть что загрузить — invoke getCustomEmojiStickers.
  if (idsToFetch.length > 0) {
    try {
      const result = await ctx.client.invoke({
        '@type': 'getCustomEmojiStickers',
        custom_emoji_ids: idsToFetch.map(id => String(id)),
      })
      const stickers = result?.stickers || []
      for (const sticker of stickers) {
        const emojiId = String(sticker?.full_type?.custom_emoji_id ?? '')
        if (!emojiId) continue
        const mime = stickerMime(sticker.format)
        const alt = sticker.emoji || ''
        // .tgs мы не можем отрендерить — кэшируем только alt + mime для UI fallback.
        if (mime === 'application/x-tgsticker') {
          emojiCache.set(emojiId, { url: null, mime, alt })
          continue
        }
        const fileId = sticker?.sticker?.id
        if (fileId == null) {
          emojiCache.set(emojiId, { url: null, mime, alt })
          continue
        }
        // Запускаем downloadFile (не ждём всех параллельно — пусть UI получит
        // alt сразу, файл подтянется при следующем рендере темы).
        try {
          const dl = await downloadFile({ manager: ctx.manager, accountId: ctx.accountId, fileId })
          const absPath = dl?.path
          let url = null
          if (absPath && ctx.userDataDir) {
            url = stabilizeForPlayback(absPath, ctx.userDataDir, fileId)
          }
          emojiCache.set(emojiId, { url, mime, alt })
        } catch (_) {
          emojiCache.set(emojiId, { url: null, mime, alt })
        }
      }
    } catch (e) {
      try { console.log('[forum-emoji] getCustomEmojiStickers ERROR: ' + (e?.message || e)) } catch (_) {}
    }
  }

  // Применяем к topics.
  for (const t of topics) {
    const id = t.iconCustomEmojiId
    if (!id) continue
    const cached = emojiCache.get(id)
    if (!cached) continue
    t.iconEmojiUrl = cached.url || null
    t.iconEmojiMimeType = cached.mime || ''
    t.iconEmoji = cached.alt || ''
  }
  return topics
}

// Для тестов
export const _internal = { emojiCache, stickerMime }
