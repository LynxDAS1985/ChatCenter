// Окно переподключения ПОСЛЕ запуска приложения + запись итога в журнал.
//
// Вынесено из bootNet.vitest.js в v1.2.473: тот файл дорос до 395 строк при потолке 400, а тема
// тут самостоятельная — «что происходит, когда программа уже работает», а не «как окно ведёт
// себя при запуске». Комментарии по правилу проекта не резали, файл поделили.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { reportBootNetOutcome } from '../../shared/bootNetOutcome.js'

const html = readFileSync('index.html', 'utf8')

/** Достаёт из index.html разметку заставки и встроенный скрипт окна переподключения. */
function bootPieces() {
  const splash = html.slice(html.indexOf('<div id="cc-splash"'), html.indexOf('<div id="root">'))
  const markup = splash.slice(0, splash.lastIndexOf('</script>') === -1 ? splash.length : splash.indexOf('<script>'))
  const code = html.slice(html.indexOf('(function ccBootNet()'), html.indexOf('</script>', html.indexOf('(function ccBootNet()')))
  return { markup, code }
}

/** Ставит разметку в документ и запускает скрипт; возвращает его «пульт» window.__ccBootNet. */
function boot() {
  const { markup, code } = bootPieces()
  document.body.innerHTML = markup
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
  new Function(code)()          // тот самый код из index.html, без подмен
  return window.__ccBootNet
}

const visible = () => document.getElementById('cc-boot-net')?.classList.contains('cc-on') === true

beforeEach(() => { vi.useFakeTimers(); try { sessionStorage.clear() } catch (_) {} })
afterEach(() => { vi.useRealTimers(); delete window.__ccBootNet; document.body.innerHTML = '' })

// =================================================================================================
// v1.2.472 — ЖАЛОБА 2026-09-16: «ты починил же это, почему опять? должно же само переподключаться
// и быть экран, а его не было».
//
// Что показал журнал приложения: через 161 секунду ПОСЛЕ запуска сеть переключилась
// (`net::ERR_NETWORK_CHANGED`, семь запросов умерли в одну секунду), кусок программы
// (`src/native/NativeApp.jsx`) не догрузился → красный экран во весь экран.
//
// КОРЕНЬ: окно повтора было нарисовано ВНУТРИ стартовой заставки, а заставку удаляют через
// полсекунды после запуска. Починка v1.2.464 работала только «на пороге» — во время работы окно
// показывать было НЕГДЕ. Лечение: перед удалением заставки окно вынимают в документ (detach).
// =================================================================================================
describe('окно переподключения переживает удаление заставки (v1.2.472)', () => {
  it('🔴 ГЛАВНОЕ: заставку убрали → сбой загрузки ВО ВРЕМЯ РАБОТЫ всё равно поднимает окно', () => {
    const net = boot()
    net.detach()                                   // так делает main.jsx перед удалением заставки
    document.getElementById('cc-splash').remove()  // сама заставка ушла
    expect(net.onLoadError('Failed to fetch dynamically imported module: /src/native/NativeApp.jsx')).toBe(true)
    expect(visible(), 'окно должно быть на экране').toBe(true)
    expect(document.getElementById('cc-boot-net').classList.contains('cc-bn--float')).toBe(true)
  })

  it('и САМО перезагружает окно по отсчёту — как при запуске', () => {
    const net = boot()
    net.detach(); document.getElementById('cc-splash').remove()
    const reload = vi.fn(); net.reload = reload
    net.onLoadError('Failed to fetch dynamically imported module: /src/native/NativeApp.jsx')
    vi.advanceTimersByTime(5000)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('🔴 ЛОВУШКА: ЧУЖАЯ ошибка (не про загрузку) окно не поднимает и ПОСЛЕ запуска', () => {
    const net = boot()
    net.detach(); document.getElementById('cc-splash').remove()
    expect(net.onLoadError('Cannot read properties of undefined (reading map)')).toBe(false)
    expect(visible()).toBe(false)
  })

  it('🔴 ЛОВУШКА: упала отдельная панель → окно есть, но САМО не перезагружает', () => {
    const net = boot()
    net.detach(); document.getElementById('cc-splash').remove()
    const reload = vi.fn(); net.reload = reload
    expect(net.onLoadError('Failed to fetch dynamically imported module: /src/components/AISidebar.jsx', { soft: true })).toBe(true)
    expect(visible()).toBe(true)
    vi.advanceTimersByTime(120000)
    expect(reload, 'работающую программу из-под рук не вырываем').not.toHaveBeenCalled()
  })

  it('переезд идемпотентен: второй вызов ничего не ломает', () => {
    const net = boot()
    expect(net.detach()).toBe(true)
    expect(net.detach()).toBe(false)
    expect(document.getElementById('cc-boot-net').parentNode).toBe(document.body)
  })

  it('🔴 ЛОВУШКА: ОБА места, которые убирают заставку, вынимают окно заранее', () => {
    // Иначе беда вернётся молча: одно место починили, второе удалило бы окно вместе с заставкой.
    expect(readFileSync('src/main.jsx', 'utf8')).toContain('__ccBootNet?.detach?.()')
    expect(readFileSync('src/boot-probe.js', 'utf8')).toContain('__ccBootNet?.detach?.()')
  })

  it('окно, оставшееся в заставке, рисуется как раньше (вид при запуске не изменился)', () => {
    const net = boot()
    net.onLoadError('Failed to fetch dynamically imported module: /src/x.jsx')
    expect(visible()).toBe(true)
    expect(document.getElementById('cc-boot-net').classList.contains('cc-bn--float')).toBe(false)
  })
})

// =================================================================================================
// v1.2.473 — МОЛЧАНИЕ ЖУРНАЛА. Разбор случая 2026-09-16: красный экран был, строка про саму
// ошибку в журнале была, а про окно переподключения — НИ ОДНОЙ строки, ни в текущем журнале, ни
// в прошлом. По журналу нельзя было отличить три разные беды: пульта в окне нет вовсе / текст
// ошибки не опознан / показывать негде.
//
// Лечение: итог обращения пишет ВЫЗЫВАЮЩАЯ сторона (перехватчик ошибок), а не сам пульт — пульт
// и есть подозреваемый, если его нет, он о себе ничего не напишет.
// =================================================================================================
describe('итог обращения к окну переподключения пишется ВСЕГДА (v1.2.473)', () => {
  /** Заглушка окна: запоминает, что ушло в журнал. */
  function fakeWin(pult) {
    const lines = []
    return { __ccBootNet: pult, api: { send: (ch, d) => lines.push(ch + '|' + d.level + '|' + d.message) }, lines }
  }

  it('[!] ГЛАВНОЕ: пульта в окне НЕТ → это прямо сказано в журнале', () => {
    const w = fakeWin(undefined)
    const out = reportBootNetOutcome(w, 'Failed to fetch dynamically imported module: /src/x.jsx')
    expect(out).toMatch(/пульт не найден/)
    expect(w.lines).toHaveLength(1)
    expect(w.lines[0]).toContain('app:log|ERROR|[BOOT] экран ошибки (корень)')
    expect(w.lines[0]).toMatch(/НЕТ/)
  })

  it('окно поднялось → в журнале так и написано', () => {
    const w = fakeWin({ onLoadError: () => true })
    expect(reportBootNetOutcome(w, 'Failed to fetch…')).toMatch(/окно переподключения показано/)
    expect(w.lines[0]).toContain('показано')
  })

  it('окно НЕ поднялось → журнал не делает вид, что всё хорошо', () => {
    const w = fakeWin({ onLoadError: () => false })
    expect(reportBootNetOutcome(w, 'Cannot read properties of undefined')).toMatch(/НЕ показано/)
  })

  it('мягкий режим передаётся дальше и виден в журнале', () => {
    const got = []
    const w = fakeWin({ onLoadError: (m, o) => { got.push(o); return true } })
    reportBootNetOutcome(w, 'Failed to fetch…', { soft: true, where: 'AISidebar' })
    expect(got[0]).toEqual({ soft: true })
    expect(w.lines[0]).toContain('(AISidebar)')
    expect(w.lines[0]).toMatch(/без авто-перезагрузки/)
  })

  it('[!] ЛОВУШКА: обращение к пульту упало → перехватчик НЕ падает, причина в журнале', () => {
    const w = fakeWin({ onLoadError: () => { throw new Error('пульт сломан') } })
    expect(() => reportBootNetOutcome(w, 'Failed to fetch…')).not.toThrow()
    expect(w.lines[0]).toContain('пульт сломан')
  })

  it('[!] ЛОВУШКА: журнал недоступен → тоже не падаем (экран ошибки важнее записи)', () => {
    expect(() => reportBootNetOutcome({ __ccBootNet: { onLoadError: () => true } }, 'Failed to fetch…')).not.toThrow()
    expect(() => reportBootNetOutcome(null, 'Failed to fetch…')).not.toThrow()
  })

  it('длинный текст ошибки в журнал целиком НЕ тащим', () => {
    const w = fakeWin({ onLoadError: () => true })
    reportBootNetOutcome(w, 'x'.repeat(500))
    expect(w.lines[0].length).toBeLessThan(200)
  })

  it('связка с настоящим пультом из index.html: окна нет → журнал это фиксирует', () => {
    const pult = boot()
    document.getElementById('cc-boot-net').remove()
    const w = fakeWin(pult)
    expect(reportBootNetOutcome(w, 'Failed to fetch dynamically imported module: /src/x.jsx')).toMatch(/НЕ показано/)
    expect(visible()).toBe(false)
  })
})
