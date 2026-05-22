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

import fs from 'node:fs'
import path from 'node:path'
import { downloadFile, stabilizeForPlayback } from './tdlibMedia.js'

// v0.91.8 (Совет 2): персистентный кэш на диске. JSON-метадата emojiId → {url, mime, alt}
// в userData/forum-emoji-meta.json. При старте приложения подхватывается, юзер сразу
// видит реальные emoji вместо букв-заглушек. Сами файлы (.webp/.webm) лежат в tg-media/
// и не сбрасываются между сессиями (TDLib local cache).
const META_FILE = 'forum-emoji-meta.json'

const emojiCache = new Map()
let metaInitFromDir = null  // путь userData с которого инициализировали (для записи)
let saveTimer = null

function metaFilePath(userDataDir) {
  return path.join(userDataDir, META_FILE)
}

function loadCacheFromDisk(userDataDir) {
  if (!userDataDir || metaInitFromDir === userDataDir) return
  metaInitFromDir = userDataDir
  try {
    const raw = fs.readFileSync(metaFilePath(userDataDir), 'utf8')
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return
    for (const [emojiId, meta] of Object.entries(obj)) {
      if (!meta || typeof meta !== 'object') continue
      // Валидируем URL: если cc-media://media/<name> и файл существует в tg-media/ — берём.
      // Иначе кладём только alt+mime (UI fallback).
      let url = meta.url || null
      if (url && url.startsWith('cc-media://media/')) {
        const fileName = url.slice('cc-media://media/'.length)
        const absPath = path.join(userDataDir, 'tg-media', fileName)
        if (!fs.existsSync(absPath)) url = null
      }
      emojiCache.set(emojiId, { url, mime: meta.mime || '', alt: meta.alt || '' })
    }
    try { console.log('[forum-emoji] loaded ' + emojiCache.size + ' entries from disk') } catch (_) {}
  } catch (_) { /* нет файла / некорректный JSON — silent */ }
}

function saveCacheToDisk(userDataDir) {
  if (!userDataDir) return
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      const obj = {}
      for (const [emojiId, meta] of emojiCache.entries()) obj[emojiId] = meta
      fs.writeFileSync(metaFilePath(userDataDir), JSON.stringify(obj))
    } catch (_) { /* quota / disk full — silent */ }
  }, 2000)
}

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

  // v0.91.8: при первом вызове подхватываем кэш с диска (instant emoji после рестарта).
  if (ctx.userDataDir) loadCacheFromDisk(ctx.userDataDir)

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
  // v0.91.8: персистим кэш на диск (debounce 2с — чтобы не писать слишком часто).
  if (ctx.userDataDir && idsToFetch.length > 0) saveCacheToDisk(ctx.userDataDir)
  return topics
}

// Для тестов
export const _internal = { emojiCache, stickerMime }
