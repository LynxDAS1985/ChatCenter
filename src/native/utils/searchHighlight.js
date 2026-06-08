// v0.95.42: разбивка строки на фрагменты с подсветкой совпадений.
//
// Используется в ChatListItem для подсветки query внутри chat.title / lastMessage.
// Возвращает массив [{text, match}] — каждый элемент это либо обычный текст,
// либо совпавший фрагмент (для рендера через <mark>).
//
// Эталоны:
//   - Slack global search — yellow highlight
//   - Telegram Web K — highlight через DOM split
//   - VS Code Find — выделение совпадений в результатах
//
// Безопасность:
//   - regex escape (защита от ReDoS / неверного pattern из query)
//   - case-insensitive (юзер ищет «страх» → находит «Страховая»)
//   - пустой query → весь текст без подсветки

// Escape regex specials — защита от ввода типа `.*+?^${}()|[]\`
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Разбивает текст на фрагменты для подсветки совпадений с query.
 * @param {string} text — оригинальный текст (например chat.title)
 * @param {string} query — поисковый запрос
 * @returns {Array<{text: string, match: boolean}>}
 */
export function splitWithHighlights(text, query) {
  const t = String(text == null ? '' : text)
  const q = String(query == null ? '' : query).trim()
  if (!t || !q) return [{ text: t, match: false }]
  const escaped = escapeRegex(q)
  if (!escaped) return [{ text: t, match: false }]
  let re
  try {
    re = new RegExp('(' + escaped + ')', 'gi')
  } catch (_) {
    return [{ text: t, match: false }]
  }
  const parts = t.split(re)
  // parts чередуются: [before, match, after, match, after, ...]
  const out = []
  for (const part of parts) {
    if (!part) continue
    out.push({ text: part, match: part.toLowerCase() === q.toLowerCase() })
  }
  return out.length > 0 ? out : [{ text: t, match: false }]
}
