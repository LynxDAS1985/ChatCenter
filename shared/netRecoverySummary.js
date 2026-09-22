// shared/netRecoverySummary.js — v1.2.492
//
// Итог возврата сети: сколько веб-страниц ОЖИЛИ САМИ, сколько ПЕРЕЗАГРУЖЕНЫ, сколько НЕ ПОДНЯЛИСЬ
// за первые 30 секунд после того, как пульс сказал «интернет появился».
//
// ЗАЧЕМ. Правило «два провала пробы → перезагрузка» (openPageWatch.js) — догадка: мы не знаем, всегда
// ли мессенджеры оживают сами. Одна сводная строка на каждый возврат сети через месяц покажет по
// журналу, нужна ли перезагрузка вообще или порог можно поднять. Построчные записи
// («ожила сама» / «восстановлена») есть, но считать их по журналу руками — долго.
//
// Состояние — модульное (не React): его наполняет попытка (reconnectAttempt через onOutcome),
// а окно (useOpenPageWatch) открывает и закрывает «окно подсчёта». Хранилище в хуке добавлять
// нельзя (страж «useRef в useWebviewReconnect = 2»), поэтому счётчик живёт здесь.

export const RECOVERY_WINDOW_MS = 30000

const st = { startedAt: 0, counts: null, waiting: 0 }

function fresh() { return { selfHealed: 0, restored: 0, failed: 0, netDown: 0, noElement: 0 } }

/**
 * Пульс сказал «появился» → начать считать. v1.2.493: если сеть «дребезжит» и второе «появился» пришло,
 * пока окно ещё открыто, окно ПРОДЛЕВАЕТСЯ (счёт не обнуляется) — иначе первые исходы терялись, а сводка
 * писалась дважды (найдено ревью v1.2.492: два перехода за 10 с → две строки «попыток не было»).
 * @param {number} now
 * @param {number} [waiting] — сколько мессенджеров ждали повтора в момент возврата (для строки «ждали N»)
 * @returns {boolean} true = окно новое, false = продлили открытое
 */
export function startRecoveryWindow(now = Date.now(), waiting = 0) {
  const open = st.counts && now - st.startedAt <= RECOVERY_WINDOW_MS
  st.startedAt = now
  if (open) { st.waiting = Math.max(st.waiting, Number(waiting) || 0); return false }
  st.counts = fresh(); st.waiting = Number(waiting) || 0
  return true
}

/** Исход одной попытки (см. reconnectAttempt: 'restored' | 'self-healed' | 'failed' | 'net-down' | 'no-element'). */
export function noteOutcome(_id, result, now = Date.now()) {
  if (!st.counts || now - st.startedAt > RECOVERY_WINDOW_MS) return false
  const key = { 'self-healed': 'selfHealed', restored: 'restored', failed: 'failed', 'net-down': 'netDown', 'no-element': 'noElement' }[result]
  if (!key) return false
  st.counts[key]++
  return true
}

/** Строка для журнала. null — если окно подсчёта не открывали. */
export function summaryLine(now = Date.now()) {
  if (!st.counts) return null
  const c = st.counts
  const total = c.selfHealed + c.restored + c.failed + c.netDown + c.noElement
  const sec = Math.round(RECOVERY_WINDOW_MS / 1000)
  const waited = st.waiting ? ` · ждали повтора ${st.waiting}` : ''
  if (total === 0) return `[net-pulse] итог возврата сети за ${sec} с: попыток не было${waited}` + (st.waiting ? '' : ' (все страницы были живы или ждать было нечего)')
  return `[net-pulse] итог возврата сети за ${sec} с: ожили сами ${c.selfHealed} · перезагружены ${c.restored} · не поднялись ${c.failed}${waited}`
    + (c.netDown ? ` · отложены без интернета ${c.netDown}` : '') + (c.noElement ? ` · страницы не было ${c.noElement}` : '')
}

/** Для тестов. */
export function _resetRecoverySummary() { st.startedAt = 0; st.counts = null; st.waiting = 0 }
