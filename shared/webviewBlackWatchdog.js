// v1.2.431/432/433: сторож «пустого (чёрного) экрана» веб-вкладки.
//
// ПРОБЛЕМА (по журналу): у тяжёлого чата МАКС содержимое страницы ЗАГРУЖЕНО
// (`innerLen` больше миллиона, в центре `messageWrapper`, ошибок нет), а на экране пусто —
// вкладка НЕ ПЕРЕРИСОВЫВАЕТСЯ. Ручной обходной путь пользователя — потянуть край окна.
//
// КАК: снимаем кадр вкладки (офиц. Electron `<webview>.capturePage()` → `NativeImage`),
// считаем статистику пикселей. Если кадр «пустой» — дёргаем ТОТ ЖЕ 1px-пинок раскладки,
// что применяется при активации вкладки (Ловушка 64, см. useWebViewLifecycle.js).
//
// ⚠️ ИСТОРИЯ ДВУХ ПРОВАЛОВ (важно не повторить):
//  1) v1.2.431 — сторож молчал на пути «не сработало»: в журнале было 0 строк, и нельзя
//     было понять, что происходит. Исправлено в v1.2.432 — сторож пишет результат проверки.
//  2) v1.2.432 — заработал и показал ФАКТ из журнала: кадр «чёрного» экрана МАКС меряется
//     как яркость 32 (у МАКС тёмный фон rgb(23,24,28) ≈ 25), а порог «чёрного» стоял 12 →
//     сторож честно решал «не чёрный» и не пинал. Вывод: порог ЯРКОСТИ — негодный признак,
//     тёмная тема мессенджера всегда даёт 25-35, а поднять порог опасно (начнём пинать
//     нормально нарисованный тёмный чат).
//     Исправлено в v1.2.433: главный признак — РАЗБРОС яркости. У ровной заливки (ничего не
//     нарисовано) разброс почти нулевой; у нарисованного чата есть текст, аватарки, пузыри →
//     разброс в десятки раз больше. Яркость оставлена вторым (запасным) признаком.

export const BLACK_LUM = 12   // средняя яркость 0..255 ниже этого — кадр почти чёрный
export const FLAT_STDEV = 6   // разброс яркости ниже этого — кадр «ровный» = ничего не нарисовано
const MAX_SIDE = 160          // кадр уменьшаем перед замером — быстрее, точности хватает
const LOUD_CHECKS = 2         // первые N проверок пишем в журнал всегда (чтобы не гадать)

// v1.2.435 (по ревью): как часто сторож фотографирует ОТКРЫТУЮ веб-вкладку. Было 10 000 мс.
// ПОЧЕМУ РЕЖЕ: настоящей причиной «чёрного экрана» веб-МАКС оказалась НЕ сорванная
// перерисовка, а наш собственный впрыск, ставивший display:none на корень приложения
// (см. shared/browserBannerHider.js и ADR-042). Теория «надо принудительно перерисовать»
// опровергнута опытом: пинок применялся дважды и не помог. Сторож оставлен СТРАХОВКОЙ на
// другие возможные случаи, но снимок кадра стоит дорого (полный кадр вкладки ≈1100×768,
// затем getBitmap) — 6 раз в минуту платить за опровергнутую теорию незачем.
// Тест-ловушка на возврат частого интервала — в webviewBlackWatchdog.vitest.js.
export const WATCHDOG_INTERVAL_MS = 60000

/**
 * Статистика яркости кадра по сырому массиву байт (BGRA от getBitmap или RGBA от полотна —
 * для средней и разброса порядок каналов не важен). Чистая функция — под юнит-тестом.
 * step — берём каждый N-й пиксель (полный перебор не нужен).
 * Возвращает { avg, stdev, min, max, samples }; при пустом входе всё -1 / samples 0.
 */
export function frameStats(bytes, step = 137) {
  const empty = { avg: -1, stdev: -1, min: -1, max: -1, samples: 0 }
  if (!bytes || !bytes.length) return empty
  let sum = 0, sumSq = 0, n = 0, min = 255, max = 0
  for (let i = 0; i + 3 < bytes.length; i += 4 * step) {
    const lum = (bytes[i] + bytes[i + 1] + bytes[i + 2]) / 3
    sum += lum
    sumSq += lum * lum
    n++
    if (lum < min) min = lum
    if (lum > max) max = lum
  }
  if (!n) return empty
  const avg = sum / n
  const variance = Math.max(0, sumSq / n - avg * avg)
  return {
    avg: Math.round(avg),
    stdev: Math.round(Math.sqrt(variance) * 10) / 10,
    min: Math.round(min),
    max: Math.round(max),
    samples: n,
  }
}

/**
 * Достаёт байты пикселей из снятого кадра. Два способа, по порядку:
 *  1) getBitmap() — сырые пиксели (подтверждено журналом: работает);
 *  2) toDataURL() + полотно — запасной путь, чистый веб.
 * Возвращает { bytes, via } либо { bytes: null, via: 'none', err } — НИКОГДА молча.
 */
export async function readFramePixels(img) {
  if (!img) return { bytes: null, via: 'none', err: 'нет кадра' }
  try {
    if (typeof img.getBitmap === 'function') {
      const b = img.getBitmap()
      if (b && b.length) return { bytes: b, via: 'bitmap' }
    }
  } catch (e) { /* не страшно — идём ко способу 2 */ }
  try {
    if (typeof img.toDataURL !== 'function') return { bytes: null, via: 'none', err: 'нет ни getBitmap, ни toDataURL' }
    const url = img.toDataURL()
    if (!url || url.length < 32) return { bytes: null, via: 'none', err: 'пустая картинка-строка' }
    if (typeof Image !== 'function' || typeof document === 'undefined' || !document.createElement) {
      return { bytes: null, via: 'none', err: 'нет Image/document' }
    }
    const bitmap = new Image()
    await new Promise((resolve, reject) => {
      bitmap.onload = () => resolve()
      bitmap.onerror = () => reject(new Error('картинка не раскодировалась'))
      bitmap.src = url
    })
    const sw = bitmap.naturalWidth || bitmap.width || 0
    const sh = bitmap.naturalHeight || bitmap.height || 0
    if (sw < 2 || sh < 2) return { bytes: null, via: 'none', err: `кадр ${sw}x${sh} слишком мал` }
    const k = Math.min(1, MAX_SIDE / Math.max(sw, sh))
    const w = Math.max(2, Math.round(sw * k)), h = Math.max(2, Math.round(sh * k))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext && canvas.getContext('2d')
    if (!ctx || !ctx.drawImage || !ctx.getImageData) return { bytes: null, via: 'none', err: 'полотно недоступно' }
    ctx.drawImage(bitmap, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    if (!data || !data.length) return { bytes: null, via: 'none', err: 'полотно вернуло пусто' }
    return { bytes: data, via: 'dataurl' }
  } catch (e) {
    return { bytes: null, via: 'none', err: (e && e.message) || String(e) }
  }
}

/**
 * Решение «кадр пустой?» по статистике. Чистая функция — под юнит-тестом.
 * flat = ровная заливка (ничего не нарисовано), dark = почти чёрный.
 */
export function isBlankFrame(stats) {
  if (!stats || stats.samples < 10) return { blank: false, flat: false, dark: false }
  const flat = stats.stdev >= 0 && stats.stdev < FLAT_STDEV
  const dark = stats.avg >= 0 && stats.avg < BLACK_LUM
  return { blank: flat || dark, flat, dark }
}

/**
 * Один прогон сторожа для ОДНОЙ веб-вкладки.
 * el — элемент <webview>; log(level, message) — запись в chatcenter.log через app:log;
 * state — { nudges, checks, readWarned }; maxNudges — предохранитель.
 * Возвращает true, если пинок сделан.
 */
export async function checkBlackAndRepaint(el, log, state, maxNudges = 3) {
  const say = (lvl, msg) => { try { if (log) log(lvl, '[black-watchdog] ' + msg) } catch (_) {} }
  try {
    if (!state) return false
    state.checks = (state.checks || 0) + 1
    if (!el || typeof el.capturePage !== 'function') {
      if (!state.readWarned) { state.readWarned = true; say('WARN', 'у вкладки нет capturePage — проверка кадра невозможна') }
      return false
    }
    if ((state.nudges || 0) >= maxNudges) return false
    const img = await el.capturePage()
    if (!img || (typeof img.isEmpty === 'function' && img.isEmpty())) {
      if (!state.readWarned) { state.readWarned = true; say('WARN', 'кадр пустой (capturePage вернул пусто)') }
      return false
    }
    const { bytes, via, err } = await readFramePixels(img)
    if (!bytes) {
      if (!state.readWarned) { state.readWarned = true; say('WARN', `не смог прочитать пиксели кадра: ${err || 'причина неизвестна'}`) }
      return false
    }
    const s = frameStats(bytes)
    const { blank, flat, dark } = isBlankFrame(s)
    const nums = `через ${via}, яркость ${s.avg}, разброс ${s.stdev}, мин ${s.min}, макс ${s.max}, точек ${s.samples}`
    if (state.checks <= LOUD_CHECKS) say('INFO', `проверка #${state.checks}: ${nums} → пусто=${blank} (ровный=${flat}, тёмный=${dark})`)
    if (!blank) return false
    const wrap = el.parentElement
    if (!wrap || !wrap.getBoundingClientRect) { say('WARN', `кадр пустой (${nums}), но нет обёртки вкладки — пинок невозможен`); return false }
    const width = Math.round(wrap.getBoundingClientRect().width)
    if (width < 5) return false // вкладка спрятана/нулевая — пинать нечего
    wrap.style.width = (width - 1) + 'px'
    const restore = () => { try { wrap.style.width = '' } catch (_) {} }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(restore))
    else setTimeout(restore, 32)
    state.nudges = (state.nudges || 0) + 1
    say('WARN', `кадр ПУСТОЙ (${nums}; ровный=${flat}, тёмный=${dark}) → 1px-пинок перерисовки #${state.nudges}`)
    return true
  } catch (e) {
    say('WARN', `сбой проверки: ${(e && e.message) || e}`)
    return false
  }
}
