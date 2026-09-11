// v1.2.445: тесты чистой логики переподключения (shared/reconnectPlan.js).
// Поведение хука и экрана — src/hooks/useWebviewReconnect.vitest.jsx.
//
// 🔴 ГЛАВНЫЕ ЛОВУШКИ, которые тут сторожим:
//   1) код -3 (обычная отмена перехода) НЕ должен считаться обрывом — иначе будем
//      перезагружать живую страницу и стирать недописанное сообщение;
//   2) у МАКСа пауза не меньше 15 с — частые повторы однажды довели его сервер до
//      «Too many requests» (30 600 строк в журнале, ADR v1.2.417);
//   3) пауза обязана РАСТИ и упираться в 60 с, а не сбрасываться в 5 с по кругу.
import { describe, it, expect } from 'vitest'
import {
  RETRY_LADDER_MS, ABORTED_CODE, isNetworkError, errorName, nextPauseMs,
  planAfterFail, planTrying, planAfterRetryFail, dueIds, nextWakeMs, bringAllForward, secondsLeft,
  logFailLine, logSkipLine, logRetryFailLine, logRestoredLine, logManualLine, logNetLine,
  shouldAcceptLoaded, touchFailedAt, isErrorPageEcho, logEchoLine, ERROR_PAGE_GRACE_MS,
} from '../../shared/reconnectPlan.js'

const WA = 'https://web.whatsapp.com'
const MAX = 'https://web.max.ru'

describe('Какие ошибки считаем обрывом связи', () => {
  it('🔴 ЛОВУШКА: код -3 (обычная отмена перехода) — НЕ обрыв', () => {
    expect(isNetworkError(ABORTED_CODE)).toBe(false)
    expect(isNetworkError(-3)).toBe(false)
  })

  it('сетевые коды Chromium — обрыв', () => {
    for (const c of [-2, -7, -21, -100, -101, -102, -105, -106, -109, -118, -137, -324]) {
      expect(isNetworkError(c), 'код ' + c + ' должен считаться обрывом').toBe(true)
    }
  })

  it('чужие коды и мусор — не обрыв (повтор не поможет)', () => {
    for (const c of [-20, -300, 0, 200, undefined, null, '', 'abc', NaN]) {
      expect(isNetworkError(c), 'код ' + c + ' НЕ должен запускать повтор').toBe(false)
    }
  })

  it('имя кода понятное, а неизвестный не ломает текст', () => {
    expect(errorName(-106)).toBe('ERR_INTERNET_DISCONNECTED')
    expect(errorName(-3)).toBe('ERR_ABORTED')
    expect(errorName(-999)).toBe('код -999')
  })
})

describe('Растущая пауза', () => {
  it('лестница 5 → 10 → 20 → 40 → 60 секунд', () => {
    expect(RETRY_LADDER_MS).toEqual([5000, 10000, 20000, 40000, 60000])
    expect([0, 1, 2, 3, 4].map(a => nextPauseMs(a, WA))).toEqual([5000, 10000, 20000, 40000, 60000])
  })

  it('🔴 ЛОВУШКА: после лестницы пауза ОСТАЁТСЯ 60 с, а не сбрасывается', () => {
    for (const a of [5, 9, 40, 1000]) expect(nextPauseMs(a, WA)).toBe(60000)
  })

  it('🔴 ЛОВУШКА: у МАКСа пауза не меньше 15 с (защита от шторма запросов)', () => {
    expect(nextPauseMs(0, MAX)).toBe(15000)   // вместо 5 с
    expect(nextPauseMs(1, MAX)).toBe(15000)   // вместо 10 с
    expect(nextPauseMs(2, MAX)).toBe(20000)   // 20 с уже больше минимума — не трогаем
    expect(nextPauseMs(4, MAX)).toBe(60000)
  })

  it('минимум МАКСа не задевает других (в т.ч. похожий адрес climax.ru не проверяем — тут по подстроке)', () => {
    expect(nextPauseMs(0, WA)).toBe(5000)
    expect(nextPauseMs(0, 'https://web.telegram.org')).toBe(5000)
    expect(nextPauseMs(0, '')).toBe(5000)
    expect(nextPauseMs(0, undefined)).toBe(5000)
  })

  it('мусор вместо номера попытки не ломает расчёт', () => {
    for (const a of [undefined, null, NaN, -5, 'x']) expect(nextPauseMs(a, WA)).toBe(5000)
  })
})

describe('Планирование попыток', () => {
  const now = 1_700_000_000_000

  it('первый обрыв → ждём 5 с, попыток пока ноль', () => {
    const e = planAfterFail(null, { code: -106, url: WA, now })
    expect(e.phase).toBe('wait')
    expect(e.attempt).toBe(0)
    expect(e.pauseMs).toBe(5000)
    expect(e.dueAt).toBe(now + 5000)
    expect(e.since).toBe(now)
  })

  it('🔴 ЛОВУШКА: обрыв во время идущей попытки НЕ планирует вторую', () => {
    const trying = planTrying(planAfterFail(null, { code: -106, url: WA, now }), now)
    expect(trying.phase).toBe('trying')
    expect(planAfterFail(trying, { code: -106, url: WA, now: now + 100 })).toBe(trying)
  })

  it('попытка считается, время начала беды не теряется', () => {
    const first = planAfterFail(null, { code: -106, url: WA, now })
    const t1 = planTrying(first, now + 5000)
    expect(t1.attempt).toBe(1)
    expect(t1.since).toBe(now) // «восстановлено за N с» считается от первого обрыва
    const fail1 = planAfterRetryFail(t1, { code: -106, url: WA, now: now + 6000 })
    expect(fail1.attempt).toBe(1)
    expect(fail1.pauseMs).toBe(10000) // следующая пауза больше
    const t2 = planTrying(fail1, now + 16000)
    expect(t2.attempt).toBe(2)
    expect(t2.since).toBe(now)
  })

  it('после неудачи паузы идут по лестнице: 10 → 20 → 40 → 60 → 60', () => {
    let e = planAfterFail(null, { code: -106, url: WA, now })
    const got = []
    for (let i = 0; i < 5; i++) {
      e = planTrying(e, now)
      e = planAfterRetryFail(e, { code: -106, url: WA, now })
      got.push(e.pauseMs)
    }
    expect(got).toEqual([10000, 20000, 40000, 60000, 60000])
  })
})

describe('Кому пора пробовать и когда просыпаться', () => {
  const now = 1_700_000_000_000

  it('пора тем, у кого срок вышел; идущая попытка не в счёт', () => {
    const state = {
      a: { phase: 'wait', dueAt: now - 1 },
      b: { phase: 'wait', dueAt: now + 5000 },
      c: { phase: 'trying', dueAt: now - 999 },
    }
    expect(dueIds(state, now)).toEqual(['a'])
  })

  it('просыпаемся к ближайшему сроку; ждать нечего → null', () => {
    expect(nextWakeMs({ a: { phase: 'wait', dueAt: now + 9000 }, b: { phase: 'wait', dueAt: now + 3000 } }, now)).toBe(3000)
    expect(nextWakeMs({ a: { phase: 'trying', dueAt: now } }, now)).toBe(null)
    expect(nextWakeMs({}, now)).toBe(null)
    expect(nextWakeMs(null, now)).toBe(null)
  })

  it('просроченный срок → просыпаемся немедленно (0, не отрицательное число)', () => {
    expect(nextWakeMs({ a: { phase: 'wait', dueAt: now - 50000 } }, now)).toBe(0)
  })

  it('сеть вернулась → всем ожидающим срок «сейчас», идущие не трогаем', () => {
    const state = {
      a: { phase: 'wait', dueAt: now + 40000 },
      b: { phase: 'trying', dueAt: now },
      c: { phase: 'wait', dueAt: now + 9000 },
    }
    const r = bringAllForward(state, now)
    expect(r.moved).toBe(2)
    expect(r.state.a.dueAt).toBe(now)
    expect(r.state.c.dueAt).toBe(now)
    expect(r.state.b).toBe(state.b)
    expect(bringAllForward({}, now).moved).toBe(0)
  })

  it('обратный отсчёт для экрана: округляем вверх, ниже нуля не уходим', () => {
    expect(secondsLeft({ phase: 'wait', dueAt: now + 4200 }, now)).toBe(5)
    expect(secondsLeft({ phase: 'wait', dueAt: now - 1000 }, now)).toBe(0)
    expect(secondsLeft({ phase: 'trying', dueAt: now + 9000 }, now)).toBe(0)
    expect(secondsLeft(null, now)).toBe(0)
  })
})

describe('Записи в журнал', () => {
  const now = 1_700_000_000_000

  it('обрыв: видно код, имя кода, номер попытки и паузу', () => {
    const e = planAfterFail(null, { code: -106, url: WA, now })
    const line = logFailLine('WhatsApp', e)
    expect(line).toContain('[reconnect] WhatsApp: обрыв связи')
    expect(line).toContain('код=-106 ERR_INTERNET_DISCONNECTED')
    expect(line).toContain('попытка 1 через 5с')
  })

  it('чужой код: пишем, что повтор не нужен', () => {
    expect(logSkipLine('Ozon', -20)).toBe('[reconnect] Ozon: код=-20 (код -20) — повтор не нужен')
  })

  it('неудачная попытка: номер, код и следующая пауза', () => {
    let e = planAfterFail(null, { code: -106, url: WA, now })
    e = planAfterRetryFail(planTrying(e, now), { code: -118, url: WA, now })
    const line = logRetryFailLine('WhatsApp', e)
    expect(line).toContain('попытка 1 не удалась')
    expect(line).toContain('код=-118 ERR_CONNECTION_TIMED_OUT')
    expect(line).toContain('следующая через 10с')
  })

  it('восстановление: сколько заняло и сколько было попыток', () => {
    const e = { attempt: 4, since: now - 47000 }
    expect(logRestoredLine('WhatsApp', e, now)).toBe('[reconnect] WhatsApp: связь восстановлена за 47с (попыток: 4)')
  })

  it('нажатие кнопки и состояние сети', () => {
    expect(logManualLine('ВКонтакте')).toBe('[reconnect] ВКонтакте: повтор по кнопке пользователя')
    expect(logNetLine(false, 0)).toBe('[net] связь пропала')
    expect(logNetLine(true, 2)).toBe('[net] связь появилась — пробуем поднять мессенджеры: 2')
  })

  it('пустые данные не ломают текст (нечего разбирать — не падаем)', () => {
    expect(typeof logRestoredLine('X', null, now)).toBe('string')
    expect(typeof logRestoredLine('X', {}, now)).toBe('string')
  })
})

describe('Верить ли событию «страница загрузилась» (находки ревью v1.2.452)', () => {
  const now = 1_700_000_000_000

  it('🔴 ЛОВУШКА: сразу после сбоя — НЕ верим (это страница-ошибка)', () => {
    const e = planAfterFail(null, { code: -106, url: WA, now })
    expect(isErrorPageEcho(e, now + 30)).toBe(true)
    expect(shouldAcceptLoaded(e, now + 30)).toBe(false)
  })

  it('позже окна ожидания — верим (страница поднялась сама)', () => {
    const e = planAfterFail(null, { code: -106, url: WA, now })
    expect(shouldAcceptLoaded(e, now + ERROR_PAGE_GRACE_MS + 1)).toBe(true)
  })

  it('🔴 ЛОВУШКА: пока идёт НАША попытка — НЕ верим, даже если прошло много времени', () => {
    const e = planTrying(planAfterFail(null, { code: -106, url: WA, now }), now)
    expect(shouldAcceptLoaded(e, now + 60000)).toBe(false)
  })

  it('нет записи → верить нечему', () => {
    expect(shouldAcceptLoaded(null, now)).toBe(false)
    expect(isErrorPageEcho(null, now)).toBe(false)
    expect(isErrorPageEcho({}, now)).toBe(false)
  })

  it('🔴 ЛОВУШКА: новый сбой во время попытки ОСВЕЖАЕТ метку времени', () => {
    // Без этого метка осталась бы от первого сбоя и через 5 с эхо сошло бы за успех.
    const first = planAfterFail(null, { code: -106, url: WA, now })
    const trying = planTrying(first, now + 5000)
    expect(trying.failedAt, 'метка переносится как есть').toBe(now)
    const touched = touchFailedAt(trying, now + 5000)
    expect(touched.failedAt).toBe(now + 5000)
    expect(touched.attempt, 'остальное не трогаем').toBe(trying.attempt)
    expect(touched.phase).toBe('trying')
    expect(touchFailedAt(null, now)).toBe(null)
  })

  it('запись отказа в журнал понятная', () => {
    expect(logEchoLine('WhatsApp')).toContain('страница-ошибка')
    expect(logEchoLine('WhatsApp')).toContain('восстановлением не считаю')
  })
})
