// v1.2.207: чистые помощники окна отправки фото (PhotoSendModal) — вынесены отдельно, чтобы
// покрыть тестами без DOM. Размер файла в МБ (#6), перестановка фото в ленте (#3),
// общий процент загрузки альбома (#4 — прогресс по сумме, т.к. TDLib даёт его по fileId,
// а не по нашим миниатюрам).

// v1.2.209: лимит подписи под фото в Telegram (обычный аккаунт — 1024 знака; Premium — 2048).
// Берём безопасное 1024 — подходит всем. Длиннее → фото не доходит (см. mistakes/electron-core.md).
export const CAPTION_MAX = 1024

// v1.2.211: лимит ОБЫЧНОГО текстового сообщения Telegram — 4096 знаков. Длиннее одним сообщением
// не отправить (сервер отвергает) → длинный текст режем на куски ≤ TEXT_MAX.
export const TEXT_MAX = 4096

/**
 * Режет длинный текст на куски ≤ max знаков (по переносу строки / пробелу — не посреди слова;
 * и не посреди суррогатной пары, т.е. эмодзи). Пустой текст → []. Короткий (≤max) → [текст].
 * @param {string} text
 * @param {number} max
 * @returns {string[]}
 */
export function splitTextForTelegram(text, max = TEXT_MAX) {
  const s = String(text == null ? '' : text)
  if (s.length <= max) return s ? [s] : []
  const half = Math.floor(max * 0.5)
  const chunks = []
  let rest = s
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max)
    if (cut < half) { const sp = rest.lastIndexOf(' ', max); if (sp >= half) cut = sp }
    if (cut < half) cut = max
    if (cut < 1) cut = max
    // не разрезать суррогатную пару (эмодзи) пополам
    const code = rest.charCodeAt(cut - 1)
    if (code >= 0xD800 && code <= 0xDBFF) cut -= 1
    chunks.push(rest.slice(0, cut).replace(/\s+$/, ''))
    rest = rest.slice(cut).replace(/^\s+/, '')
  }
  if (rest) chunks.push(rest)
  return chunks
}

// Человеческий размер файла: «340 КБ» / «1.7 МБ» / «2 Б».
export function formatBytes(bytes) {
  const b = Number(bytes)
  if (!Number.isFinite(b) || b < 0) return ''
  if (b < 1024) return `${b} Б`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} КБ`
  return `${(b / (1024 * 1024)).toFixed(1)} МБ`
}

// Сумма размеров массива файлов (для «альбом N МБ»).
export function totalBytes(files) {
  if (!Array.isArray(files)) return 0
  return files.reduce((sum, f) => sum + (Number(f?.size) || 0), 0)
}

// Переставить элемент массива с позиции from на позицию to (новый массив, исходный не меняем).
export function arrayMove(arr, from, to) {
  if (!Array.isArray(arr)) return arr
  const n = arr.length
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return arr.slice()
  const copy = arr.slice()
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

// Общий процент загрузки: сумма загруженного / сумма всего по активным файлам.
// uploads — объект { fileId: { uploaded, total, percent } } из store. Нет активных → null.
export function overallUploadPercent(uploads) {
  if (!uploads || typeof uploads !== 'object') return null
  let up = 0, total = 0
  for (const k of Object.keys(uploads)) {
    const u = uploads[k]
    if (!u) continue
    up += Number(u.uploaded) || 0
    total += Number(u.total) || 0
  }
  if (total <= 0) return null
  return Math.max(0, Math.min(100, Math.round((up / total) * 100)))
}
