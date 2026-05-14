// v0.89.0 — Stage 4 / Этап 2.1: основные функциональные тесты tdlibMapper.
//
// Этот файл — базовые сценарии: entities, текст, sender, edit, mapChat, messagePreview.
// Медиа-типы и сложные сценарии (album / reply / forward) — см. tdlibMapperMedia.vitest.js.

import { describe, it, expect } from 'vitest'
import {
  mapMessage, mapChat, messagePreview, mapEntities,
} from '../../main/native/backends/tdlibMapper.js'

// Хелпер для создания минимального tdMsg — общая база для большинства тестов.
function tdMsgText(overrides = {}) {
  return {
    '@type': 'message',
    id: 100,
    chat_id: -1001234567890,
    sender_id: { '@type': 'messageSenderUser', user_id: 999 },
    is_outgoing: false,
    date: 1715000000,
    edit_date: 0,
    media_album_id: '0',
    content: { '@type': 'messageText', text: { '@type': 'formattedText', text: 'Привет', entities: [] } },
    ...overrides,
  }
}

// ──────────────────────────────────────────────────────────────────────
// ENTITIES
// ──────────────────────────────────────────────────────────────────────

describe('mapEntities', () => {
  it('пустой массив для undefined/null', () => {
    expect(mapEntities(undefined)).toEqual([])
    expect(mapEntities(null)).toEqual([])
    expect(mapEntities([])).toEqual([])
  })

  it('Bold + Italic + Code', () => {
    const tdEntities = [
      { '@type': 'textEntity', offset: 0, length: 5, type: { '@type': 'textEntityTypeBold' } },
      { '@type': 'textEntity', offset: 6, length: 4, type: { '@type': 'textEntityTypeItalic' } },
      { '@type': 'textEntity', offset: 11, length: 3, type: { '@type': 'textEntityTypeCode' } },
    ]
    const mapped = mapEntities(tdEntities)
    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toEqual({ type: 'bold', offset: 0, length: 5, url: null, userId: null, language: null })
    expect(mapped[1].type).toBe('italic')
    expect(mapped[2].type).toBe('code')
  })

  it('TextUrl с url', () => {
    const tdEntities = [
      { '@type': 'textEntity', offset: 10, length: 5, type: { '@type': 'textEntityTypeTextUrl', url: 'https://example.com' } },
    ]
    const mapped = mapEntities(tdEntities)
    expect(mapped[0].type).toBe('texturl')
    expect(mapped[0].url).toBe('https://example.com')
  })

  it('MentionName с user_id', () => {
    const tdEntities = [
      { '@type': 'textEntity', offset: 0, length: 4, type: { '@type': 'textEntityTypeMentionName', user_id: 12345 } },
    ]
    const mapped = mapEntities(tdEntities)
    expect(mapped[0].type).toBe('mentionname')
    expect(mapped[0].userId).toBe('12345')
  })

  it('PreCode со language', () => {
    const tdEntities = [
      { '@type': 'textEntity', offset: 0, length: 10, type: { '@type': 'textEntityTypePreCode', language: 'javascript' } },
    ]
    const mapped = mapEntities(tdEntities)
    expect(mapped[0].type).toBe('pre')
    expect(mapped[0].language).toBe('javascript')
  })

  it('неизвестный тип получает разумный fallback', () => {
    const tdEntities = [
      { '@type': 'textEntity', offset: 0, length: 5, type: { '@type': 'textEntityTypeFutureFeature' } },
    ]
    const mapped = mapEntities(tdEntities)
    expect(mapped[0].type).toBe('futurefeature')
  })
})

// ──────────────────────────────────────────────────────────────────────
// MAPMESSAGE — text + sender
// ──────────────────────────────────────────────────────────────────────

describe('mapMessage — текст и базовые поля', () => {
  it('обычное текстовое сообщение от пользователя', () => {
    const r = mapMessage(tdMsgText(), 'tg_111:222')
    expect(r.id).toBe('100')
    expect(r.chatId).toBe('tg_111:222')
    expect(r.senderId).toBe('999')
    expect(r.text).toBe('Привет')
    expect(r.timestamp).toBe(1715000000 * 1000)
    expect(r.isOutgoing).toBe(false)
    expect(r.isEdited).toBe(false)
    expect(r.mediaType).toBe(null)
    expect(r.groupedId).toBe(null)
    expect(r.replyToId).toBe(null)
    expect(r.fwdFrom).toBe(null)
  })

  it('исходящее сообщение с edit_date', () => {
    const r = mapMessage(tdMsgText({ is_outgoing: true, edit_date: 1715000100 }), 'tg_1:2')
    expect(r.isOutgoing).toBe(true)
    expect(r.isEdited).toBe(true)
  })

  it('senderId извлекается из messageSenderChat', () => {
    const r = mapMessage(tdMsgText({ sender_id: { '@type': 'messageSenderChat', chat_id: -123456 } }), 'tg_1:2')
    expect(r.senderId).toBe('-123456')
  })

  it('пустой/отсутствующий tdMsg возвращает null', () => {
    expect(mapMessage(null, 'tg_1:2')).toBe(null)
    expect(mapMessage(undefined, 'tg_1:2')).toBe(null)
  })

  it('senderName и senderAvatar берутся из extras', () => {
    const r = mapMessage(tdMsgText(), 'tg_1:2', { senderName: 'Иван', senderAvatar: 'cc-media://avatars/7.jpg' })
    expect(r.senderName).toBe('Иван')
    expect(r.senderAvatar).toBe('cc-media://avatars/7.jpg')
  })

  it('text с entities', () => {
    const r = mapMessage(tdMsgText({
      content: {
        '@type': 'messageText',
        text: {
          '@type': 'formattedText',
          text: 'Hello world',
          entities: [
            { '@type': 'textEntity', offset: 0, length: 5, type: { '@type': 'textEntityTypeBold' } },
          ],
        },
      },
    }), 'tg_1:2')
    expect(r.text).toBe('Hello world')
    expect(r.entities).toHaveLength(1)
    expect(r.entities[0].type).toBe('bold')
  })
})

// ──────────────────────────────────────────────────────────────────────
// MAPCHAT
// ──────────────────────────────────────────────────────────────────────

describe('mapChat', () => {
  it('chatTypePrivate → user', () => {
    const tdChat = {
      '@type': 'chat',
      id: 999,
      type: { '@type': 'chatTypePrivate', user_id: 999 },
      title: 'Иван Петров',
      unread_count: 5,
      last_read_inbox_message_id: 100,
      last_message: { content: { '@type': 'messageText', text: { text: 'hello', entities: [] } }, date: 1715000000 },
    }
    const r = mapChat(tdChat, 'tg_1')
    expect(r.id).toBe('tg_1:999')
    expect(r.type).toBe('user')
    expect(r.title).toBe('Иван Петров')
    expect(r.unreadCount).toBe(5)
    expect(r.readInboxMaxId).toBe(100)
    expect(r.lastMessage).toBe('hello')
    expect(r.lastMessageTs).toBe(1715000000 * 1000)
  })

  it('chatTypeBasicGroup → group, isForum=false', () => {
    const tdChat = {
      '@type': 'chat',
      id: -123,
      type: { '@type': 'chatTypeBasicGroup', basic_group_id: 555 },
      title: 'Семья',
      unread_count: 0,
    }
    const r = mapChat(tdChat, 'tg_1')
    expect(r.type).toBe('group')
    expect(r.isForum).toBe(false)
  })

  it('chatTypeSupergroup is_channel=true → channel', () => {
    const tdChat = {
      '@type': 'chat',
      id: -1001234,
      type: { '@type': 'chatTypeSupergroup', supergroup_id: 999, is_channel: true },
      title: 'Канал',
      unread_count: 100,
    }
    const r = mapChat(tdChat, 'tg_1')
    expect(r.type).toBe('channel')
  })

  it('chatTypeSupergroup is_channel=false и is_forum=true → group + isForum', () => {
    const tdChat = {
      '@type': 'chat',
      id: -1001234,
      type: { '@type': 'chatTypeSupergroup', supergroup_id: 999, is_channel: false, is_forum: true },
      title: 'Чат с темами',
      unread_count: 0,
    }
    const r = mapChat(tdChat, 'tg_1')
    expect(r.type).toBe('group')
    expect(r.isForum).toBe(true)
  })

  it('null/undefined → null; отсутствие accountId → null', () => {
    expect(mapChat(null, 'tg_1')).toBe(null)
    expect(mapChat(undefined, 'tg_1')).toBe(null)
    expect(mapChat({ id: 1 }, null)).toBe(null)
  })

  it('extras.avatar / isOnline заполняются', () => {
    const tdChat = {
      '@type': 'chat', id: 1, type: { '@type': 'chatTypePrivate', user_id: 1 },
      title: 'X', unread_count: 0,
    }
    const r = mapChat(tdChat, 'tg_a', { avatar: 'cc-media://avatars/1.jpg', isOnline: true })
    expect(r.avatar).toBe('cc-media://avatars/1.jpg')
    expect(r.isOnline).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────
// MESSAGEPREVIEW
// ──────────────────────────────────────────────────────────────────────

describe('messagePreview', () => {
  it('текст с caption или text', () => {
    expect(messagePreview({ content: { '@type': 'messageText', text: { text: 'Привет мир' } } })).toBe('Привет мир')
  })

  it('photo без caption → 🖼 Фото', () => {
    expect(messagePreview({ content: { '@type': 'messagePhoto' } })).toBe('🖼 Фото')
  })

  it('photo c caption → текст caption', () => {
    expect(messagePreview({ content: { '@type': 'messagePhoto', caption: { text: 'Подпись' } } })).toBe('Подпись')
  })

  it('voice → 🎤 Голосовое', () => {
    expect(messagePreview({ content: { '@type': 'messageVoiceNote' } })).toBe('🎤 Голосовое')
  })

  it('document с file_name', () => {
    expect(messagePreview({ content: { '@type': 'messageDocument', document: { file_name: 'doc.pdf' } } })).toBe('📎 doc.pdf')
  })

  it('document без file_name → 📎 Файл', () => {
    expect(messagePreview({ content: { '@type': 'messageDocument', document: {} } })).toBe('📎 Файл')
  })

  it('null / undefined → пустая строка', () => {
    expect(messagePreview(null)).toBe('')
    expect(messagePreview(undefined)).toBe('')
  })

  it('messagePinMessage — служебное', () => {
    expect(messagePreview({ content: { '@type': 'messagePinMessage' } })).toBe('📌 закреплено сообщение')
  })

  it('неизвестный @type → служебное', () => {
    expect(messagePreview({ content: { '@type': 'messageFutureUnknown' } })).toBe('⚙️ служебное сообщение')
  })
})
