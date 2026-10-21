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

export const CAP_MAX_H = 120

export function autosize(el) {
  if (!el) return
  try { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, CAP_MAX_H) + 'px' } catch (_) {}
}

// Строит ПОВЁРНУТУЮ копию фото на canvas → File (без пути). rot ∈ {90,180,270}.
export function buildRotatedFile(file, rot, url) {
  const isPng = typeof file?.type === 'string' && file.type === 'image/png'
  const mime = isPng ? 'image/png' : 'image/jpeg'
  const outExt = isPng ? '.png' : '.jpg'
  const created = !url
  let u = url
  if (!u) { try { u = URL.createObjectURL(file) } catch (_) { u = '' } }
  return new Promise((resolve) => {
    const finish = (res) => { if (created && u) { try { URL.revokeObjectURL(u) } catch (_) {} } resolve(res) }
    try {
      const img = new Image()
      img.onload = () => {
        try {
          const swap = rot % 180 !== 0
          const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height
          const canvas = document.createElement('canvas')
          canvas.width = swap ? nh : nw
          canvas.height = swap ? nw : nh
          const ctx = canvas.getContext('2d')
          ctx.translate(canvas.width / 2, canvas.height / 2)
          ctx.rotate((rot * Math.PI) / 180)
          ctx.drawImage(img, -nw / 2, -nh / 2)
          canvas.toBlob((blob) => {
            if (!blob) { finish(null); return }
            const base = (file?.name || 'photo').replace(/\.[^.]+$/, '')
            finish(new File([blob], base + outExt, { type: mime }))
          }, mime, 0.92)
        } catch (_) { finish(null) }
      }
      img.onerror = () => finish(null)
      img.src = u
    } catch (_) { finish(null) }
  })
}

// v1.2.513: стили окна вынесены из PhotoSendModal.jsx для снятия предупреждения о лимите 80%+.
export const photoModalStyles = {
  overlay: { position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(3,4,8,0.74)', display: 'grid', placeItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 720, background: '#1b1e27', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 30px 70px -18px rgba(0,0,0,0.82), 0 6px 18px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' },
  head: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' },
  xbtn: { width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--amoled-text-dim)', cursor: 'pointer', fontSize: 15 },
  toolGroup: { display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '3px 5px', color: '#dbe3ef' },
  cbtn: { minWidth: 30, height: 28, padding: '0 7px', borderRadius: 7, border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 },
  sep: { width: 1, height: 18, background: 'rgba(255,255,255,0.16)', margin: '0 4px' },
  imgArea: {
    position: 'relative', overflow: 'hidden', height: 380, display: 'grid', placeItems: 'center', userSelect: 'none', backgroundColor: '#151922',
    backgroundImage: 'linear-gradient(45deg,#1e222c 25%,transparent 25%),linear-gradient(-45deg,#1e222c 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1e222c 75%),linear-gradient(-45deg,transparent 75%,#1e222c 75%)',
    backgroundSize: '22px 22px', backgroundPosition: '0 0,0 11px,11px -11px,-11px 0',
  },
  navBtn: { position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 3, width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(12,16,24,0.78)', color: '#fff', cursor: 'pointer', fontSize: 18, display: 'grid', placeItems: 'center' },
  hint: { position: 'absolute', left: 0, right: 0, bottom: 8, textAlign: 'center', fontSize: 11, color: '#c6d2e4', opacity: 0.72, pointerEvents: 'none' },
  info: { padding: '7px 16px', fontSize: 11.5, color: 'var(--amoled-text-dim)', borderTop: '1px solid rgba(255,255,255,0.10)', display: 'flex', gap: 8, alignItems: 'center' },
  strip: { display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto', borderTop: '1px solid rgba(255,255,255,0.08)' },
  thumbBase: { position: 'relative', flex: '0 0 auto', width: 54, height: 54, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#0f1420' },
  addThumb: { position: 'relative', flex: '0 0 auto', width: 54, height: 54, borderRadius: 8, overflow: 'hidden', display: 'grid', placeItems: 'center', cursor: 'pointer', background: '#0f1420', border: '1px dashed rgba(255,255,255,0.25)', color: '#c6d2e4', fontSize: 22 },
  thumbX: { position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.66)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: '16px', padding: 0, textAlign: 'center' },
  foot: { display: 'flex', gap: 8, padding: 12, alignItems: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.10)' },
  capStyle: { flex: 1, fontSize: 14, lineHeight: 1.4, resize: 'none', overflowY: 'auto', minHeight: 38, maxHeight: 120, padding: '8px 11px', borderRadius: 10, background: '#12151d', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--amoled-text)', fontFamily: 'inherit' },
}
