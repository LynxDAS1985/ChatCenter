// Проверки сторожа «подожди и посмотри» для фоновых страниц Ozon (shared/ozonBgFailWatch.js),
// проверяемого через настоящий маршрутизатор bindOzonBgWatcher.
//
// Вынесено из ozonBgWatcher.vitest.js в v1.2.471: тот файл перерос потолок 400 строк, а тема тут
// самостоятельная — «тревожить ли человека», а не «куда направить сигнал из страницы».
//
// Время здесь ПОДДЕЛЬНОЕ и прокручивается вручную: карточка приходит не сразу, и по настоящим часам
// проверки зависели бы от скорости машины (грабля, на которую проект наступал в v1.2.468 и v1.2.469).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { bindOzonBgWatcher } from '../utils/ozonBgWatcher.js'
import { resetOzonNotifDedup } from '../../shared/ozonNotifDedup.js'

function makeEl(url = 'https://seller.ozon.ru/app/messenger?group=customers_v2') {
  const handlers = {}
  return {
    addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn) },
    getURL: () => url,
    isConnected: true,          // страница на экране (false = её убрали)
    reload: vi.fn(),            // попытка загрузить заново
    fire: (t, ev) => (handlers[t] || []).forEach((fn) => fn(ev)),
  }
}

function makeDeps() {
  let ozonState = {}
  return {
    handleNewMessage: vi.fn(),
    setOzonCounts: vi.fn((fn) => { ozonState = fn(ozonState) }),
    log: vi.fn(),
    notify: vi.fn(),
  }
}

// Память «уже сообщали» общая для всего приложения — без сброса проверки зависели бы от порядка
// запуска: одна «съедала» бы карточку у следующей (см. .memory-bank/workflow.md).
beforeEach(() => { resetOzonNotifDedup(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())

/** Прокрутить время так, чтобы сторож успел сдаться и показать карточку. */
const waitOut = () => vi.advanceTimersByTime(60000)

// =================================================================================================
// v1.2.470 - ЖАЛОБА 2026-09-16: «а можно сделать авто-повтор, чтобы проходил автоматом,
// без уведомлений?»
//
// Жалоба обоснована. Разбор журнала: обе карточки за день были ЛОЖНОЙ ТРЕВОГОЙ - страница
// поднималась сама за 0-1 секунду (11:29:55 сбой -> 11:29:56 загрузилась; 15:57:19 -> 15:57:19).
//
// Лечение: при сбое ждём, не поднимется ли страница сама, и один раз пробуем загрузить заново.
// Карточка - только если за 45 секунд она так и не ожила.
// =================================================================================================
describe('сбой Ozon: сначала ждём и пробуем сами, карточка - в последнюю очередь (v1.2.470)', () => {
  it('[!] ГЛАВНОЕ: страница поднялась сама -> карточки НЕТ, только запись в журнал', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, errorDescription: 'ERR_CONNECTION_RESET', isMainFrame: true })
    vi.advanceTimersByTime(1000)
    // счётчик БОЛЬШЕ НУЛЯ = на странице реально есть строки → это настоящий Ozon
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'qa', n: 2 }) })
    waitOut()
    expect(d.notify).not.toHaveBeenCalled()
    expect(d.log.mock.calls.some(c => /поднялась САМА/.test(String(c[1])))).toBe(true)
  })

  it('страница так и не ожила -> карточка приходит, но не в первую секунду', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    vi.advanceTimersByTime(44000)
    expect(d.notify, 'через 44 с ещё ждём').not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(d.notify).toHaveBeenCalledTimes(1)
    expect(d.notify.mock.calls[0][1]).toMatch(/интернет/)
  })

  it('[!] ЛОВУШКА: «страница загрузилась» сразу после сбоя - это эхо страницы-ошибки Chromium', () => {
    // Chromium на неудачу показывает в том же окне СВОЮ страницу-ошибку, и по ней приходит
    // ТО ЖЕ событие «загрузилась» (доказано в v1.2.453, reconnect-plan.md, раздел 4b).
    // Поверить ему - значит молчать при настоящей беде.
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    vi.advanceTimersByTime(500)
    el.fire('did-finish-load')          // это эхо, а не восстановление
    waitOut()
    expect(d.notify, 'эхо не должно отменять карточку').toHaveBeenCalledTimes(1)
  })

  it('«страница загрузилась» ПОЗЖЕ окна недоверия - настоящее восстановление, карточки нет', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    vi.advanceTimersByTime(3000)
    el.fire('did-finish-load')
    waitOut()
    expect(d.notify).not.toHaveBeenCalled()
  })

  it('один сбой -> ровно одна попытка загрузить заново (не по кругу)', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    vi.advanceTimersByTime(4000)
    expect(el.reload).not.toHaveBeenCalled()
    waitOut()
    expect(el.reload, 'на один сбой - одна попытка').toHaveBeenCalledTimes(1)
  })

  it('[!] ЛОВУШКА: ожившую страницу НЕ перезагружаем (у «Сообщений» это проглотило бы новое)', () => {
    // У «Сообщений покупателей» намеренно нет обновления по кругу: их память о прочитанном
    // не сохраняется на диск, поэтому лишняя перезагрузка потеряла бы новое сообщение.
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    vi.advanceTimersByTime(1000)
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'msg', n: 1 }) })
    waitOut()
    expect(el.reload).not.toHaveBeenCalled()
  })

  it('страницу убрали с экрана, пока ждали -> ни карточки, ни перезагрузки', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    el.isConnected = false
    waitOut()
    expect(d.notify).not.toHaveBeenCalled()
    expect(el.reload).not.toHaveBeenCalled()
  })
})

// =================================================================================================
// v1.2.471 - ИСПРАВЛЕНИЕ СОБСТВЕННОЙ ОШИБКИ v1.2.470 (нашла придирчивая перепроверка).
//
// БЫЛО: доказательством «страница жива» считалось ЛЮБОЕ сообщение нашего сторожа. Казалось, что на
// странице-ошибке Chromium сторожа быть не может. НЕВЕРНО: сторож впрыскивается на КАЖДОЕ событие
// «документ готов» (проверки адреса в ozonBgWatcher.js нет), попадает и в страницу-ошибку, и через
// 2,5 секунды пишет там стартовую диагностику с rows=0 (ozon.hook.js, ветка reason==='initial').
// Итог: настоящая беда оставалась БЕЗ карточки, а в журнале стояла ложная строка «поднялась САМА».
//
// СТАЛО: доказательств два, оба честные - (1) в странице больше 300 элементов (у заглушки Chromium
// их меньше сотни), (2) сторож прислал данные, которых на пустой странице быть не может.
// =================================================================================================
describe('доказательства «страница жива» честные (v1.2.471)', () => {
  it('[!] ГЛАВНОЕ: диагностика с ПУСТОЙ страницы-ошибки НЕ отменяет карточку', async () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, errorDescription: 'ERR_CONNECTION_RESET', isMainFrame: true })
    vi.advanceTimersByTime(2600)
    // ровно это пишет ozon.hook.js, впрыснутый в страницу-ошибку Chromium
    el.fire('console-message', { message: '__CC_DIAG__ozon-list reason=initial sec=customers rows=0 unread=0 emitted=0' })
    waitOut()
    expect(d.notify, 'настоящая беда обязана дойти до пользователя').toHaveBeenCalledTimes(1)
    expect(d.log.mock.calls.some(c => /поднялась САМА/.test(String(c[1]))), 'журнал не должен врать').toBe(false)
  })

  it('[!] ЛОВУШКА: счётчик НОЛЬ доказательством не считается (его шлёт и пустая страница)', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    vi.advanceTimersByTime(2600)
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'msg', n: 0 }) })
    waitOut()
    expect(d.notify).toHaveBeenCalledTimes(1)
  })

  it('«загрузилась», но в странице почти пусто -> это заглушка Chromium, карточка приходит', async () => {
    const el = makeEl(); const d = makeDeps()
    el.executeJavaScript = vi.fn(() => Promise.resolve(120))   // столько элементов у страницы-ошибки
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    vi.advanceTimersByTime(3000)
    el.fire('did-finish-load')
    await Promise.resolve(); await Promise.resolve()
    waitOut()
    expect(d.notify).toHaveBeenCalledTimes(1)
    expect(d.log.mock.calls.some(c => /заглушка Chromium/.test(String(c[1])))).toBe(true)
  })

  it('«загрузилась» и в странице тысячи элементов -> настоящий Ozon, карточки нет', async () => {
    const el = makeEl(); const d = makeDeps()
    el.executeJavaScript = vi.fn(() => Promise.resolve(5200))
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    vi.advanceTimersByTime(1000)                               // даже в первую секунду - содержимое доказывает
    el.fire('did-finish-load')
    await Promise.resolve(); await Promise.resolve()
    waitOut()
    expect(d.notify).not.toHaveBeenCalled()
    expect(d.log.mock.calls.some(c => /5200 элементов/.test(String(c[1])))).toBe(true)
  })

  it('спросить страницу не удалось -> НЕ засчитываем, ждём дальше и пишем причину', async () => {
    const el = makeEl(); const d = makeDeps()
    el.executeJavaScript = vi.fn(() => Promise.reject(new Error('страница занята')))
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    vi.advanceTimersByTime(3000)
    el.fire('did-finish-load')
    await Promise.resolve(); await Promise.resolve()
    waitOut()
    expect(d.notify).toHaveBeenCalledTimes(1)
    expect(d.log.mock.calls.some(c => /не удалось спросить страницу/.test(String(c[1])))).toBe(true)
  })
})

// =================================================================================================
// v1.2.471 - ЛЕСТНИЦА ПОПЫТОК. В v1.2.470 попытка была одна на всю беду: если и она не помогла,
// раздел «Сообщения покупателей» (у него нет своего обновления по кругу) оставался мёртвым до
// перезапуска программы. Паузы берём из общей лестницы проекта RETRY_LADDER_MS - своих не выдумываем.
// =================================================================================================
describe('повторы идут лестницей, а не один раз (v1.2.471)', () => {
  it('каждый новый сбой -> следующая попытка с растущей паузой', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    vi.advanceTimersByTime(5000)
    expect(el.reload).toHaveBeenCalledTimes(1)                 // 1-я ступень: 5 с
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })   // повтор тоже упал
    vi.advanceTimersByTime(9000)
    expect(el.reload, 'вторая пауза длиннее первой').toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(el.reload).toHaveBeenCalledTimes(2)                 // 2-я ступень: 10 с
  })

  it('[!] ЛОВУШКА: лестница кончается - не долбим Ozon бесконечно', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    for (let i = 0; i < 7; i++) {                              // сбоев больше, чем ступеней
      el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
      vi.advanceTimersByTime(70000)
    }
    expect(el.reload.mock.calls.length, 'попыток не больше, чем ступеней').toBeLessThanOrEqual(5)
    expect(d.log.mock.calls.some(c => /больше не пробую/.test(String(c[1])))).toBe(true)
  })

  it('страница ожила -> назначенная попытка отменяется (живую не перезагружаем)', () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-fail-load', { errorCode: -101, isMainFrame: true })
    vi.advanceTimersByTime(1000)
    el.fire('console-message', { message: '__CC_NOTIF__' + JSON.stringify({ t: 'Покупатель', b: 'Здравствуйте', g: 'ozon-list:7', src: 'ozon-list' }) })
    waitOut()
    expect(el.reload, 'у «Сообщений» лишняя перезагрузка проглотила бы новое').not.toHaveBeenCalled()
    expect(d.notify).not.toHaveBeenCalled()
  })
})
