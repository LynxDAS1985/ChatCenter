// v0.87.95: helpers полной уборки при logout — подсчёт + удаление + чистка памяти.
// Вынесено из telegramChats.js (тот превышал лимит 500 строк).
//
// collectCleanupStats() — безопасный подсчёт что будет удалено (для предпросмотра в UI).
// performFullWipe() — реально удаляет всё + чистит Map'ы и таймер.

import fs from 'node:fs'
import path from 'node:path'
import { state, chatEntityMap, markReadMaxSent } from './telegramState.js'

// v0.87.95: подсчёт без удаления — для предпросмотра в окне выхода.
// Возвращает { totalFiles, totalBytes, byCategory: { session, avatars, cache, media, tmp } }.
export function collectCleanupStats() {
  const result = makeEmptyResult()
  countFile(state.sessionPath, 'session', result)
  countDir(state.avatarsDir, 'avatars', result)
  countFile(state.cachePath, 'cache', result)
  if (state.cachePath) {
    const userData = path.dirname(state.cachePath)
    countDir(path.join(userData, 'tg-media'), 'media', result)
    countDir(path.join(userData, 'tg-tmp'), 'tmp', result)
  }
  return result
}

// v0.87.95: полная уборка — удаляет все файлы Telegram + чистит Map'ы и таймер.
// Возвращает отчёт что реально удалилось (для журнала + toast).
export function performFullWipe() {
  const result = makeEmptyResult()
  wipeFile(state.sessionPath, 'session', result)
  wipeDir(state.avatarsDir, 'avatars', result)
  wipeFile(state.cachePath, 'cache', result)
  if (state.cachePath) {
    const userData = path.dirname(state.cachePath)
    wipeDir(path.join(userData, 'tg-media'), 'media', result)
    wipeDir(path.join(userData, 'tg-tmp'), 'tmp', result)
  }
  // Чистка памяти — Map'ы и таймер
  chatEntityMap.clear()
  markReadMaxSent.clear()
  if (state.unreadRescanTimer) {
    clearInterval(state.unreadRescanTimer)
    state.unreadRescanTimer = null
  }
  return result
}

// ── Internal helpers ──

function makeEmptyResult() {
  return {
    totalFiles: 0,
    totalBytes: 0,
    byCategory: {
      session: { files: 0, bytes: 0 },
      avatars: { files: 0, bytes: 0 },
      cache: { files: 0, bytes: 0 },
      media: { files: 0, bytes: 0 },
      tmp: { files: 0, bytes: 0 },
    },
  }
}

function countFile(fp, key, result) {
  if (!fp || !fs.existsSync(fp)) return
  try {
    const st = fs.statSync(fp)
    if (st.isFile()) {
      result.byCategory[key].files++
      result.byCategory[key].bytes += st.size
      result.totalFiles++
      result.totalBytes += st.size
    }
  } catch (_) {}
}

function countDir(dir, key, result) {
  if (!dir || !fs.existsSync(dir)) return
  try {
    for (const f of fs.readdirSync(dir)) {
      try {
        const fp = path.join(dir, f)
        const st = fs.statSync(fp)
        if (st.isFile()) {
          result.byCategory[key].files++
          result.byCategory[key].bytes += st.size
          result.totalFiles++
          result.totalBytes += st.size
        }
      } catch (_) {}
    }
  } catch (_) {}
}

function wipeFile(fp, key, result) {
  if (!fp || !fs.existsSync(fp)) return
  try {
    const st = fs.statSync(fp)
    if (st.isFile()) {
      const size = st.size
      fs.unlinkSync(fp)
      result.byCategory[key].files++
      result.byCategory[key].bytes += size
      result.totalFiles++
      result.totalBytes += size
    }
  } catch (_) {}
}

function wipeDir(dir, key, result) {
  if (!dir || !fs.existsSync(dir)) return
  try {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f)
      try {
        const st = fs.statSync(fp)
        if (st.isFile()) {
          const size = st.size
          fs.unlinkSync(fp)
          result.byCategory[key].files++
          result.byCategory[key].bytes += size
          result.totalFiles++
          result.totalBytes += size
        }
      } catch (_) {}
    }
  } catch (_) {}
}
