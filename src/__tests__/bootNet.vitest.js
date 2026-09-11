// v1.2.452: авто-окно переподключения САМОГО приложения (встроенный скрипт в index.html).
//
// ЖАЛОБА (11 сентября 2026): при обрыве интернета в момент запуска приложение навсегда
// зависало на заставке. Журнал показал ровно это: 14 файлов программы не догрузились
// (`ERR_NETWORK_CHANGED` — сеть переключилась), а через 3 минуты предохранитель просто
// убрал заставку → пустое окно, ни объяснения, ни повтора.
//
// 🔴 ПОЧЕМУ ТЕСТ ТАКОЙ СТРАННЫЙ: проверяемый код живёт ВНУТРИ `index.html` и ничего не
// подключает — иначе он упал бы вместе с остальной программой (среди не загрузившихся
// файлов был и `shared/reconnectPlan.js`). Поэтому тест ВЫТАСКИВАЕТ скрипт из index.html
// и запускает его по-настоящему — тот же приём, что у `browserBannerHider.vitest.js`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { RETRY_LADDER_MS } from '../../shared/reconnectPlan.js'

const html = readFileSync('index.html', 'utf8')

/** Достаёт из index.html разметку заставки и встроенный скрипт окна переподключения. */
function bootPieces() {
  const splash = html.slice(html.indexOf('<div id="cc-splash"'), html.indexOf('<div id="root">'))
  const markup = splash.slice(0, splash.lastIndexOf('</script>') === -1 ? splash.length : splash.indexOf('<script>'))
  const code = html.slice(html.indexOf('(function ccBootNet()'), html.indexOf('</script>', html.indexOf('(function ccBootNet()')))
  return { markup, code }
}

/** Ставит разметку в документ и запускает скрипт; возвращает его «пульт» window.__ccBootNet. */
function boot({ online = true } = {}) {
  const { markup, code } = bootPieces()
  document.body.innerHTML = markup
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true })
  new Function(code)()          // тот самый код из index.html, без подмен
  return window.__ccBootNet
}

const visible = () => document.getElementById('cc-boot-net')?.classList.contains('cc-on') === true

/**
 * v1.2.453: единственный законный повод показать окно — НАСТОЯЩИЙ сбой загрузки файла
 * программы. «Нет сети» сама по себе окно больше НЕ поднимает (иначе приложение крутило
 * перезагрузки вместо запуска — находка ревью v1.2.452).
 */
function loadFailed() {
  const script = document.createElement('script')
  document.body.appendChild(script)
  script.dispatchEvent(new Event('error', { bubbles: false }))   // событие ресурса НЕ всплывает
}

beforeEach(() => { vi.useFakeTimers(); try { sessionStorage.clear() } catch (_) {} })
afterEach(() => { vi.useRealTimers(); delete window.__ccBootNet; document.body.innerHTML = '' })

describe('Окно переподключения приложения: когда появляется', () => {
  it('пока всё хорошо — окна нет', () => {
    boot()
    expect(visible()).toBe(false)
  })

  it('🔴 ГЛАВНОЕ: файл программы не загрузился → окно появилось само', () => {
    boot()
    const script = document.createElement('script')
    document.body.appendChild(script)
    script.dispatchEvent(new Event('error', { bubbles: false }))   // событие ресурса НЕ всплывает
    expect(visible(), 'окно должно появиться само').toBe(true)
    expect(document.getElementById('cc-bn-why').textContent).toContain('пропала связь')
  })

  it('сорванная догрузка части программы (отказ обещания) → окно появилось', () => {
    boot()
    const ev = new Event('unhandledrejection')
    ev.reason = new Error('Failed to fetch dynamically imported module: /src/App.jsx')
    window.dispatchEvent(ev)
    expect(visible()).toBe(true)
  })

  it('чужой отказ обещания окно НЕ поднимает (ложных тревог нет)', () => {
    boot()
    const ev = new Event('unhandledrejection')
    ev.reason = new Error('что-то своё, не про загрузку')
    window.dispatchEvent(ev)
    expect(visible()).toBe(false)
  })

  it('сеть пропала, но файлы загружаются → окна НЕТ (приложение просто запустится)', () => {
    // v1.2.453: прежде этот тест утверждал обратное — и из-за этого приложение крутило
    // перезагрузки вместо запуска, когда интернета не было. Уговор изменён осознанно.
    boot()
    window.dispatchEvent(new Event('offline'))
    expect(visible()).toBe(false)
  })

  it('сеть пропала И файл не загрузился → окно есть, причина прямая', () => {
    boot()
    window.dispatchEvent(new Event('offline'))
    loadFailed()
    expect(visible()).toBe(true)
    expect(document.getElementById('cc-bn-why').textContent).toContain('нет связи')
  })
})

describe('Окно переподключения приложения: как повторяет', () => {
  it('обратный отсчёт идёт и по нулю перезагружает окно САМ', () => {
    const api = boot()
    const reload = vi.fn(); api.reload = reload
    loadFailed()
    expect(document.getElementById('cc-bn-left').textContent).toMatch(/Повторим через 5 с/)
    vi.advanceTimersByTime(3000)
    expect(document.getElementById('cc-bn-left').textContent).toMatch(/через 2 с/)
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2100)
    expect(reload, 'по нулю должен перезагрузить окно сам').toHaveBeenCalledTimes(1)
    expect(api.attemptNo(), 'номер попытки должен вырасти').toBe(1)
  })

  it('кнопка «Повторить сейчас» перезагружает окно сразу', () => {
    const api = boot()
    const reload = vi.fn(); api.reload = reload
    loadFailed()
    document.getElementById('cc-bn-btn').dispatchEvent(new Event('click'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('сеть вернулась → повтор СРАЗУ, не дожидаясь отсчёта', () => {
    const api = boot()
    const reload = vi.fn(); api.reload = reload
    loadFailed()
    window.dispatchEvent(new Event('online'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('пауза РАСТЁТ по попыткам и упирается в 60 с', () => {
    const api = boot()
    expect([0, 1, 2, 3, 4, 9].map(n => api.pauseMs(n))).toEqual([5000, 10000, 20000, 40000, 60000, 60000])
    expect(api.pauseMs(-5), 'мусор на входе не ломает расчёт').toBe(5000)
  })

  it('номер попытки переживает перезагрузку окна, а при успехе обнуляется', () => {
    const api = boot()
    api.reload = () => {}
    loadFailed()
    document.getElementById('cc-bn-btn').dispatchEvent(new Event('click'))
    expect(api.attemptNo()).toBe(1)
    delete window.__ccBootNet
    const api2 = boot()                       // как будто окно перезагрузилось
    expect(api2.attemptNo(), 'счётчик должен сохраниться').toBe(1)
    api2.ok()                                  // приложение поднялось
    expect(api2.attemptNo(), 'после успеха — ноль').toBe(0)
  })

  it('второй сбой подряд не плодит второй отсчёт', () => {
    const api = boot()
    const reload = vi.fn(); api.reload = reload
    loadFailed()
    loadFailed()
    vi.advanceTimersByTime(5100)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('Проводка и согласованность', () => {
  it('🔴 ЛОВУШКА: лестница пауз совпадает с той, что у мессенджеров', () => {
    // Числа в index.html дублируются осознанно (там нельзя ничего подключать),
    // поэтому расхождение с единым источником обязан ловить тест.
    const api = boot()
    expect(api.LADDER).toEqual(RETRY_LADDER_MS)
  })

  it('🔴 ЛОВУШКА: код окна НЕ подключает сторонних файлов (иначе упадёт вместе с ними)', () => {
    const { code } = bootPieces()
    expect(code).not.toMatch(/\bimport\b/)
    expect(code).not.toMatch(/\brequire\(/)
  })

  it('приложение при успехе гасит окно: main.jsx зовёт ok()', () => {
    const main = readFileSync('src/main.jsx', 'utf8')
    expect(main).toContain('__ccBootNet?.ok?.()')
  })

  it('предохранитель 3 минуты показывает ОКНО, а не пустоту', () => {
    const probe = readFileSync('src/boot-probe.js', 'utf8')
    expect(probe).toContain('__ccBootNet.show')
    expect(probe).toContain('приложение не запустилось за 3 минуты')
  })

  it('в журнал пишется, что окно показано и что идёт перезагрузка', () => {
    const { code } = bootPieces()
    expect(code).toContain('[boot-net] ')
    expect(code).toContain('окно переподключения показано')
    expect(code).toContain('перезагружаю окно, попытка')
  })
})

describe('🔴 Чего окно делать НЕ должно (находки ревью v1.2.452)', () => {
  it('🔴 ЛОВУШКА: приложение РАБОТАЕТ, сеть мигнула → перезагрузки быть не должно', () => {
    // После успешного запуска заставка (а с ней и панель) удалена из окна. Раньше флаг
    // «окно показано» поднимался ДО проверки наличия панели, и возврат сети перезагружал
    // работающее приложение — терялось недописанное сообщение.
    document.body.innerHTML = '<div id="root"></div>'   // заставки уже нет, как после старта
    const { code } = bootPieces()
    new Function(code)()
    const api = window.__ccBootNet
    const reload = vi.fn(); api.reload = reload
    loadFailed()                                  // сбой уже неважен: панели нет
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))
    expect(reload, 'работающее приложение перезагружать НЕЛЬЗЯ').not.toHaveBeenCalled()
  })

  it('🔴 ЛОВУШКА: старт БЕЗ сети сам по себе окно не поднимает и не перезагружает', () => {
    // Оболочка приложения грузится с диска, чаты есть в памяти — без интернета приложение
    // обязано просто запуститься. Раньше «нет сети» сразу запускало отсчёт до перезагрузки,
    // и приложение крутило перезагрузки вместо запуска (счётчик попыток рос 1→2→3…).
    const api = boot({ online: false })
    const reload = vi.fn(); api.reload = reload
    expect(visible(), 'окна быть не должно').toBe(false)
    vi.advanceTimersByTime(70000)
    expect(reload, 'перезагрузок быть не должно').not.toHaveBeenCalled()
    expect(api.attemptNo(), 'счётчик попыток не должен расти').toBe(0)
  })

  it('сеть пропала во время загрузки, но файлы идут → окна нет', () => {
    const api = boot()
    const reload = vi.fn(); api.reload = reload
    window.dispatchEvent(new Event('offline'))
    expect(visible(), 'без реального сбоя загрузки окно не поднимаем').toBe(false)
    vi.advanceTimersByTime(70000)
    expect(reload).not.toHaveBeenCalled()
  })

  it('нет сети И сбой загрузки → окно есть, причина «нет связи»', () => {
    boot({ online: false })
    const script = document.createElement('script')
    document.body.appendChild(script)
    script.dispatchEvent(new Event('error', { bubbles: false }))
    expect(visible()).toBe(true)
    expect(document.getElementById('cc-bn-why').textContent).toContain('нет связи')
  })

  it('после успешного запуска окно больше не поднимается (флаг сброшен)', () => {
    const api = boot()
    const reload = vi.fn(); api.reload = reload
    loadFailed()                               // окно показалось
    api.ok()                                   // …но приложение всё же поднялось
    window.dispatchEvent(new Event('online'))
    expect(reload).not.toHaveBeenCalled()
  })

  it('«пульт» объявлен ДО слушателей — перезагрузка не падает даже при нулевой паузе', () => {
    const { code } = bootPieces()
    // пульт должен создаваться раньше, чем на него могут сослаться обработчики
    expect(code.indexOf('window.__ccBootNet = api'), 'пульт должен быть выше слушателей')
      .toBeLessThan(code.indexOf("addEventListener('offline'"))
  })
})
