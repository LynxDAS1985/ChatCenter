// v0.89.45 (Совет 4 расширение): агрегированная метрика hit/miss IndexedDB кэша.
//
// ЗАЧЕМ: до v0.89.45 каждый вызов loadCacheMessages писал свою строку в лог.
// За час активного пользования это ~сотни строк, лог тяжелее анализировать.
//
// КАК: окно 30 секунд. recordIdbCache(op, hit) копит счётчики, по истечении
// окна — одна агрегированная строка `idb-cache-window` со статистикой по
// каждому op (loadMessages, selectForumTopic). Если в окне 0 событий — лог
// не пишется (нет шума при простое).
//
// При оптимизации (расширение лимита, TTL) — смотреть процент hits в этой
// одной строке. Чем выше hits/(hits+misses), тем эффективнее кэш.

import { logNativeScroll } from './scrollDiagnostics.js'

const WINDOW_MS = 30_000

const stats = new Map() // op → { hits, misses }
let flushTimer = null

function ensureBucket(op) {
  let b = stats.get(op)
  if (!b) { b = { hits: 0, misses: 0 }; stats.set(op, b) }
  return b
}

function flushNow() {
  flushTimer = null
  if (stats.size === 0) return
  const summary = {}
  let total = 0
  for (const [op, b] of stats.entries()) {
    summary[op] = { h: b.hits, m: b.misses, rate: (b.hits / Math.max(1, b.hits + b.misses)).toFixed(2) }
    total += b.hits + b.misses
  }
  stats.clear()
  if (total === 0) return
  logNativeScroll('idb-cache-window', { windowMs: WINDOW_MS, summary })
}

/**
 * Зарегистрировать одну попытку чтения IDB кэша.
 * @param {string} op — 'loadMessages' | 'selectForumTopic' | ...
 * @param {boolean} hit — true если кэш вернул сообщения, false если пусто
 */
export function recordIdbCache(op, hit) {
  const b = ensureBucket(op)
  if (hit) b.hits++; else b.misses++
  if (!flushTimer) flushTimer = setTimeout(flushNow, WINDOW_MS)
}

// Только для тестов — позволяет сбросить агрегатор без ожидания окна.
export function _resetIdbCacheMetricsForTests() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  stats.clear()
}
