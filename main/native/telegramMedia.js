// v0.87.85: IPC handlers медиа — download (фото/видео), cleanup, размер кэша.
// Извлечён из telegramHandler.js (Шаг 7/7 разбиения).
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { state, chatEntityMap, log } from './telegramState.js'

export function initMediaHandlers() {
  // v0.87.34: скачивание видео с progress events для <video> streaming player.
  // Эмитит tg:media-progress { chatId, messageId, bytes, total } каждый чанк.
  // По окончании возвращает cc-media:// путь — UI откроет его в <video controls src=...>
  // и браузер через Range requests играет сразу, не дожидаясь полного файла.
  ipcMain.handle('tg:download-video', async (event, { chatId, messageId }) => {
    log(`download-video: chat=${chatId} msg=${messageId}`)
    try {
      if (!state.client) return { ok: false, error: 'Не подключён' }
      const mediaDir = path.join(path.dirname(state.cachePath), 'tg-media')
      try { fs.mkdirSync(mediaDir, { recursive: true }) } catch(_) {}
      const rawChat = String(chatId).split(':').pop()
      // video файл — .mp4 (большинство видео в Telegram)
      const filePath = path.join(mediaDir, `${rawChat}_${messageId}_video.mp4`)
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
        log(`download-video: cached ${filePath}`)
        return { ok: true, path: `cc-media://video/${encodeURIComponent(path.basename(filePath))}`, cached: true }
      }
      const entity = chatEntityMap.get(chatId) || rawChat
      const msgs = await state.client.getMessages(entity, { ids: [Number(messageId)] })
      if (!msgs[0]) return { ok: false, error: 'Сообщение не найдено' }
      if (!msgs[0].media) return { ok: false, error: 'Нет медиа' }
      const total = Number(msgs[0].media.document?.size) || 0
      // Используем client.downloadMedia с progressCallback для live-событий
      const buf = await state.client.downloadMedia(msgs[0], {
        progressCallback: (got) => {
          try {
            event.sender.send('tg:media-progress', {
              chatId, messageId, bytes: Number(got) || 0, total,
            })
          } catch(_) {}
        }
      })
      if (!buf) return { ok: false, error: 'Telegram вернул пусто' }
      fs.writeFileSync(filePath, buf)
      log(`download-video: OK size=${buf.length}`)
      return { ok: true, path: `cc-media://video/${encodeURIComponent(path.basename(filePath))}`, total }
    } catch (e) {
      log('download-video err: ' + e.message)
      return { ok: false, error: e.message }
    }
  })

  // v0.87.22: поддержка thumb-режима — быстрое превью ~20КБ вместо полного фото ~300КБ
  ipcMain.handle('tg:download-media', async (_, { chatId, messageId, thumb = true }) => {
    log(`download-media: chat=${chatId} msg=${messageId} thumb=${thumb}`)
    try {
      if (!state.client) return { ok: false, error: 'Не подключён' }
      const mediaDir = path.join(path.dirname(state.cachePath), 'tg-media')
      try { fs.mkdirSync(mediaDir, { recursive: true }) } catch(_) {}
      const rawChat = String(chatId).split(':').pop()
      const suffix = thumb ? '_thumb' : ''
      const filePath = path.join(mediaDir, `${rawChat}_${messageId}${suffix}.jpg`)
      if (fs.existsSync(filePath)) {
        return { ok: true, path: `cc-media://media/${encodeURIComponent(path.basename(filePath))}` }
      }
      const entity = chatEntityMap.get(chatId) || rawChat
      const msgs = await state.client.getMessages(entity, { ids: [Number(messageId)] })
      if (!msgs[0]) return { ok: false, error: 'Сообщение не найдено' }
      if (!msgs[0].media) return { ok: false, error: 'Нет медиа в сообщении' }
      // thumb=true → GramJS скачает наименьший thumbnail (быстро, ~10-50 КБ)
      // thumb=false → полное фото (для просмотра в полный размер)
      const buf = await state.client.downloadMedia(msgs[0], thumb ? { thumb: 0 } : {})
      if (!buf) return { ok: false, error: 'Telegram вернул пустой файл' }
      fs.writeFileSync(filePath, buf)
      log(`download-media: OK size=${buf.length} thumb=${thumb}`)
      return { ok: true, path: `cc-media://media/${encodeURIComponent(path.basename(filePath))}` }
    } catch (e) {
      log('download-media err: ' + e.message)
      return { ok: false, error: e.message }
    }
  })

  // v0.87.27 / v0.87.35: очистка tg-media по возрасту (maxDays) + LRU-квоте (maxBytes).
  // LRU удаляет самые старые (по mtime) когда общий размер превышает квоту.
  ipcMain.handle('tg:cleanup-media', async (_, { maxDays = 30, maxBytes = 2 * 1024 * 1024 * 1024 } = {}) => {
    try {
      if (!state.cachePath) return { ok: false, error: 'нет cache path' }
      const mediaDir = path.join(path.dirname(state.cachePath), 'tg-media')
      if (!fs.existsSync(mediaDir)) return { ok: true, removed: 0 }
      const entries = []
      for (const f of fs.readdirSync(mediaDir)) {
        const fp = path.join(mediaDir, f)
        try {
          const st = fs.statSync(fp)
          entries.push({ fp, size: st.size, mtime: st.mtimeMs })
        } catch(_) {}
      }
      const cutoff = Date.now() - maxDays * 86400000
      let removed = 0, bytesFree = 0
      // 1) По возрасту — удаляем всё старее maxDays
      for (const e of entries) {
        if (e.mtime < cutoff) {
          try { fs.unlinkSync(e.fp); bytesFree += e.size; removed++; e.deleted = true } catch(_) {}
        }
      }
      // 2) LRU квота — если всё ещё > maxBytes, удаляем самые старые до квоты
      const remaining = entries.filter(e => !e.deleted).sort((a, b) => a.mtime - b.mtime)
      let totalSize = remaining.reduce((s, e) => s + e.size, 0)
      for (const e of remaining) {
        if (totalSize <= maxBytes) break
        try { fs.unlinkSync(e.fp); totalSize -= e.size; bytesFree += e.size; removed++ } catch(_) {}
      }
      log(`cleanup-media: removed=${removed} freed=${(bytesFree/1024/1024).toFixed(1)}MB totalKeep=${(totalSize/1024/1024).toFixed(1)}MB`)
      return { ok: true, removed, bytesFree, totalSize }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // v0.87.35: получить размер кэша медиа (для UI настроек / админ панели)
  ipcMain.handle('tg:media-cache-size', async () => {
    try {
      if (!state.cachePath) return { ok: false, size: 0, count: 0 }
      const mediaDir = path.join(path.dirname(state.cachePath), 'tg-media')
      if (!fs.existsSync(mediaDir)) return { ok: true, size: 0, count: 0 }
      let size = 0, count = 0
      for (const f of fs.readdirSync(mediaDir)) {
        try { const st = fs.statSync(path.join(mediaDir, f)); size += st.size; count++ } catch(_) {}
      }
      return { ok: true, size, count }
    } catch (e) { return { ok: false, error: e.message } }
  })
}
