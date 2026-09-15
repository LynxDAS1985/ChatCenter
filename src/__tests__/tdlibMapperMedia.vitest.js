// v0.89.0 — Stage 4 / Этап 2.1: тесты tdlibMapper для медиа и сложных сценариев.
//
// Этот файл — медиа-типы (photo/video/audio/document/voice/location), альбомы,
// reply, forward. Базовые сценарии (entities, text, mapChat, preview) — см. tdlibMapper.vitest.js.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { mapMessage } from '../../main/native/backends/tdlibMapper.js'
import { noteEmptyMessage } from '../../main/native/backends/tdlibMapperMedia.js'

// Хелпер: базовый message без media, который тесты подменяют через `content` override.
function tdMsgBase(content, overrides = {}) {
  return {
    '@type': 'message',
    id: 1,
    sender_id: { '@type': 'messageSenderUser', user_id: 1 },
    is_outgoing: false,
    date: 1715000000,
    media_album_id: '0',
    content,
    ...overrides,
  }
}

// ──────────────────────────────────────────────────────────────────────
// MEDIA TYPES
// ──────────────────────────────────────────────────────────────────────

describe('mapMessage — медиа', () => {
  it('messagePhoto с minithumbnail и размерами', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messagePhoto',
      photo: {
        minithumbnail: { data: 'BASE64DATA' },
        sizes: [
          { type: 's', width: 100, height: 75 },
          { type: 'm', width: 800, height: 600 },
          { type: 'x', width: 1280, height: 960 },
        ],
      },
      caption: { '@type': 'formattedText', text: 'caption', entities: [] },
    }), 'tg_1:2')
    expect(r.mediaType).toBe('photo')
    expect(r.mediaWidth).toBe(1280)
    expect(r.mediaHeight).toBe(960)
    expect(r.strippedThumb).toBe('data:image/jpeg;base64,BASE64DATA')
    expect(r.text).toBe('caption')
  })

  it('messageVideo с duration и dimensions', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageVideo',
      video: {
        duration: 60,
        width: 1920,
        height: 1080,
        file_name: 'vid.mp4',
        video: { size: 5000000 },
      },
      caption: { text: '', entities: [] },
    }), 'tg_1:2')
    expect(r.mediaType).toBe('video')
    expect(r.mediaWidth).toBe(1920)
    expect(r.mediaHeight).toBe(1080)
    expect(r.duration).toBe(60)
    expect(r.fileSize).toBe(5000000)
    expect(r.mediaPreview).toBe('vid.mp4')
  })

  it('messageDocument PDF → file', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageDocument',
      document: {
        mime_type: 'application/pdf',
        file_name: 'report.pdf',
        document: { size: 250000 },
      },
      caption: { text: '', entities: [] },
    }), 'tg_1:2')
    expect(r.mediaType).toBe('file')
    expect(r.mediaPreview).toBe('report.pdf')
    expect(r.fileSize).toBe(250000)
  })

  it('messageDocument с image/jpeg mime → photo', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageDocument',
      document: { mime_type: 'image/jpeg', file_name: 'img.jpg', document: { size: 100 } },
    }), 'tg_1:2')
    expect(r.mediaType).toBe('photo')
  })

  it('messageDocument с video/* mime → video', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageDocument',
      document: { mime_type: 'video/mp4', file_name: 'movie.mp4', document: { size: 1000 } },
    }), 'tg_1:2')
    expect(r.mediaType).toBe('video')
  })

  it('messageText с web_page → mediaType=link', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageText',
      text: { text: 'Check https://example.com', entities: [] },
      web_page: {
        url: 'https://example.com',
        title: 'Example',
        description: { text: 'Page description' },
        site_name: 'example.com',
      },
    }), 'tg_1:2')
    expect(r.mediaType).toBe('link')
    expect(r.webPage).toEqual({
      url: 'https://example.com',
      title: 'Example',
      description: 'Page description',
      siteName: 'example.com',
      photoUrl: null,
    })
  })

  it('messageVoiceNote → voice + duration', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageVoiceNote',
      voice_note: { duration: 15, voice: { size: 30000 } },
    }), 'tg_1:2')
    expect(r.mediaType).toBe('voice')
    expect(r.duration).toBe(15)
  })

  it('messageAudio → audio + duration + filename', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageAudio',
      audio: { duration: 200, file_name: 'song.mp3', title: 'Song', audio: { size: 5000000 } },
    }), 'tg_1:2')
    expect(r.mediaType).toBe('audio')
    expect(r.duration).toBe(200)
    expect(r.mediaPreview).toBe('song.mp3')
  })

  it('messageAnimation (GIF) → video (UI рендерит одинаково)', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageAnimation',
      animation: { width: 480, height: 320, duration: 3, animation: { size: 2000000 } },
    }), 'tg_1:2')
    expect(r.mediaType).toBe('video')
    expect(r.mediaWidth).toBe(480)
    expect(r.duration).toBe(3)
  })

  it('messageVideoNote → videonote', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageVideoNote',
      video_note: { duration: 5, video: { size: 800000 } },
    }), 'tg_1:2')
    expect(r.mediaType).toBe('videonote')
    expect(r.duration).toBe(5)
  })

  // v0.95.47: messageSticker → mediaType=null + emoji fallback в text (isLargeEmoji=true).
  // Раньше был 'other' но MessageBubble не имел рендера → пустой bubble (баг 8 июня 2026).
  it('messageSticker → text=emoji + mediaType=null + isLargeEmoji', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageSticker',
      sticker: { width: 512, height: 512, emoji: '🎉' },
    }), 'tg_1:2')
    expect(r.mediaType).toBe(null)
    expect(r.text).toBe('🎉')
    expect(r.isLargeEmoji).toBe(true)
  })

  // v0.95.47: messageSticker БЕЗ associated emoji → fallback '🎴'.
  it('messageSticker без emoji → text=🎴 fallback', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageSticker',
      sticker: { width: 512, height: 512 },
    }), 'tg_1:2')
    expect(r.mediaType).toBe(null)
    expect(r.text).toBe('🎴')
    expect(r.isLargeEmoji).toBe(true)
  })

  // v0.95.47: messageDice (🎲🎯🎰🏀⚽🎳) — emoji-anim тоже падал в пустой bubble.
  it('messageDice → text=emoji + mediaType=null + isLargeEmoji', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageDice',
      emoji: '🎲',
      value: 5,
    }), 'tg_1:2')
    expect(r.mediaType).toBe(null)
    expect(r.text).toBe('🎲')
    expect(r.isLargeEmoji).toBe(true)
  })

  it('messageLocation', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageLocation', location: { latitude: 55.7, longitude: 37.6 },
    }), 'tg_1:2')
    expect(r.mediaType).toBe('location')
  })

  it('messageContact', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messageContact', contact: { phone_number: '+7' },
    }), 'tg_1:2')
    expect(r.mediaType).toBe('contact')
  })

  it('messagePoll', () => {
    const r = mapMessage(tdMsgBase({
      '@type': 'messagePoll', poll: {},
    }), 'tg_1:2')
    expect(r.mediaType).toBe('poll')
  })

  it('сервисное messagePinMessage — mediaType=null', () => {
    const r = mapMessage(tdMsgBase({ '@type': 'messagePinMessage' }), 'tg_1:2')
    expect(r.mediaType).toBe(null)
  })
})

// ──────────────────────────────────────────────────────────────────────
// АЛЬБОМЫ + REPLY
// ──────────────────────────────────────────────────────────────────────

describe('mapMessage — альбом и reply', () => {
  it('media_album_id определяет groupedId', () => {
    const r = mapMessage(tdMsgBase(
      { '@type': 'messagePhoto', photo: { sizes: [] } },
      { media_album_id: '8765432100' },
    ), 'tg_1:2')
    expect(r.groupedId).toBe('8765432100')
  })

  it("media_album_id '0' даёт groupedId=null", () => {
    const r = mapMessage(tdMsgBase(
      { '@type': 'messageText', text: { text: 'x', entities: [] } },
      { media_album_id: '0' },
    ), 'tg_1:2')
    expect(r.groupedId).toBe(null)
  })

  it('reply_to → replyToId', () => {
    const r = mapMessage(tdMsgBase(
      { '@type': 'messageText', text: { text: 'reply', entities: [] } },
      { reply_to: { '@type': 'messageReplyToMessage', message_id: 999, chat_id: -100 } },
    ), 'tg_1:2')
    expect(r.replyToId).toBe('999')
  })

  it('reply_to отсутствует → replyToId=null', () => {
    const r = mapMessage(tdMsgBase(
      { '@type': 'messageText', text: { text: 'x', entities: [] } },
    ), 'tg_1:2')
    expect(r.replyToId).toBe(null)
  })
})

// ──────────────────────────────────────────────────────────────────────
// FORWARDS
// ──────────────────────────────────────────────────────────────────────

describe('mapMessage — forwards', () => {
  it('forward_info origin user', () => {
    const r = mapMessage(tdMsgBase(
      { '@type': 'messageText', text: { text: 'fwd', entities: [] } },
      { forward_info: { origin: { '@type': 'messageOriginUser', sender_user_id: 42 }, date: 1714900000 } },
    ), 'tg_1:2')
    expect(r.fwdFrom).toEqual({ name: '', id: '42' })
  })

  it('forward_info origin hidden user — только name', () => {
    const r = mapMessage(tdMsgBase(
      { '@type': 'messageText', text: { text: '', entities: [] } },
      { forward_info: { origin: { '@type': 'messageOriginHiddenUser', sender_name: 'Аноним' }, date: 1714900000 } },
    ), 'tg_1:2')
    expect(r.fwdFrom).toEqual({ name: 'Аноним', id: '' })
  })

  it('forward_info origin channel с author_signature', () => {
    const r = mapMessage(tdMsgBase(
      { '@type': 'messageText', text: { text: 'x', entities: [] } },
      { forward_info: { origin: { '@type': 'messageOriginChannel', chat_id: -1001, author_signature: 'Автор' }, date: 1714900000 } },
    ), 'tg_1:2')
    expect(r.fwdFrom).toEqual({ name: 'Автор', id: '-1001' })
  })

  it('forward_info origin chat', () => {
    const r = mapMessage(tdMsgBase(
      { '@type': 'messageText', text: { text: 'x', entities: [] } },
      { forward_info: { origin: { '@type': 'messageOriginChat', sender_chat_id: -555, author_signature: 'Подпись' }, date: 1714900000 } },
    ), 'tg_1:2')
    expect(r.fwdFrom).toEqual({ name: 'Подпись', id: '-555' })
  })

  it('forward_info отсутствует → fwdFrom=null', () => {
    const r = mapMessage(tdMsgBase(
      { '@type': 'messageText', text: { text: 'x', entities: [] } },
    ), 'tg_1:2')
    expect(r.fwdFrom).toBe(null)
  })
})

// ──────────────────────────────────────────────────────────────────────
// v1.2.461: «ПУСТОЕ СООБЩЕНИЕ» ПОПАДАЕТ В ЖУРНАЛ
//
// Жалоба 2026-09-15: пришёл вид сообщения, которого нет в разборе → в чате пустой пузырь,
// в уведомлении «[медиа]». Узнать вид было неоткуда: программа о нём нигде не писала.
// Такое ловили уже дважды по скриншотам (анимированный эмодзи v0.95.40, стикер v0.95.47).
// ──────────────────────────────────────────────────────────────────────
describe('пустое сообщение попадает в журнал (v1.2.461)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('незнакомый вид без текста → в журнал уходит строка с НАЗВАНИЕМ вида', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mapMessage(tdMsgBase({ '@type': 'messageSomethingBrandNew' }), 'chat1')
    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0][0])
    expect(line).toContain('messageSomethingBrandNew')
    expect(line).toContain('[tdlib-empty]')
  })

  it('🔴 СВЁРТКА: тот же вид второй раз в журнал НЕ пишется (иначе поток = сотни строк)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(noteEmptyMessage('messageDuplicateProbe')).toBe(true)
    expect(noteEmptyMessage('messageDuplicateProbe')).toBe(false)
    expect(noteEmptyMessage('messageDuplicateProbe')).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('🔴 ЛОВУШКА: СТИКЕР в журнал НЕ попадает — он не пустой, у него эмодзи вместо текста', () => {
    // Стикер тоже даёт mediaType=null. Если бы писали по признаку «незнакомый вид»,
    // журнал засорялся бы стикерами. Поэтому пишем по факту «ни текста, ни вложения».
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = mapMessage(tdMsgBase({ '@type': 'messageSticker', sticker: { emoji: '🔥' } }), 'chat1')
    expect(m.text).toBe('🔥')
    expect(warn).not.toHaveBeenCalled()
  })

  it('кубик 🎲 тоже не попадает — та же причина', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mapMessage(tdMsgBase({ '@type': 'messageDice', emoji: '🎲' }), 'chat1')
    expect(warn).not.toHaveBeenCalled()
  })

  it('🔴 НАСТОЯЩАЯ ЛОВУШКА условия: анимированный эмодзи в журнал НЕ попадает', () => {
    // ⚠️ Почему именно этот вид, а не стикер: свёртка «один раз на вид» живёт на весь
    // прогон. Стикер и кубик встречаются в тестах ВЫШЕ по файлу, поэтому при сломанном
    // условии их бы записали те тесты, а сюда бы уже ничего не дошло — ловушка молчала бы.
    // Проверено прогоном «наоборот»: со стикером поломка НЕ ловилась, с этим видом — ловится.
    // Имя messageAnimatedEmoji в файле больше нигде не используется, счётчик чист.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = mapMessage(tdMsgBase({ '@type': 'messageAnimatedEmoji', emoji: '👍' }), 'chat1')
    expect(m.text).toBe('👍')          // вложения нет, но текст есть — пустым не выглядит
    expect(warn).not.toHaveBeenCalled()
  })

  it('обычный текст — не попадает', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mapMessage(tdMsgBase({ '@type': 'messageText', text: { text: 'привет', entities: [] } }), 'chat1')
    expect(warn).not.toHaveBeenCalled()
  })

  it('🔴 ЛОВУШКА второй половины условия: вложение без подписи в журнал НЕ попадает', () => {
    // Берём messageVenue (место на карте): текста у него нет, зато вложение есть.
    // ⚠️ Имя выбрано свободным (в файле больше нигде не встречается) — иначе свёртка
    // «один раз на вид» съела бы запись в тестах выше, и ловушка молчала бы.
    // Проверено прогоном «наоборот»: с messagePhoto поломка НЕ ловилась, с этим видом — ловится.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = mapMessage(tdMsgBase({ '@type': 'messageVenue', venue: { title: 'Кафе' } }), 'chat1')
    expect(m.text).toBe('')            // подписи нет
    expect(m.mediaType).toBe('location')  // но вложение есть -> пустым не выглядит
    expect(warn).not.toHaveBeenCalled()
  })

  it('служебное сообщение ПОПАДАЕТ в журнал — осознанно: оно тоже рисуется пустым', () => {
    // MessageBubble.jsx не имеет ветки для служебных сообщений: нет текста и нет вложения
    // → пузырь пустой. Значит это та же беда, а не ложная тревога.
    // ⚠️ Берём ИМЕННО messageChatAddMembers, а не messagePinMessage: про второй уже писал
    // тест выше по файлу («сервисное messagePinMessage — mediaType=null»), и свёртка
    // «один раз на вид» честно промолчала бы. Это, кстати, живое доказательство, что
    // свёртка работает на весь запуск программы, а не на одно сообщение.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mapMessage(tdMsgBase({ '@type': 'messageChatAddMembers', member_user_ids: [7] }), 'chat1')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('messageChatAddMembers')
  })

  it('сбой записи в журнал не роняет разбор сообщения', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => { throw new Error('журнал недоступен') })
    expect(() => noteEmptyMessage('messageLogBroken')).not.toThrow()
  })
})
