/**
 * v1.2.447 — полоса «нет связи» для «Общего чата» (Telegram через собственный канал).
 *
 * Веб-мессенджеры получили экран «Нет связи» в v1.2.445 (см. .memory-bank/reconnect-plan.md,
 * раздел 8 — там эта часть была осознанно отложена). Здесь закрывается вторая половина:
 * у родного «Общего чата» при обрыве связи не было НИКАКОГО объяснения — список чатов просто
 * замирал со старыми сообщениями, и человек не понимал, что связи нет.
 *
 * ── ЧЕМ ОТЛИЧАЕТСЯ ОТ ВЕБ-ЧАСТИ ───────────────────────────────────────────────
 * Веб-страницу переподключаем МЫ (лестница пауз, повтор загрузки). Здесь связь ведёт сам
 * Telegram-канал: он переподключается сам и присылает своё состояние. Поэтому наша задача —
 * ПОКАЗАТЬ состояние и дать кнопку настоящей проверки, а не изобретать второй механизм
 * повторов (он мешал бы встроенному и мог бы дать шторм запросов).
 *
 * ── 🔴 ПОЧЕМУ КОД НЕ ЗНАЕТ ТОЧНЫХ ИМЁН СОСТОЯНИЙ ──────────────────────────────
 * Папки с официальной документацией TDLib в проекте НЕТ (в `DOCS/` только Electron, React,
 * MDN и прочее), а в коде проекта эти имена нигде не встречались — раньше канал никто не
 * слушал. Угадывать строки в этом проекте уже приводило к неверным правкам, поэтому здесь
 * принято ОСОЗНАННОЕ решение:
 *   • полосу показываем ТОЛЬКО на состояниях, которые узнали наверняка (по части слова —
 *     «ждёт сеть» / «подключается»), плюс всегда — когда сам браузерный движок говорит
 *     «сети нет» (это документированный признак, `navigator.onLine` + события online/offline,
 *     DOCS/Electron docs/tutorial/online-offline-events.md);
 *   • НЕЗНАКОМОЕ состояние проблемой НЕ считаем. Ошибка тогда безобидна (полоса не
 *     появится), а не наоборот — вечная ложная полоса поверх чатов;
 *   • само состояние пишется в журнал как есть (`[tg-conn] …`), поэтому точные имена
 *     станут известны из первого же живого запуска, и список можно будет расширить фактом.
 */

/** Части имён состояний, которые ТОЧНО означают «связи ещё нет». */
export const BAD_STATE_MARKS = ['waitingfornetwork', 'connecting']
/** Части имён состояний, которые означают «связь есть» (idle или догоняет обновления). */
export const OK_STATE_MARKS = ['ready', 'updating']

/** Понятное человеку имя состояния. Незнакомое отдаём как есть — чтобы было видно в журнале. */
export function connectionLabel(state) {
  const s = String(state || '').toLowerCase()
  if (!s) return 'состояние неизвестно'
  if (s.includes('waitingfornetwork')) return 'ждём сеть'
  if (s.includes('connectingtoproxy')) return 'подключаемся через прокси'
  if (s.includes('connecting')) return 'подключаемся'
  if (s.includes('updating')) return 'догоняем сообщения'
  if (s.includes('ready')) return 'связь есть'
  return String(state)
}

/** «Связь есть» — по узнаваемой части имени. */
export function isOkState(state) {
  const s = String(state || '').toLowerCase()
  return OK_STATE_MARKS.some(m => s.includes(m))
}

/** «Связи точно нет» — только знакомые нам состояния (см. пояснение выше). */
export function isBadState(state) {
  const s = String(state || '').toLowerCase()
  if (!s || isOkState(s)) return false
  return BAD_STATE_MARKS.some(m => s.includes(m))
}

/**
 * Что показывать. Возвращает null, если показывать нечего.
 * @param {object} p
 * @param {Record<string,string>} p.states — состояние по аккаунтам { id: 'имя состояния' }
 * @param {boolean} p.online — говорит ли движок, что сеть есть
 * @param {number} p.since — когда беда началась (мс)
 * @param {number} p.now — текущее время (мс)
 */
export function stripVerdict({ states = {}, online = true, since = 0, now = 0 } = {}) {
  const bad = Object.keys(states).filter(id => isBadState(states[id]))
  if (online && bad.length === 0) return null
  const secs = since > 0 && now > since ? Math.floor((now - since) / 1000) : 0
  if (!online) {
    return {
      kind: 'offline',
      title: 'Нет связи с интернетом',
      hint: 'Общий чат продолжит работу сам, как только сеть вернётся',
      seconds: secs,
      accounts: bad.length,
    }
  }
  return {
    kind: 'connecting',
    title: 'Подключаемся к Telegram',
    hint: connectionLabel(states[bad[0]]) + (bad.length > 1 ? ` · аккаунтов: ${bad.length}` : ''),
    seconds: secs,
    accounts: bad.length,
  }
}

/** «5 с» / «1 мин 20 с» — для строки ожидания. */
export function waitingFor(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  if (s < 60) return `${s} с`
  const m = Math.floor(s / 60)
  return `${m} мин ${s % 60} с`
}

/** Записи в журнал (единый вид, как у веб-части). */
export function logStateLine(accountId, state) {
  return `[tg-conn] аккаунт ${accountId}: состояние=${state || '<пусто>'} (${connectionLabel(state)})`
}
export function logRestoredLine(accountId, seconds) {
  return `[tg-conn] аккаунт ${accountId}: связь восстановлена за ${Math.max(0, Math.floor(seconds || 0))}с`
}
export function logCheckLine() {
  return '[tg-conn] проверка связи по кнопке пользователя'
}
