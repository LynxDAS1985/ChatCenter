// v1.2.232: копирование текста в буфер обмена.
// Основной путь — main-процесс через Electron `clipboard` (канал 'clipboard:write-text',
// см. mainIpcHandlers.js) — работает надёжно независимо от фокуса окна. Запасной —
// navigator.clipboard (на случай если IPC недоступен). Возвращает true при успехе.
//
// Используется «Карточкой контакта» (ContactCardModal) для копий имени/телефона/username.
export async function copyText(text) {
  const t = String(text ?? '')
  if (!t) return false
  try {
    const r = await window.api?.invoke?.('clipboard:write-text', t)
    if (r?.ok) return true
  } catch (_) { /* IPC недоступен — пробуем запасной путь */ }
  try {
    await navigator.clipboard?.writeText?.(t)
    return true
  } catch (_) { /* оба пути недоступны */ }
  // v1.2.233: сбой копирования — в журнал (renderer пишет только через app:log, CLAUDE.md).
  try { window.api?.send?.('app:log', { level: 'WARN', message: 'copyText: буфер обмена недоступен (оба пути)' }) } catch (_) {}
  return false
}
