// v0.95.41: загрузка custom emoji premium для реакций и messageAnimatedEmoji.
//
// Паттерн полностью переиспользует tdlibForumEmoji.js (v0.91.6), но работает
// с массивом emojiIds (не из topics) и возвращает Map для UI.
//
// TDLib equivalent:
//   { '@type': 'getCustomEmojiStickers', custom_emoji_ids: [int64...] }
//   → { stickers: [Sticker] }
//
// Custom emoji в TDLib используются в:
//   - reactionTypeCustomEmoji (premium реакции)
//   - messageAnimatedEmoji.animated_emoji.sticker (анимированные emoji)
//   - text entities с TextEntityTypeCustomEmoji (премиум в тексте)
//
// Стратегия:
//   1. Принять массив unique IDs
//   2. invoke getCustomEmojiStickers (batch)
//   3. Для каждого sticker — downloadFile параллельно
//   4. stabilizeForPlayback → cc-media://media/<name>
//   5. Вернуть Map<emoji_id, { url, mime, alt }>
//
// Поддерживаемые форматы:
//   - stickerFormatWebp → image/webp → <img>
//   - stickerFormatWebm → video/webm → <video autoplay loop muted>
//   - stickerFormatTgs → application/x-tgsticker → fallback на alt (TGS lottie
//     не рендерится в Chromium без отдельного player'а)
//
// ОБЯЗАТЕЛЬНО прочитать перед правкой: .memory-bank/mistakes/outgoing-two-cases.md
// (handler message:new и producers — но это другая ловушка, здесь просто ссылка
// для будущих контекстов).

import fs from 'node:fs'
import path from 'node:path'
import { downloadFile, stabilizeForPlayback } from './tdlibMedia.js'

const META_FILE = 'custom-emoji-meta.json'

// In-memory кэш на сессию
const emojiCache = new Map()
let metaInitFromDir = null
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
      let url = meta.url || null
      if (url && url.startsWith('cc-media://media/')) {
        const fileName = url.slice('cc-media://media/'.length)
        const absPath = path.join(userDataDir, 'tg-media', fileName)
        if (!fs.existsSync(absPath)) url = null
      }
      emojiCache.set(emojiId, { url, mime: meta.mime || '', alt: meta.alt || '' })
    }
    try { console.log('[custom-emoji] loaded ' + emojiCache.size + ' entries from disk') } catch (_) {}
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

export function stickerMime(format) {
  const ft = format?.['@type']
  if (ft === 'stickerFormatWebp') return 'image/webp'
  if (ft === 'stickerFormatWebm') return 'video/webm'
  if (ft === 'stickerFormatTgs') return 'application/x-tgsticker'
  return ''
}

/**
 * Resolves custom emoji stickers for given IDs.
 *
 * @param {string[]|number[]} emojiIds — массив TDLib custom_emoji_id
 * @param {object} ctx — { client, manager, accountId, userDataDir }
 * @returns {Promise<{[id]: { url, mime, alt }}>} — объект id → meta
 */
export async function resolveCustomEmojiIds(emojiIds, ctx) {
  const result = {}
  if (!Array.isArray(emojiIds) || emojiIds.length === 0) return result
  if (!ctx?.client || !ctx?.manager || !ctx?.accountId) {
    try { console.log('[custom-emoji] SKIP — no ctx.client/manager/accountId') } catch (_) {}
    return result
  }

  if (ctx.userDataDir) loadCacheFromDisk(ctx.userDataDir)

  // Собираем уникальные IDs которых нет в кэше
  const idsToFetch = []
  const seen = new Set()
  for (const rawId of emojiIds) {
    const id = String(rawId || '')
    if (!id) continue
    if (seen.has(id)) continue
    seen.add(id)
    if (emojiCache.has(id)) {
      result[id] = emojiCache.get(id)
      continue
    }
    idsToFetch.push(id)
  }

  if (idsToFetch.length === 0) return result

  try { console.log('[custom-emoji] resolve: requesting=' + idsToFetch.length) } catch (_) {}

  try {
    const tdResult = await ctx.client.invoke({
      '@type': 'getCustomEmojiStickers',
      custom_emoji_ids: idsToFetch.map(id => String(id)),
    })
    const stickers = tdResult?.stickers || []
    for (const sticker of stickers) {
      const emojiId = String(sticker?.full_type?.custom_emoji_id ?? '')
      if (!emojiId) continue
      const mime = stickerMime(sticker.format)
      const alt = sticker.emoji || ''
      // TGS — рендер не поддерживаем, кэшируем только alt+mime
      if (mime === 'application/x-tgsticker') {
        const meta = { url: null, mime, alt }
        emojiCache.set(emojiId, meta)
        result[emojiId] = meta
        continue
      }
      const fileId = sticker?.sticker?.id
      if (fileId == null) {
        const meta = { url: null, mime, alt }
        emojiCache.set(emojiId, meta)
        result[emojiId] = meta
        continue
      }
      try {
        const dl = await downloadFile({ manager: ctx.manager, accountId: ctx.accountId, fileId })
        const absPath = dl?.path
        let url = null
        if (absPath && ctx.userDataDir) {
          url = stabilizeForPlayback(absPath, ctx.userDataDir, fileId)
        }
        const meta = { url, mime, alt }
        emojiCache.set(emojiId, meta)
        result[emojiId] = meta
      } catch (_) {
        const meta = { url: null, mime, alt }
        emojiCache.set(emojiId, meta)
        result[emojiId] = meta
      }
    }
  } catch (e) {
    try { console.log('[custom-emoji] ERROR: ' + (e?.message || e)) } catch (_) {}
  }

  if (ctx.userDataDir) saveCacheToDisk(ctx.userDataDir)
  return result
}

// Для тестов
export const _internal = { emojiCache, stickerMime }
