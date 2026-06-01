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
  if (!ctx?.client || !ctx?.manager || !ctx?.accountId) {
    // v0.95.29: лог если контекст невалиден — иначе будет silent fail.
    try { console.log('[forum-emoji] SKIP — no ctx.client/manager/accountId') } catch (_) {}
    return topics
  }

  // v0.91.8: при первом вызове подхватываем кэш с диска (instant emoji после рестарта).
  if (ctx.userDataDir) loadCacheFromDisk(ctx.userDataDir)

  // Собираем unique IDs которых нет в кэше.
  const idsToFetch = []
  const seen = new Set()
  let topicsWithCustomId = 0
  let topicsAlreadyCached = 0
  for (const t of topics) {
    const id = t.iconCustomEmojiId
    if (!id) continue
    topicsWithCustomId++
    if (seen.has(id)) continue
    seen.add(id)
    if (emojiCache.has(id)) { topicsAlreadyCached++; continue }
    idsToFetch.push(id)
  }
  // v0.95.29: лог сводки — для диагностики «у меня G вместо emoji» (юзер).
  // Если topicsWithCustomId=0 → у тем нет custom_emoji_id (General и т.п. — норма).
  // Если topicsAlreadyCached === seen.size → все из cache, ничего фетчить не нужно.
  // Если idsToFetch.length > 0 → реально идём в TDLib.
  try {
    console.log('[forum-emoji] resolve summary: topics=' + topics.length
      + ' withCustomId=' + topicsWithCustomId
      + ' uniqueIds=' + seen.size
      + ' alreadyCached=' + topicsAlreadyCached
      + ' toFetch=' + idsToFetch.length)
  } catch (_) {}

  // Если есть что загрузить — invoke getCustomEmojiStickers.
  if (idsToFetch.length > 0) {
    try {
      const result = await ctx.client.invoke({
        '@type': 'getCustomEmojiStickers',
        custom_emoji_ids: idsToFetch.map(id => String(id)),
      })
      const stickers = result?.stickers || []
      // v0.95.29: лог что вернулось от TDLib.
      try {
        console.log('[forum-emoji] getCustomEmojiStickers returned ' + stickers.length
          + ' stickers for ' + idsToFetch.length + ' ids')
      } catch (_) {}
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
  let appliedUrl = 0
  let appliedAltOnly = 0
  let appliedDefault = 0
  for (const t of topics) {
    // v0.95.29: для General-темы (без custom_emoji_id) ставим дефолтную иконку
    // 📢 (как в Telegram Desktop SVG-домик). Раньше показывалась буква "G".
    if (!t.iconCustomEmojiId) {
      if (t.isGeneral && !t.iconEmoji) {
        t.iconEmoji = '📢'  // дефолтная иконка для General топика
        appliedDefault++
      }
      continue
    }
    const cached = emojiCache.get(t.iconCustomEmojiId)
    if (!cached) continue
    t.iconEmojiUrl = cached.url || null
    t.iconEmojiMimeType = cached.mime || ''
    t.iconEmoji = cached.alt || ''
    if (cached.url) appliedUrl++
    else if (cached.alt) appliedAltOnly++
  }
  // v0.95.29: итоговая сводка применения.
  try {
    console.log('[forum-emoji] applied: url=' + appliedUrl
      + ' alt-only=' + appliedAltOnly
      + ' default-general=' + appliedDefault
      + ' / topics=' + topics.length)
  } catch (_) {}
  // v0.91.8: персистим кэш на диск (debounce 2с — чтобы не писать слишком часто).
  if (ctx.userDataDir && idsToFetch.length > 0) saveCacheToDisk(ctx.userDataDir)
  return topics
}

// Для тестов
export const _internal = { emojiCache, stickerMime }
