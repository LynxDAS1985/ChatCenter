// v1.2.438: тест памяти «этот вопрос/отзыв Ozon уже показывали» — НА НАШЕЙ СТОРОНЕ.
//
// 🔴 ЛОВУШКА НА РЕАЛЬНУЮ ЖАЛОБУ (2026-09-09, ТРЕТИЙ заход): «уведомления одно и то же
// повторяется каждую минуту». Две предыдущие попытки чинили память ВНУТРИ страницы Ozon
// (её localStorage) и обе не помогли. Измерения показали почему:
//   • фоновая страница «Вопросы» принудительно обновляется раз в минуту;
//   • на свежей странице клетка «Ответы» ещё пустая → вопрос читается как «без ответа»
//     (в журнале: `initial unans=4 emitted=1`, через 18с на той же странице `backstop unans=3`);
//   • отпечаток текста вопроса стабилен (-100455210 для bodyLen=41), НО в сохранённой
//     памяти страницы (прочитана с диска из leveldb) его НЕТ — запись туда не доходит.
// Вывод: память обязана жить в НАШЕМ приложении, а не в чужой странице.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  shouldSkipOzonNotif,
  resetOzonNotifDedup,
  ozonNotifKey,
  OZON_DEDUP_TTL,
  OZON_DEDUP_MAX,
} from '../../shared/ozonNotifDedup.js'

const Q = 'ozon-questions'
const TAG = 'ozon-q:-100455210'
const BODY = 'XTA219010G0374634 подойдёт ли этот ремень'

beforeEach(() => resetOzonNotifDedup())

describe('Память показанного (shouldSkipOzonNotif)', () => {
  it('первый показ пропускаем, повтор через минуту — ГАСИМ', () => {
    const t0 = 1_000_000
    expect(shouldSkipOzonNotif(Q, TAG, BODY, t0).skip).toBe(false)
    // ровно тот случай из жалобы: та же карточка через 60 секунд
    const again = shouldSkipOzonNotif(Q, TAG, BODY, t0 + 60_000)
    expect(again.skip).toBe(true)
    expect(again.reason).toBe('уже показывали')
    expect(again.ageMs).toBe(60_000)
  })

  it('🔴 ЛОВУШКА: 60 повторов раз в минуту → показан РОВНО ОДИН раз', () => {
    let shown = 0
    for (let i = 0; i <= 60; i++) {
      if (!shouldSkipOzonNotif(Q, TAG, BODY, 1_000_000 + i * 60_000).skip) shown++
    }
    expect(shown).toBe(1)
  })

  it('память живёт 6 часов, потом вопрос снова можно показать', () => {
    const t0 = 1_000_000
    shouldSkipOzonNotif(Q, TAG, BODY, t0)
    expect(shouldSkipOzonNotif(Q, TAG, BODY, t0 + OZON_DEDUP_TTL - 1).skip).toBe(true)
    expect(shouldSkipOzonNotif(Q, TAG, BODY, t0 + OZON_DEDUP_TTL + 1).skip).toBe(false)
  })

  it('ДРУГОЙ вопрос проходит (не глушим лишнего)', () => {
    const t0 = 1_000_000
    shouldSkipOzonNotif(Q, TAG, BODY, t0)
    expect(shouldSkipOzonNotif(Q, 'ozon-q:777', 'Какая длина ремня?', t0 + 1000).skip).toBe(false)
  })

  it('🔴 ЛОВУШКА: СООБЩЕНИЯ покупателей НЕ глушим — «да» дважды это два сообщения', () => {
    const t0 = 1_000_000
    expect(shouldSkipOzonNotif('ozon-list', '', 'да', t0).skip).toBe(false)
    expect(shouldSkipOzonNotif('ozon-list', '', 'да', t0 + 60_000).skip).toBe(false)
    expect(shouldSkipOzonNotif('ozon-list', '', 'да', t0 + 60_000).reason).toBe('не списковый раздел')
  })

  it('отзывы — списковый раздел, повторы гасим', () => {
    const t0 = 1_000_000
    expect(shouldSkipOzonNotif('ozon-reviews', 'ozon-r:5', 'Хороший ремень', t0).skip).toBe(false)
    expect(shouldSkipOzonNotif('ozon-reviews', 'ozon-r:5', 'Хороший ремень', t0 + 60_000).skip).toBe(true)
  })

  it('нет отпечатка от хука → узнаём по разделу и тексту', () => {
    expect(ozonNotifKey(Q, '', BODY)).toContain(Q)
    expect(ozonNotifKey(Q, TAG, BODY)).toBe(TAG)
    const t0 = 1_000_000
    expect(shouldSkipOzonNotif(Q, '', BODY, t0).skip).toBe(false)
    expect(shouldSkipOzonNotif(Q, '', BODY, t0 + 60_000).skip).toBe(true)
  })

  it('память не растёт бесконечно (есть потолок)', () => {
    const t0 = 1_000_000
    for (let i = 0; i < OZON_DEDUP_MAX + 120; i++) shouldSkipOzonNotif(Q, 'ozon-q:' + i, 'в' + i, t0 + i)
    // самый свежий — помним
    expect(shouldSkipOzonNotif(Q, 'ozon-q:' + (OZON_DEDUP_MAX + 119), 'x', t0 + 99_999).skip).toBe(true)
  })

  it('крайние случаи: пустые аргументы не ломают', () => {
    expect(() => shouldSkipOzonNotif(undefined, undefined, undefined)).not.toThrow()
    expect(shouldSkipOzonNotif(undefined, undefined, undefined).skip).toBe(false)
    expect(shouldSkipOzonNotif(Q, null, null, 1).skip).toBe(false)
  })
})

describe('Проводка в фоновом стороже (сторож исходника)', () => {
  it('ozonBgWatcher спрашивает память ПЕРЕД отправкой уведомления', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync('src/utils/ozonBgWatcher.js', 'utf8')
    expect(src).toMatch(/shouldSkipOzonNotif/)
    expect(src).toMatch(/повтор подавлен/)
    // вызов памяти должен идти РАНЬШЕ handleNewMessage
    expect(src.indexOf('shouldSkipOzonNotif(parsed.source')).toBeLessThan(src.indexOf('handleNewMessage && handleNewMessage(ozonId'))
  })

  it('сбой записи в хранилище страницы больше НЕ глушится', async () => {
    const fs = await import('node:fs')
    const hook = fs.readFileSync('main/preloads/hooks/ozon.hook.js', 'utf8')
    expect(hook).toMatch(/ozon-save-fail/)
    expect(hook).not.toMatch(/localStorage\.setItem\(key, JSON\.stringify\(obj \|\| \{\}\)\); \} catch \(_\) \{\} \}/)
  })
})
