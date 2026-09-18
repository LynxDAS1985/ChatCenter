// v1.2.482 — ОТПРАВКА СЛУЖЕБНЫХ СООБЩЕНИЙ ХОСТУ из монитора веб-страницы.
//
// ── ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ ──────────────────────────────────────────────────────
// Вынесено из `monitor.preload.cjs`: тот дорос до 98 % своего потолка (600 строк), а правило
// проекта запрещает резать комментарии ради места — надо выносить. Эти две отправки ни от чего
// в мониторе не зависят: им нужны только канал связи и тип мессенджера.
//
// ── ПОЧЕМУ ИМЕННО ЭТОТ КАНАЛ ──────────────────────────────────────────────────
// `sendToHost('monitor-diag', …)` ДОКАЗАННО доходит до журнала (слушатель — `src/utils/webviewSetup.js`),
// а `console.log` из мира preload — НЕТ: за всю историю журнала от него 0 записей (ADR-071).
//
// ── ПРО ДЛИННЫЕ СООБЩЕНИЯ ─────────────────────────────────────────────────────
// Длинный текст режется на куски по 12 000 знаков с пометкой `[DIAG-CHUNK i/N]`: цельным он в
// журнал не попадёт. Куски собираются глазами при чтении журнала.

/**
 * @param {object} deps — { ipcRenderer, getMessengerType }
 * @returns {{ sendMonitorDiag: function, sendMonitorReady: function }}
 */
function createMonitorSend({ ipcRenderer, getMessengerType }) {
  function sendMonitorDiag(message) {
    const text = String(message || '')
    const chunkSize = 12000
    try {
      if (text.length <= chunkSize) {
        ipcRenderer.sendToHost('monitor-diag', text)
        return
      }
      const total = Math.ceil(text.length / chunkSize)
      for (let i = 0; i < total; i++) {
        ipcRenderer.sendToHost('monitor-diag', `[DIAG-CHUNK ${i + 1}/${total}] ${text.slice(i * chunkSize, (i + 1) * chunkSize)}`)
      }
    } catch(e) {}
  }


  function sendMonitorReady(stage) {
    try {
      ipcRenderer.sendToHost('monitor-ready', {
        stage,
        type: getMessengerType(),
        url: location.href,
        ready: document.readyState,
        ts: Date.now(),
      })
    } catch(e) {}
  }
  return { sendMonitorDiag, sendMonitorReady }
}

module.exports = { createMonitorSend }
