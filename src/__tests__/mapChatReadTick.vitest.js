// v1.2.229: галочка прочтения ПОСЛЕДНЕГО сообщения в СПИСКЕ чатов (как в Telegram).
// mapChat выставляет три поля из last_message + last_read_outbox_message_id:
//   lastMessageIsOutgoing — моё ли последнее сообщение (только тогда рисуем галочку)
//   lastMessageSending    — ещё уходит на сервер (⏳, не «прочитано»)
//   lastMessageRead        — прочитано ⇔ id ≤ last_read_outbox_message_id (та же логика,
//                            что markOutboxRead для окна чата)
// Вынесено в отдельный файл, чтобы не раздувать tdlibMapper.vitest.js (у лимита 400 строк).
import { describe, it, expect } from 'vitest'
import { mapChat } from '../../main/native/backends/tdlibMapper.js'

function privateChat(over = {}) {
  return {
    '@type': 'chat', id: 42,
    type: { '@type': 'chatTypePrivate', user_id: 42 },
    title: 'Клиент', unread_count: 0,
    ...over,
  }
}
const outMsg = (id) => ({ id, is_outgoing: true, content: { '@type': 'messageText', text: { text: 'ок', entities: [] } }, date: 1715000000 })
const inMsg = (id) => ({ id, is_outgoing: false, content: { '@type': 'messageText', text: { text: 'привет', entities: [] } }, date: 1715000000 })

describe('mapChat — галочка прочтения в списке чатов', () => {
  it('последнее НАШЕ и прочитано (id ≤ last_read_outbox) → read=true', () => {
    const r = mapChat(privateChat({ last_read_outbox_message_id: 100, last_message: outMsg(90) }), 'tg_1')
    expect(r.lastMessageIsOutgoing).toBe(true)
    expect(r.lastMessageRead).toBe(true)
    expect(r.lastMessageSending).toBe(false)
  })

  it('последнее НАШЕ, ещё не прочитано (id > last_read_outbox) → read=false', () => {
    const r = mapChat(privateChat({ last_read_outbox_message_id: 50, last_message: outMsg(90) }), 'tg_1')
    expect(r.lastMessageIsOutgoing).toBe(true)
    expect(r.lastMessageRead).toBe(false)
  })

  it('последнее ещё уходит (sending_state) → sending=true, read=false', () => {
    const msg = { ...outMsg(90), sending_state: { '@type': 'messageSendingStatePending' } }
    const r = mapChat(privateChat({ last_read_outbox_message_id: 100, last_message: msg }), 'tg_1')
    expect(r.lastMessageSending).toBe(true)
    expect(r.lastMessageRead).toBe(false)
  })

  it('последнее от собеседника → isOutgoing=false, read=false (галочки нет)', () => {
    const r = mapChat(privateChat({ unread_count: 1, last_read_outbox_message_id: 100, last_message: inMsg(90) }), 'tg_1')
    expect(r.lastMessageIsOutgoing).toBe(false)
    expect(r.lastMessageRead).toBe(false)
  })
})
