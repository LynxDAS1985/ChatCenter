// v0.95.31: throttle быстрых кликов на одну реакцию.
//
// Юзер спамит 👍 (или ставит/убирает 5 раз за секунду) — без защиты каждый клик
// идёт в store.setReaction → backend.setReaction → TDLib addMessageReaction/
// removeMessageReaction. TDLib имеет rate-limit (FLOOD_WAIT при превышении).
//
// Паттерн: **leading-edge throttle** (как Discord/Slack).
// - Первый клик идёт МГНОВЕННО (UX не страдает — юзер видит результат сразу).
// - Последующие клики на ту же реакцию в течение intervalMs — игнорируются.
// - Через intervalMs можно снова кликнуть.
//
// key = `${chatId}:${msgId}:${emoji}` — независимая блокировка для каждой комбинации.
// Юзер может ставить разные эмодзи параллельно — throttle их не блокирует.
//
// Эталоны:
// - Discord — leading throttle 250мс per-reaction (исследование reverse-engineering 2024)
// - Slack — leading throttle 200мс
// - Telegram Desktop — пер-emoji guard в reactions.cpp

export function createReactionThrottler(intervalMs = 200) {
  const lastCalled = new Map()
  return function throttledReact(key, fn) {
    if (typeof key !== 'string' || !key) return false
    if (typeof fn !== 'function') return false
    const now = Date.now()
    const last = lastCalled.get(key) || 0
    if (now - last < intervalMs) return false
    lastCalled.set(key, now)
    try { fn() } catch (_) {}
    return true
  }
}
