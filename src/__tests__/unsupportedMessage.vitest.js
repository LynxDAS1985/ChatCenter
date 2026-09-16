// v1.2.465: ЖАЛОБА 2026-09-15 «пишет [медиа], а не показывает, что там».
//
// Первый шаг был в v1.2.461: программа стала ЗАПИСЫВАТЬ вид пустого сообщения в журнал
// (раньше молчала, и такие случаи находились случайно по скриншотам).
// Запись сработала — журнал 2026-09-16 08:30:51 назвал вид: `messageUnsupported`.
//
// 🥇 ФАКТ УРОВНЯ 1 (официальная документация TDLib, класс messageUnsupported):
//    «A message content that is not supported in the current TDLib version.»
//    Содержимое показать НЕВОЗМОЖНО — библиотека его не понимает. Значит честная подпись
//    правильнее, чем «[медиа]» (обещает вложение, которого нет) или пустой пузырь.
//
// Проверки идут через НАСТОЯЩИЙ mapMessage — тот самый разбор, результат которого попадает
// и в переписку, и в уведомление, и в список чатов.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mapMessage } from '../../main/native/backends/tdlibMapper.js'
import { emptyMessageFallbackText } from '../../main/native/backends/tdlibMapperMedia.js'

afterEach(() => { vi.restoreAllMocks() })

function tdMsg(content) {
  return {
    '@type': 'message', id: 1,
    sender_id: { '@type': 'messageSenderUser', user_id: 1 },
    is_outgoing: false, date: 1715000000, media_album_id: '0', content,
  }
}

describe('emptyMessageFallbackText — подпись только для известных «нечего показывать»', () => {
  it('🔴 ГЛАВНОЕ: messageUnsupported получает честную подпись', () => {
    const t = emptyMessageFallbackText('messageUnsupported')
    expect(t).toBeTruthy()
    expect(t).toMatch(/не поддерживается/i)
  })

  it('🔴 ЛОВУШКА: незнакомый вид подписи НЕ получает (не выдумываем за пользователя)', () => {
    expect(emptyMessageFallbackText('messageSomethingBrandNew')).toBe('')
    expect(emptyMessageFallbackText('')).toBe('')
    expect(emptyMessageFallbackText(undefined)).toBe('')
    expect(emptyMessageFallbackText(null)).toBe('')
  })

  it('🔴 ЛОВУШКА: служебные записи сюда НЕ попали — у них свои подписи в списке чатов', () => {
    for (const cn of ['messageChatAddMembers', 'messageChatJoinByLink', 'messagePinMessage']) {
      expect(emptyMessageFallbackText(cn), cn + ' не должен иметь подписи здесь').toBe('')
    }
  })
})

describe('mapMessage — сообщение, которое библиотека не понимает (v1.2.465)', () => {
  it('🔴 ГЛАВНОЕ: вместо пустоты приходит читаемая подпись', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = mapMessage(tdMsg({ '@type': 'messageUnsupported' }))
    expect(r.text).toMatch(/не поддерживается/i)
    expect(r.mediaType).toBeFalsy()
  })

  it('подпись НЕ считается «эмодзи-сообщением» (не рисуется гигантским шрифтом)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = mapMessage(tdMsg({ '@type': 'messageUnsupported' }))
    expect(r.isLargeEmoji).toBeFalsy()
  })

  it('🔴 ЛОВУШКА: обычный текст НЕ подменяется', () => {
    const r = mapMessage(tdMsg({
      '@type': 'messageText', text: { '@type': 'formattedText', text: 'привет', entities: [] },
    }))
    expect(r.text).toBe('привет')
  })

  it('🔴 ЛОВУШКА: сообщение с вложением без подписи остаётся БЕЗ текста', () => {
    const r = mapMessage(tdMsg({
      '@type': 'messagePhoto',
      photo: { sizes: [{ type: 'x', width: 100, height: 100, photo: { id: 5 } }] },
      caption: { '@type': 'formattedText', text: '', entities: [] },
    }))
    expect(r.text).toBe('')
    expect(r.mediaType).toBe('photo')
  })

  it('🔴 ЛОВУШКА: незнакомый пустой вид по-прежнему остаётся пустым (подписи нет)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = mapMessage(tdMsg({ '@type': 'messageSomethingBrandNew' }))
    expect(r.text).toBe('')
  })

  it('запись в журнал про пустое сообщение осталась на месте', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mapMessage(tdMsg({ '@type': 'messageUnsupportedOnceOnly' }))
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0][0])).toContain('[tdlib-empty]')
  })
})

describe('проводка: подпись подставляется в РАЗБОРЕ, а не в трёх местах показа', () => {
  const fs = require('node:fs')

  it('разбор зовёт подпись после записи в журнал', () => {
    const code = fs.readFileSync('main/native/backends/tdlibMapper.js', 'utf8')
    expect(code).toContain('emptyMessageFallbackText')
    expect(code.indexOf("noteEmptyMessage(content['@type'])"))
      .toBeLessThan(code.indexOf("text = emptyMessageFallbackText(content['@type'])"))
  })

  it('🔴 ЛОВУШКА: копии подписи не расползлись по местам показа', () => {
    for (const f of ['src/native/store/nativeStoreIpc.js', 'main/native/backends/tdlibPreview.js']) {
      if (!fs.existsSync(f)) continue
      expect(fs.readFileSync(f, 'utf8'), f + ' не должен содержать своей копии подписи')
        .not.toMatch(/не поддерживается этой версией/)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// v1.2.466 — ЛОВУШКИ ПО НАХОДКАМ ПРИДИРЧИВОГО РЕВЬЮ v1.2.465.
// Обе находки были РЕАЛЬНЫМИ (воспроизведены запуском), обе чинятся здесь.
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 ЛОВУШКА: список чатов и переписка говорят ОДНО И ТО ЖЕ (v1.2.466)', () => {
  it('одно сообщение — одинаковый текст в списке чатов и в разборе', async () => {
    const { messagePreview } = await import('../../main/native/backends/tdlibMapper.js')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const msg = tdMsg({ '@type': 'messageUnsupported' })
    // Раньше список чатов отдавал «⚙️ служебное сообщение» — своя заглушка, мимо словаря.
    expect(messagePreview(msg)).toBe(mapMessage(msg).text)
    expect(messagePreview(msg)).toMatch(/не поддерживается/i)
  })

  it('знакомые виды в списке чатов НЕ сломаны общим словарём', async () => {
    const { messagePreview } = await import('../../main/native/backends/tdlibMapper.js')
    expect(messagePreview({ content: { '@type': 'messagePhoto' } })).toBe('🖼 Фото')
    expect(messagePreview({ content: { '@type': 'messagePinMessage' } })).toBe('📌 закреплено сообщение')
    expect(messagePreview({ content: { '@type': 'messageText', text: { text: 'привет' } } })).toBe('привет')
  })

  it('🔴 ЛОВУШКА ПОРЯДКА: словарь спрашивается ПОСЛЕ знакомых видов, а не до', () => {
    // Сегодня словарь пуст на знакомые виды, поэтому перестановка вверх ничего бы не сломала —
    // прогон «наоборот» это показал. Но как только в словарь попадёт вид, который есть и выше
    // (например стикер), порядок станет решающим: словарь перекрыл бы реальный текст сообщения.
    // Поэтому закрепляем именно ПОРЯДОК в коде, а не только поведение.
    const fs = require('node:fs')
    const code = fs.readFileSync('main/native/backends/tdlibMapper.js', 'utf8')
    const fn = code.slice(code.indexOf('export function messagePreview'))
    const posText = fn.indexOf('content.text || content.caption')
    const posPhoto = fn.indexOf("'🖼 Фото'")
    const posDict = fn.indexOf('emptyMessageFallbackText(cn)')
    expect(posDict, 'словарь должен спрашиваться ПОСЛЕ реального текста').toBeGreaterThan(posText)
    expect(posDict, 'словарь должен спрашиваться ПОСЛЕ знакомых видов').toBeGreaterThan(posPhoto)
  })

  it('незнакомый вид в списке чатов по-прежнему «служебное сообщение»', async () => {
    const { messagePreview } = await import('../../main/native/backends/tdlibMapper.js')
    expect(messagePreview({ content: { '@type': 'messageBrandNew' } })).toBe('⚙️ служебное сообщение')
    expect(messagePreview(null)).toBe('')
  })
})

describe('🔴 ЛОВУШКА: подпись ВСЕГДА текст, даже на особых именах (v1.2.466)', () => {
  it('constructor / toString / valueOf / __proto__ дают пустую строку, а НЕ функцию', () => {
    // Раньше обычный объект отдавал свои встроенные функции: typeof был 'function'.
    for (const k of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      const v = emptyMessageFallbackText(k)
      expect(typeof v, k + ' должен вернуть строку').toBe('string')
      expect(v).toBe('')
    }
  })

  it('и до разбора сообщения дыра тоже не доходит', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = mapMessage(tdMsg({ '@type': 'constructor' }))
    expect(typeof r.text).toBe('string')
    expect(r.text).toBe('')
  })
})

describe('🔴 ЛОВУШКА: новая дверь окна повтора не молчит при отказе (v1.2.466)', () => {
  const fs = require('node:fs')

  it('обе ветки отказа пишут причину в журнал', () => {
    const html = fs.readFileSync('index.html', 'utf8')
    const block = html.slice(html.indexOf('function onLoadError'), html.indexOf('var api = {'))
    expect(block).toContain('НЕ про загрузку')
    expect(block).toContain('НЕГДЕ')
    expect((block.match(/say\(/g) || []).length, 'обе ветки отказа должны писать в журнал').toBe(2)
  })
})
