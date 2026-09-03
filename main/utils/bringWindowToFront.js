// v1.2.373: единый подъём главного окна на передний план с СОХРАНЕНИЕМ «на весь экран».
// Покрывает ОБА случая потери maximize:
//   1) окно СВЁРНУТО (в панель задач) → isMinimized()=true → restore() вернёт ПРЕДЫДУЩЕЕ состояние
//      (в т.ч. «на весь экран»). Голый show()/focus() у свёрнутого окна на Windows дал бы обычный размер.
//   2) окно СКРЫТО в трей (по ✕) → isMinimized()=false, но isMaximized() СОХРАНЯЕТСЯ через hide. show()
//      обычно возвращает развёрнутое; если Windows всё же дал обычный размер — подстраховка maximize().
// Работает над переданным объектом окна (без импорта electron) → тестируется с заглушкой.
// Заменяет разрозненные show()/focus() в обработчиках кликов по уведомлению/задаче.
export function bringWindowToFront(win) {
  try {
    if (!win || (win.isDestroyed && win.isDestroyed())) return
    const wantMax = !!(win.isMaximized && win.isMaximized()) // трей: развёрнутость сохранена, пока окно скрыто
    const wasMin = !!(win.isMinimized && win.isMinimized())
    if (wasMin && win.restore) win.restore()                 // свёрнуто → вернуть развёрнутое (не обычный размер)
    if (win.isVisible && !win.isVisible() && win.show) win.show()
    if (win.focus) win.focus()
    // Подстраховка для трея: было развёрнуто, а show() дал обычный размер → вернуть на весь экран.
    if (wantMax && win.isMaximized && !win.isMaximized() && win.maximize) win.maximize()
    try { console.log(`[win-up] wasMin=${wasMin} wantMax=${wantMax} maximized=${win.isMaximized ? win.isMaximized() : '?'}`) } catch (_) {}
  } catch (_) {}
}
