// v1.2.477 — карточка ВК без собственной пометки вложения («Фотография», «Сообщение» у ответа).
//
// Жалоба 2026-09-18 + три реальных случая из журнала той же сессии:
//   11:10:13 «Вот пишу тебе сообщение 😇🫶 Сообщение»  (ответ на сообщение)
//   11:11:07 «Фотография»                               (фото без подписи)
//   11:12:45 «Так пойдёт? Фотография»                   (фото с подписью)
//
// Половина проверок здесь — ЛОВУШКИ на грабли v1.2.115, когда чистка «по словам»
// откусила хвост живой фразы («буду через 5 минут» → «буду через»).
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { stripVkAttachLabel, VK_PHOTO_ONLY_TEXT } from '../../shared/vkPreviewText.js'

const HANDLE_SRC = fs.readFileSync('src/utils/webviewHandleNewMessage.js', 'utf8')

describe('ВК: снятие пометки вложения — реальные случаи из журнала', () => {
  it('ответ на сообщение: хвост «Сообщение» уходит, текст цел', () => {
    const r = stripVkAttachLabel('Вот пишу тебе сообщение 😇🫶 Сообщение')
    expect(r.text).toBe('Вот пишу тебе сообщение 😇🫶')
    expect(r.label).toBe('Сообщение')
    expect(r.photo).toBe(false)
  })

  it('фото с подписью: остаётся подпись со значком фото', () => {
    const r = stripVkAttachLabel('Так пойдёт? Фотография')
    expect(r.text).toBe('📷 Так пойдёт?')
    expect(r.photo).toBe(true)
  })

  it('фото без подписи: карточка НЕ пустеет — короткое «📷 Фото»', () => {
    const r = stripVkAttachLabel('Фотография')
    expect(r.text).toBe(VK_PHOTO_ONLY_TEXT)
    expect(r.text.length).toBeGreaterThan(0)
  })

  it('несколько фото: счётная форма тоже снимается', () => {
    expect(stripVkAttachLabel('Так пойдёт? 3 фотографии').text).toBe('📷 Так пойдёт?')
  })

  it('длинная пометка снимается ЦЕЛИКОМ, а не половиной', () => {
    // Иначе от «Голосовое сообщение» осталось бы висеть «Голосовое».
    expect(stripVkAttachLabel('Послушай Голосовое сообщение').text).toBe('Послушай')
  })
})

describe('🔴 ЛОВУШКИ: живой текст не должен пострадать', () => {
  it('другая форма слова не задевается', () => {
    expect(stripVkAttachLabel('Пришли мне фотографию').text).toBe('Пришли мне фотографию')
  })

  it('то же слово с маленькой буквы — это речь, а не пометка ВК', () => {
    // ВК пишет пометку с большой буквы; сверка с учётом регистра и есть защита.
    expect(stripVkAttachLabel('удали это сообщение').text).toBe('удали это сообщение')
    expect(stripVkAttachLabel('удали это сообщение').label).toBe('')
  })

  it('пометка НЕ в конце строки не снимается', () => {
    expect(stripVkAttachLabel('Фотография в альбоме есть').text).toBe('Фотография в альбоме есть')
  })

  it('слово, которое лишь ЗАКАНЧИВАЕТСЯ пометкой, не режется', () => {
    // Здесь «Сообщение» — часть слова, а не отдельное слово.
    expect(stripVkAttachLabel('СуперСообщение').text).toBe('СуперСообщение')
  })

  it('от одной пометки без текста ничего не пропадает', () => {
    expect(stripVkAttachLabel('Сообщение').text).toBe('Сообщение')
    expect(stripVkAttachLabel('Файл').text).toBe('Файл')
  })

  it('пустой вход и мусор не роняют', () => {
    expect(stripVkAttachLabel('').text).toBe('')
    expect(stripVkAttachLabel(null).text).toBe('')
    expect(stripVkAttachLabel(undefined).text).toBe('')
    expect(stripVkAttachLabel(12).text).toBe('12')
  })

  it('результат никогда не пустой, если вход был не пустой', () => {
    for (const s of ['Фотография', 'Сообщение', 'Голосовое сообщение', '3 фотографии', 'Файл']) {
      expect(stripVkAttachLabel(s).text.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('🔴 ЛОВУШКИ проводки', () => {
  it('чистка стоит в общем обработчике и ТОЛЬКО для списка чатов ВК', () => {
    expect(HANDLE_SRC).toContain('stripVkAttachLabel')
    expect(HANDLE_SRC).toContain("extra?.notifSource === 'vk-list'")
  })

  it('чистка идёт ДО дедупа — иначе пометка уедет в превью и историю', () => {
    const iClean = HANDLE_SRC.indexOf('stripVkAttachLabel(text)')
    const iDedup = HANDLE_SRC.indexOf('buildMessageDedupScope(')
    expect(iClean).toBeGreaterThan(0)
    expect(iClean).toBeLessThan(iDedup)
  })

  it('снятая пометка пишется в журнал — молчать про правку текста нельзя', () => {
    expect(HANDLE_SRC).toContain('снята пометка вложения')
  })
})
