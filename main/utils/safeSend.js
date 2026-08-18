// v1.2.274: безопасная отправка сообщения в окно из main-процесса.
//
// ЗАЧЕМ. `webContents.send(...)` в окно, чей рендер-фрейм уже уничтожен (гонка при закрытии
// окна дока/закрепа или во время навигации), заставляет Electron писать в консоль
// "Render frame was disposed before WebFrameMain could be accessed". Это НЕ краш, но засоряет
// ERROR-журнал. Проверка только `win.isDestroyed()` недостаточна: окно может быть ещё «живым»,
// а его webContents/фрейм — уже уничтожен.
//
// КАК РАБОТАЕТ. Проверяем И окно (`win.isDestroyed()`), И его webContents (`webContents.isDestroyed()`),
// плюс try/catch на случай гонки между проверкой и самой отправкой. Если окно/фрейм мертвы —
// тихо пропускаем (возвращаем false), не бросая и не логируя.
//
// Обобщает inline-паттерн из main/native/backends/tdlibStartup.js (sendToRenderer).
export function safeSend(win, channel, ...args) {
  try {
    const wc = win && !win.isDestroyed?.() ? win.webContents : null
    if (wc && !wc.isDestroyed?.()) {
      wc.send(channel, ...args)
      return true
    }
  } catch (_) { /* фрейм исчез между проверкой и отправкой — гонка при закрытии */ }
  return false
}
