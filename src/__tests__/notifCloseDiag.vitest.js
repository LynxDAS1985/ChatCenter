// v1.2.486 — записи в журнал о нажатии крестика в окне уведомлений.
// @vitest-environment jsdom
//
// ЗАЧЕМ ЭТИ ЗАПИСИ (жалоба пользователя «крестик у карточки не реагирует»):
// в журнале `chatcenter.log` за 19.09.2026 видно, что 18 сентября карточки закрывались
// (25 записей «dismiss start … fromMain=false»), а 19-го за весь день — НИ ОДНОЙ, при
// неизменных «items=6 containerChildren=6». После перезапуска в 14:02 закрытие прошло
// сразу. Значит функция закрытия даже не начиналась, но ОТЛИЧИТЬ «нажатие не дошло»
// от «функция вышла в первой строке» было нечем: оба ранних выхода стояли ДО первой
// записи в журнал.
//
// Тест следит за тем, чтобы эта диагностика не оказалась мёртвой (как было с большим
// снимком страницы ВК — он не запускался НИ РАЗУ и никто этого не замечал, v1.2.484).
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import fs from 'node:fs'

const NOTIF_JS = fs.readFileSync('main/notification.js', 'utf8')
const logged = []

beforeAll(async () => {
  window.notifApi = {
    log: (level, message) => { logged.push(level + ' ' + message) },
    openPhoto: vi.fn(), openVideo: vi.fn(),
  }
  await import('../../main/notification-helpers.js')
})

beforeEach(() => { logged.length = 0 })

/** Поддельный список карточек и поддельное окно со стопкой выше экрана. */
function makeItems(entries) { return new Map(entries) }
function makeContainer(childCount, scroll) {
  const el = document.createElement('div')
  for (let i = 0; i < childCount; i++) el.appendChild(document.createElement('div'))
  Object.defineProperty(el, 'scrollTop', { value: (scroll && scroll.top) || 0, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: (scroll && scroll.client) || 0, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { value: (scroll && scroll.scroll) || 0, configurable: true })
  return el
}

describe('нажатие крестика попадает в журнал', () => {
  it('видно состояние карточки и окна — включая «стопка выше окна»', () => {
    const items = makeItems([[7, { dismissing: false }], [8, {}]])
    const container = makeContainer(2, { top: 300, client: 796, scroll: 1083 })
    window.__ccNotifHelpers.logCloseClick(7, items, container)
    const line = logged.join('\n')
    expect(line).toContain('close-click id=7')
    expect(line).toContain('естьВСписке=true')
    expect(line).toContain('ужеЗакрывается=false')
    expect(line).toContain('карточек=2')
    expect(line).toContain('вОкне=2')
    expect(line).toContain('прокрутка=300/796/1083') // видно, что контент выше окна
  })

  it('[!] ЛОВУШКА: карточки нет в списке — это ВИДНО, а не молчаливый отказ', () => {
    window.__ccNotifHelpers.logCloseClick(99, makeItems([]), makeContainer(3))
    expect(logged.join('\n')).toContain('естьВСписке=false')
  })

  it('карточка уже закрывается — тоже видно', () => {
    window.__ccNotifHelpers.logCloseClick(5, makeItems([[5, { dismissing: true }]]), makeContainer(1))
    expect(logged.join('\n')).toContain('ужеЗакрывается=true')
  })

  it('отказ начать закрытие пишется предупреждением с причиной', () => {
    window.__ccNotifHelpers.logDismissSkip(12, 'уже закрывается')
    expect(logged.join('\n')).toContain('WARN закрытие НЕ началось id=12 причина=уже закрывается')
  })

  it('поломка не роняет окно, даже если журнал недоступен', () => {
    const saved = window.notifApi
    window.notifApi = null
    expect(() => window.__ccNotifHelpers.logCloseClick(1, makeItems([]), null)).not.toThrow()
    expect(() => window.__ccNotifHelpers.logDismissSkip(1, 'x')).not.toThrow()
    window.notifApi = saved
  })
})

describe('падения внутри окна уведомлений больше не невидимы', () => {
  it('ошибка кода попадает в журнал', () => {
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'x is not a function', filename: 'file:///C:/app/main/notification.js', lineno: 585,
    }))
    const line = logged.join('\n')
    expect(line).toContain('ERROR ОШИБКА В ОКНЕ УВЕДОМЛЕНИЙ')
    expect(line).toContain('x is not a function')
    expect(line).toContain('notification.js:585')
  })

  it('перехват ставится один раз, повторный вызов ничего не ломает', () => {
    expect(window.__ccNotifErrHooked).toBe(true)
    expect(() => window.__ccNotifHelpers.installNotifErrorReporter()).not.toThrow()
    logged.length = 0
    window.dispatchEvent(new ErrorEvent('error', { message: 'раз', filename: 'a.js', lineno: 1 }))
    expect(logged.filter(l => l.includes('раз')).length).toBe(1) // не задвоилось
  })
})

describe('[!] ЛОВУШКИ: диагностика реально подключена к окну, а не лежит мёртвым грузом', () => {
  it('крестик пишет в журнал ДО попытки закрыть', () => {
    expect(NOTIF_JS).toContain('logCloseClick(data.id, items, container)')
    const btnAt = NOTIF_JS.indexOf("closeBtn.addEventListener('click'")
    const logAt = NOTIF_JS.indexOf('logCloseClick(data.id, items, container)')
    expect(btnAt).toBeGreaterThan(0)
    expect(logAt).toBeGreaterThan(btnAt) // запись внутри обработчика, а не где-то ещё
  })

  it('оба молчаливых отказа закрытия заменены на записи', () => {
    expect(NOTIF_JS).not.toContain('    if (!item) return\n    if (item.dismissing) return')
    expect(NOTIF_JS).toContain("logDismissSkip(id, 'карточки нет в списке')")
    expect(NOTIF_JS).toContain("logDismissSkip(id, 'уже закрывается')")
  })

  it('подробный снимок карточек не потерялся при переносе в общий файл', () => {
    expect(NOTIF_JS).toContain('logDomSnapshot(container)')
    expect(typeof window.__ccNotifHelpers.logDomSnapshot).toBe('function')
    const c = makeContainer(2)
    c.children[0].dataset.id = '42'
    window.__ccNotifHelpers.logDomSnapshot(c)
    expect(logged.join('\n')).toContain('DOM snapshot')
    expect(logged.join('\n')).toContain('id=42')
  })
})
