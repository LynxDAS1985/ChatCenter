// Тест маршрутизатора фоновой страницы Ozon «Вопросы» (bindOzonBgWatcher).
// Проверяет, что сигналы из скрытой страницы правильно переводятся на основной id Ozon:
//   __CC_NOTIF__ src=ozon-questions → handleNewMessage(ozonId, текст, {background:true})
//   __CC_OZON_COUNT__ qa            → setOzonCounts (кладёт qa в per-раздел)
//   не-__CC_ сообщение              → ничего не маршрутизируется
//   did-fail-load (реальная ошибка) → один раз notify; ERR_ABORTED(-3) → notify НЕ вызывается
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { bindOzonBgWatcher } from '../utils/ozonBgWatcher.js'
import { resetOzonNotifDedup } from '../../shared/ozonNotifDedup.js'

// Заглушка элемента <webview>: копит обработчики, умеет их «выстрелить».
function makeEl(url = 'https://seller.ozon.ru/app/reviews/questions') {
  const handlers = {}
  return {
    addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn) },
    getURL: () => url,
    isConnected: true,          // v1.2.470: страница на экране (false = её убрали)
    reload: vi.fn(),            // v1.2.470: разовый повтор загрузки после сбоя
    fire: (t, ev) => (handlers[t] || []).forEach((fn) => fn(ev)),
    handlersFor: (t) => handlers[t] || [],
  }
}

function makeDeps() {
  let ozonState = {}
  return {
    handleNewMessage: vi.fn(),
    setOzonCounts: vi.fn((fn) => { ozonState = fn(ozonState) }),
    log: vi.fn(),
    notify: vi.fn(),
    getState: () => ozonState,
  }
}

// v1.2.467: память «уже сообщали про недоступность» стала ОБЩЕЙ (shared/ozonNotifDedup.js) —
// она переживает пересоздание страницы, и это же делает её общей МЕЖДУ ТЕСТАМИ. Без сброса
// проверки начинают зависеть от порядка запуска: один тест «съедает» карточку у следующего.
// Ровно на эту граблю проект уже наступал (см. .memory-bank/workflow.md).
// v1.2.470: карточка о недоступности приходит НЕ СРАЗУ - сторож сначала даёт странице время
// подняться (обе карточки 2026-09-16 были ложной тревогой: страница вставала за 0-1 секунду).
// Поэтому время здесь ПОДДЕЛЬНОЕ и прокручивается вручную: иначе проверки зависели бы от
// скорости машины - на эту граблю проект уже наступал (см. .memory-bank/workflow.md).
beforeEach(() => { resetOzonNotifDedup(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())

/** Прокрутить время так, чтобы сторож успел сдаться и показать карточку. */
const waitOut = () => vi.advanceTimersByTime(60000)

describe('bindOzonBgWatcher', () => {
  it('уведомление о вопросе → handleNewMessage на id Ozon с флагом background', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('console-message', { message: '__CC_NOTIF__' + JSON.stringify({ t: 'Подшипник 6203', b: 'Подходит на авто?', g: 'ozon-q:42', src: 'ozon-questions' }) })
    expect(d.handleNewMessage).toHaveBeenCalledTimes(1)
    const [id, body, extra] = d.handleNewMessage.mock.calls[0]
    expect(id).toBe('ozon')
    expect(body).toBe('Подходит на авто?')
    expect(extra.background).toBe(true)
    expect(extra.notifSource).toBe('ozon-questions')
    expect(extra.senderName).toBe('Подшипник 6203')
  })

  it('qa-счётчик → setOzonCounts кладёт число в per-раздел', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'qa', n: 3 }) })
    expect(d.setOzonCounts).toHaveBeenCalledTimes(1)
    expect(d.getState().ozon.qa).toBe(3)
    expect(d.handleNewMessage).not.toHaveBeenCalled()
  })

  it('сообщение покупателя (ozon-list) → handleNewMessage на id Ozon (Шаг 3Б)', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('console-message', { message: '__CC_NOTIF__' + JSON.stringify({ t: 'Алексей Т.', b: 'Понял, спасибо', g: 'ozon-list:7', src: 'ozon-list' }) })
    expect(d.handleNewMessage).toHaveBeenCalledTimes(1)
    const [id, body, extra] = d.handleNewMessage.mock.calls[0]
    expect(id).toBe('ozon')
    expect(body).toBe('Понял, спасибо')
    expect(extra.background).toBe(true)
    expect(extra.notifSource).toBe('ozon-list')
  })

  it('счётчик msg (Покупатели) → setOzonCounts кладёт в per-раздел', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'msg', n: 5 }) })
    expect(d.setOzonCounts).toHaveBeenCalledTimes(1)
    expect(d.getState().ozon.msg).toBe(5)
    expect(d.handleNewMessage).not.toHaveBeenCalled()
  })

  it('счётчик qa из фона пишется в журнал ПРИ ИЗМЕНЕНИИ, но не повторно на ту же цифру (v1.2.396)', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    const qaLog = () => d.log.mock.calls.filter(c => /счётчик из фона: qa=/.test(c[1] || ''))
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'qa', n: 1 }) })
    expect(qaLog().length).toBe(1)
    expect(qaLog()[0][1]).toMatch(/qa=1/)
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'qa', n: 1 }) }) // та же цифра (reload переслал) → НЕ логируем повторно
    expect(qaLog().length).toBe(1)
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'qa', n: 0 }) }) // ответили → 0 → лог
    expect(qaLog().length).toBe(2)
    expect(qaLog()[1][1]).toMatch(/qa=0/)
  })

  it('счётчик rv (Отзывы) из фона → ставит СТАРТОВОЕ значение, если rv ещё не задан (v1.2.392)', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'rv', n: 3 }) })
    expect(d.getState().ozon.rv).toBe(3)
  })

  it('счётчик rv из фона ПОДНИМАЕТ ⭐ на новые отзывы (только вверх) (v1.2.419)', () => {
    const el = makeEl(); const d = makeDeps()
    d.setOzonCounts(prev => ({ ...prev, ozon: { ...(prev.ozon || {}), rv: 4 } })) // было 4 (передняя вкладка / старт)
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'rv', n: 10 }) }) // пришли новые отзывы → фон видит 10
    expect(d.getState().ozon.rv).toBe(10) // ⭐ поднялась без открытия вкладки (жалоба закрыта)
  })

  it('счётчик rv из фона НЕ понижает ⭐ (уменьшение = прочтения, ведёт передняя вкладка) (v1.2.419)', () => {
    const el = makeEl(); const d = makeDeps()
    d.setOzonCounts(prev => ({ ...prev, ozon: { ...(prev.ozon || {}), rv: 5 } })) // передняя вкладка поставила 5
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'rv', n: 2 }) }) // фон застрял/ниже — 2
    expect(d.getState().ozon.rv).toBe(5) // фон НЕ занижает (max) — не прячет отзывы
  })

  it('обычное (не __CC_) сообщение — ничего не маршрутизируется', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('console-message', { message: 'какой-то обычный лог страницы' })
    expect(d.handleNewMessage).not.toHaveBeenCalled()
    expect(d.setOzonCounts).not.toHaveBeenCalled()
  })

  it('реальная ошибка загрузки → notify один раз; повтор не дублирует', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -20, errorDescription: 'ERR_BLOCKED_BY_CLIENT', isMainFrame: true, validatedURL: 'https://seller.ozon.ru/app/reviews/questions' })
    el.fire('did-fail-load', { errorCode: -21, errorDescription: 'ERR_NETWORK_CHANGED', isMainFrame: true })
    expect(d.notify, 'сразу карточки быть не должно - сторож ещё ждёт').not.toHaveBeenCalled()
    waitOut()
    expect(d.notify).toHaveBeenCalledTimes(1)
    // v1.2.363: формулировка НЕЙТРАЛЬНА (не винит только Ozon) — did-fail-load бывает и от обрыва сети.
    expect(d.notify.mock.calls[0][1]).toMatch(/интернет/)
    // v1.2.369: текст НЕ называет раздел (маршрутизатор общий на «Вопросы» И «Сообщения») — иначе врал бы.
    expect(d.notify.mock.calls[0][1]).not.toMatch(/Вопрос/)
    // v1.2.363: факт показа сообщения пишется в журнал.
    expect(d.log.mock.calls.some(c => /показал/.test(c[1] || ''))).toBe(true)
  })

  it('ERR_ABORTED (-3, редирект) — НЕ тревожит пользователя', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -3, errorDescription: 'ERR_ABORTED', isMainFrame: true })
    waitOut()
    expect(d.notify).not.toHaveBeenCalled()
  })

  it('под-ресурс (не главный документ) не считается блокировкой', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -20, isMainFrame: false })
    waitOut()
    expect(d.notify).not.toHaveBeenCalled()
  })

  it('повторная привязка к тому же элементу не вешает второй слушатель', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    bindOzonBgWatcher(el, 'ozon', d)
    expect(el.handlersFor('console-message').length).toBe(1)
  })

  it('впрыск сторожа: на КАЖДЫЙ dom-ready читает хук и выполняет (нет «липкого» флага)', async () => {
    const el = makeEl(); const d = makeDeps()
    el.executeJavaScript = vi.fn(() => Promise.resolve())
    const invoke = vi.fn(() => Promise.resolve('/* ozon hook code */'))
    const prevApi = window.api
    window.api = { invoke }
    try {
      bindOzonBgWatcher(el, 'ozon', d)
      el.fire('dom-ready')
      el.fire('dom-ready') // повторный dom-ready (как после ПЕРЕЗАГРУЗКИ страницы) — впрыск ДОЛЖЕН повториться
      await Promise.resolve(); await Promise.resolve()
      expect(invoke).toHaveBeenCalledWith('app:read-hook', 'ozon')
      expect(invoke.mock.calls.length).toBe(2) // без липкого флага → впрыск на каждый dom-ready
      expect(el.executeJavaScript).toHaveBeenCalled()
    } finally { window.api = prevApi }
  })

  it('null-элемент (размонтирование) не падает', () => {
    expect(() => bindOzonBgWatcher(null, 'ozon', makeDeps())).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// v1.2.467 — ЖАЛОБА 2026-09-16 «часто вижу окно "Не удалось открыть фоновую страницу Ozon"».
//
// КОРЕНЬ (доказан журналом + чтением кода): пометка «уже сообщил» жила НА ЭЛЕМЕНТЕ страницы
// (el.__ccOzonBgBlockNotified) и обнулялась вместе с ним. Журнал 2026-09-16: за ОДИН запуск
// приложения фоновая страница создавалась 9 раз (три раздела × три пересоздания при горячей
// перезагрузке в режиме разработки) — значит и чистых пометок было 9.
//
// Лечение: память переехала в общий код (shared/ozonNotifDedup.js), где уже жила такая же
// память для вопросов и отзывов — со сроком молчания 6 часов и потолком записей.
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 ЛОВУШКА: карточка о недоступности не повторяется после пересоздания страницы (v1.2.467)', () => {
  it('пять РАЗНЫХ элементов страницы подряд → карточка ОДНА', () => {
    const d = makeDeps()
    for (let i = 0; i < 5; i++) {
      const el = makeEl()                                   // каждый раз НОВЫЙ элемент — как при пересоздании
      bindOzonBgWatcher(el, 'ozon', d)
      el.fire('did-fail-load', { errorCode: -101, errorDescription: 'ERR_CONNECTION_RESET', isMainFrame: true })
    }
    waitOut()
    expect(d.notify).toHaveBeenCalledTimes(1)
  })

  it('три фоновые страницы упали разом → карточка ОДНА, а не три', () => {
    const d = makeDeps()
    for (const url of ['questions', 'messenger', 'reviews']) {
      const el = makeEl()
      bindOzonBgWatcher(el, 'ozon', d)
      el.fire('did-fail-load', { errorCode: -101, isMainFrame: true, validatedURL: url })
    }
    waitOut()
    expect(d.notify).toHaveBeenCalledTimes(1)
  })

  it('🔴 ЛОВУШКА: молчание НЕ немое — в журнал пишется, что карточку не показали и почему', () => {
    const d = makeDeps()
    for (let i = 0; i < 3; i++) {
      const el = makeEl()
      bindOzonBgWatcher(el, 'ozon', d)
      el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    }
    waitOut()
    const lines = d.log.mock.calls.map(c => String(c[1]))
    expect(lines.filter(l => l.includes('показал пользователю сообщение'))).toHaveLength(1)
    const silent = lines.filter(l => l.includes('НЕ показываю'))
    expect(silent.length, 'каждое подавление должно попасть в журнал').toBe(2)
    expect(silent[0]).toMatch(/уже сообщали/)
    expect(silent[0]).toMatch(/code=-101/)
  })

  it('старые правила сохранены: отмена (-3), не главный документ и «Отзывы» не тревожат', () => {
    const d = makeDeps()
    const a = makeEl(); bindOzonBgWatcher(a, 'ozon', d)
    a.fire('did-fail-load', { errorCode: -3, isMainFrame: true })
    const b = makeEl(); bindOzonBgWatcher(b, 'ozon', d)
    b.fire('did-fail-load', { errorCode: -101, isMainFrame: false })
    const c = makeEl(); bindOzonBgWatcher(c, 'ozon', { ...d, suppressFailNotice: true })
    c.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    waitOut()
    expect(d.notify).not.toHaveBeenCalled()
  })

  it('«Отзывы» промолчали, но память НЕ израсходована — обычная страница карточку получит', () => {
    const d = makeDeps()
    const c = makeEl(); bindOzonBgWatcher(c, 'ozon', { ...d, suppressFailNotice: true })
    c.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    const q = makeEl(); bindOzonBgWatcher(q, 'ozon', d)
    q.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    waitOut()
    expect(d.notify).toHaveBeenCalledTimes(1)
  })
})
