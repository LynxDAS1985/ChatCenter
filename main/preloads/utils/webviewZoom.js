// Зум WebView: Ctrl+колёсико и Ctrl+клавиши → IPC к хосту.
//
// v1.2.463: вынесено из monitor.preload.cjs (он упёрся в потолок 600 строк при добавлении
// проверки «своё отправленное» для МАКС). Правило проекта — не резать комментарии, а разгружать
// файл. Блок самодостаточный: ему нужны только document и ipcRenderer, состояния он не держит.
// Поведение НЕ менялось — тот же код, те же каналы `zoom-change` / `zoom-reset`.

/**
 * Вешает обработчики зума на документ страницы мессенджера.
 * Вызывается один раз при загрузке preload.
 * @param {{sendToHost: Function}} ipcRenderer — мост до окна-хозяина
 */
function bindWebviewZoom(ipcRenderer) {
  if (!ipcRenderer || typeof document === 'undefined') return
  document.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return
    e.preventDefault()
    try { ipcRenderer.sendToHost('zoom-change', { delta: e.deltaY < 0 ? 5 : -5 }) } catch (ex) {}
  }, { passive: false })

  document.addEventListener('keydown', function (e) {
    if (!e.ctrlKey) return
    if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      try { ipcRenderer.sendToHost('zoom-change', { delta: 10 }) } catch (ex) {}
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      try { ipcRenderer.sendToHost('zoom-change', { delta: -10 }) } catch (ex) {}
    } else if (e.key === '0') {
      e.preventDefault()
      try { ipcRenderer.sendToHost('zoom-reset') } catch (ex) {}
    }
  })
}

module.exports = { bindWebviewZoom }
