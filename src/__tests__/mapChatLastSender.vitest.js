// v1.2.130: имя автора последнего сообщения для превью «Имя: текст» в списке чатов.
// Правило: показываем ТОЛЬКО для групп/форумов (type==='group') и ТОЛЬКО для входящих.
// Канал / личка / исходящее → пусто. То же правило продублировано в живом пути
// nativeStoreIpc.js (tg:new-message) — держать синхронно.
import { describe, it, expect } from 'vitest'
import { mapChat } from '../../main/native/backends/tdlibMapper.js'

const supergroup = { '@type': 'supergroup', id: 7, is_channel: false }
function groupChat(lastMsg) {
  return {
    '@type': 'chat', id: -100, title: 'Группа', unread_count: 1,
    type: { '@type': 'chatTypeSupergroup', supergroup_id: 7, is_channel: false },
    last_message: lastMsg,
  }
}
const textMsg = (over = {}) => ({ date: 1715000000, content: { '@type': 'messageText', text: { text: 'x' } }, ...over })

describe('mapChat.lastMessageSenderName', () => {
  it('группа + входящее → имя из extras.lastMessageSender', () => {
    const r = mapChat(groupChat(textMsg({ is_outgoing: false })), 'tg_1',
      { supergroup, lastMessageSender: 'Мария', lastMessageIsOutgoing: false })
    expect(r.lastMessageSenderName).toBe('Мария')
  })

  it('группа + исходящее (своё) → «Вы» (v1.2.131)', () => {
    const r = mapChat(groupChat(textMsg({ is_outgoing: true })), 'tg_1',
      { supergroup, lastMessageSender: 'Я', lastMessageIsOutgoing: true })
    expect(r.lastMessageSenderName).toBe('Вы')
  })

  it('канал → пусто (даже если имя передали)', () => {
    const tdChat = {
      '@type': 'chat', id: -101, title: 'Канал', unread_count: 5,
      type: { '@type': 'chatTypeSupergroup', supergroup_id: 8, is_channel: true },
      last_message: textMsg({ is_outgoing: false }),
    }
    const r = mapChat(tdChat, 'tg_1', { lastMessageSender: 'Канал', lastMessageIsOutgoing: false })
    expect(r.lastMessageSenderName).toBe('')
  })

  it('личка → пусто', () => {
    const tdChat = {
      '@type': 'chat', id: 5, title: 'Иван', unread_count: 0,
      type: { '@type': 'chatTypePrivate', user_id: 5 },
      last_message: textMsg({ is_outgoing: false }),
    }
    const r = mapChat(tdChat, 'tg_1', { lastMessageSender: 'Иван', lastMessageIsOutgoing: false })
    expect(r.lastMessageSenderName).toBe('')
  })

  it('группа без имени (extras пуст) → пусто, не падает', () => {
    const r = mapChat(groupChat(textMsg({ is_outgoing: false })), 'tg_1', { supergroup })
    expect(r.lastMessageSenderName).toBe('')
  })
})
