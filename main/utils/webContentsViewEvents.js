// main/utils/webContentsViewEvents.js — v1.2.500
//
// Подписки на события одного WebContentsView: запись в журнал + проброс наружу.
// Вынесено из main/utils/webContentsViewManager.js — тот упёрся в 300 строк, а правило проекта
// требует РАЗДЕЛЯТЬ файл, а не резать комментарии и не поднимать лимит (CLAUDE.md, ADR-044).
//
// Блок обособленный: он ничего не знает о создании и размещении вида — только вешает слушателей
// на уже готовый webContents и складывает события в общий поток менеджера.

/** События, которые менеджер пробрасывает наружу (окно приложения слушает их как у обычной вкладки). */
const FORWARDED = [
  'did-finish-load', 'dom-ready', 'did-fail-load', 'did-navigate-in-page', 'did-frame-finish-load',
  'did-start-loading', 'did-stop-loading', 'render-process-gone', 'unresponsive',
  'page-title-updated', 'console-message',
]

/**
 * Повесить запись в журнал и проброс событий.
 * @param {object} wc — webContents вида
 * @param {string} id — наш идентификатор вида (попадает в записи журнала)
 * @param {(event: string, payload: object) => void} emit — как отдать событие наружу
 */
export function attachViewEvents(wc, id, emit) {
  if (!wc || typeof wc.on !== 'function') return
  wc.on('render-process-gone', (_e, d) => console.error(`[wcv-mgr] RPG id=${id} reason=${d?.reason} exit=${d?.exitCode}`))
  wc.on('did-fail-load', (_e, c, d, u, m) => console.error(`[wcv-mgr] fail-load id=${id} c=${c} "${d}" url=${u} main=${m}`))
  wc.on('did-start-loading', () => console.log(`[wcv-mgr] start-loading id=${id}`))

  // v0.89.52: каждое событие в своём try — если одно свалится, остальные продолжают работать.
  try {
    for (const name of FORWARDED) {
      wc.on(name, (...args) => { try { emit(name, { viewId: id, args }) } catch (_) {} })
    }
    wc.on('ipc-message', (event, channel, ...args) => {
      try { emit('ipc-message', { viewId: id, channel, args }) } catch (_) {}
    })
    console.log(`[wcv-mgr] events forwarded id=${id}`)
  } catch (e) {
    console.error(`[wcv-mgr] forwarding events FAILED: ${e?.message || e}`)
  }
}
