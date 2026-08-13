// v1.2.232: тест backend-функции getContactInfo — профиль собеседника для «Карточки контакта».
// Проверяем: личный чат → телефон/username/bio; не личный → ok:false; нет клиента → ok:false.
import { describe, it, expect, vi } from 'vitest'
import { getContactInfo } from '../../main/native/backends/tdlibChatActions.js'

function makeManager({ chat, user, fullInfo, noClient } = {}) {
  return {
    getClient: () => noClient ? null : {
      invoke: vi.fn(async (req) => {
        if (req['@type'] === 'getUserFullInfo') return fullInfo || { bio: { text: '' } }
        if (req['@type'] === 'getUser') return user || {}
        return {}
      }),
    },
    getChatCached: () => chat || null,
    getUserCached: () => user || null,
  }
}

describe('getContactInfo (backend)', () => {
  it('личный чат: телефон + username + bio', async () => {
    const mgr = makeManager({
      chat: { type: { '@type': 'chatTypePrivate', user_id: 42 } },
      user: { phone_number: '79122822003', usernames: { active_usernames: ['ivan'] } },
      fullInfo: { bio: { text: 'Люблю авто' } },
    })
    const r = await getContactInfo(mgr, 'tg_1:42')
    expect(r.ok).toBe(true)
    expect(r.phone).toBe('+79122822003')
    expect(r.username).toBe('ivan')
    expect(r.bio).toBe('Люблю авто')
  })

  it('не личный чат (группа) → ok:false', async () => {
    const mgr = makeManager({ chat: { type: { '@type': 'chatTypeSupergroup', supergroup_id: 5 } } })
    const r = await getContactInfo(mgr, 'tg_1:-100500')
    expect(r.ok).toBe(false)
  })

  it('нет клиента (аккаунт не найден) → ok:false', async () => {
    const mgr = makeManager({ noClient: true })
    const r = await getContactInfo(mgr, 'tg_1:42')
    expect(r.ok).toBe(false)
  })

  it('телефон скрыт приватностью → ok:true, phone пустой (строку скроем в UI)', async () => {
    const mgr = makeManager({
      chat: { type: { '@type': 'chatTypePrivate', user_id: 7 } },
      user: { usernames: { active_usernames: ['nick'] } },  // без phone_number
      fullInfo: { bio: { text: '' } },
    })
    const r = await getContactInfo(mgr, 'tg_1:7')
    expect(r.ok).toBe(true)
    expect(r.phone).toBe('')
    expect(r.username).toBe('nick')
  })

  it('невалидный chatId → ok:false', async () => {
    const r = await getContactInfo(makeManager(), '')
    expect(r.ok).toBe(false)
  })
})
