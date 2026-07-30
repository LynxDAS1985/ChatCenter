// v1.2.137: тест правила «снимать ли карточку уведомления по серверному прочтению».
import { describe, it, expect } from 'vitest'
import { shouldDismissForRead } from '../../main/handlers/notifDismissDecision.js'

const item = (accountId, chatId, messageId) => ({ id: 'n1', source: { accountId, chatId, messageId } })

describe('shouldDismissForRead — снятие карточки по прочтению на сервере (v1.2.137)', () => {
  it('сообщение прочитано (id <= last_read) в нужном чате → снять', () => {
    expect(shouldDismissForRead(item('tg_1', '-100', '500'), 'tg_1:-100', 900)).toBe(true)
  })
  it('сообщение НЕ прочитано (id > last_read) → не снимать (новое после прочтения)', () => {
    expect(shouldDismissForRead(item('tg_1', '-100', '900'), 'tg_1:-100', 500)).toBe(false)
  })
  it('граница: id == last_read → снять (прочитано ровно до него)', () => {
    expect(shouldDismissForRead(item('tg_1', '-100', '500'), 'tg_1:-100', 500)).toBe(true)
  })
  it('другой чат → не трогать', () => {
    expect(shouldDismissForRead(item('tg_1', '-100', '500'), 'tg_1:-999', 900)).toBe(false)
  })
  it('другой аккаунт (тот же realId) → не трогать', () => {
    expect(shouldDismissForRead(item('tg_2', '-100', '500'), 'tg_1:-100', 900)).toBe(false)
  })
  it('нет source → false', () => {
    expect(shouldDismissForRead({ id: 'n1' }, 'tg_1:-100', 900)).toBe(false)
  })
  it('last_read = 0 / отсутствует (нет прочтения) → false', () => {
    expect(shouldDismissForRead(item('tg_1', '-100', '500'), 'tg_1:-100', 0)).toBe(false)
    expect(shouldDismissForRead(item('tg_1', '-100', '500'), 'tg_1:-100', undefined)).toBe(false)
  })
  it('пустой chatId → false', () => {
    expect(shouldDismissForRead(item('tg_1', '-100', '500'), '', 900)).toBe(false)
  })
})
