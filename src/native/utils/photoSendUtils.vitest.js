// v1.2.207: тесты помощников окна отправки фото.
import { describe, it, expect } from 'vitest'
import { formatBytes, totalBytes, arrayMove, overallUploadPercent, CAPTION_MAX, TEXT_MAX, splitTextForTelegram } from './photoSendUtils.js'

describe('photoSendUtils — CAPTION_MAX', () => {
  it('лимит подписи под фото = 1024 (безопасно для всех аккаунтов Telegram)', () => {
    expect(CAPTION_MAX).toBe(1024)
  })
})

describe('photoSendUtils — splitTextForTelegram', () => {
  it('лимит текста = 4096', () => { expect(TEXT_MAX).toBe(4096) })
  it('короткий текст → один кусок', () => {
    expect(splitTextForTelegram('привет', 4096)).toEqual(['привет'])
  })
  it('пустой текст → пустой массив', () => {
    expect(splitTextForTelegram('', 4096)).toEqual([])
    expect(splitTextForTelegram(null, 4096)).toEqual([])
  })
  it('текст ровно на лимите → один кусок', () => {
    expect(splitTextForTelegram('a'.repeat(4096), 4096)).toEqual(['a'.repeat(4096)])
  })
  it('длиннее лимита (без пробелов) → несколько кусков ≤ лимита, ничего не потеряно', () => {
    const parts = splitTextForTelegram('a'.repeat(5000), 4096)
    expect(parts.length).toBe(2)
    expect(parts.every(p => p.length <= 4096)).toBe(true)
    expect(parts.join('')).toBe('a'.repeat(5000))
  })
  it('режет по переносу строки, если он есть в пределах лимита', () => {
    const text = 'a'.repeat(3000) + '\n' + 'b'.repeat(3000)
    const parts = splitTextForTelegram(text, 4096)
    expect(parts.length).toBe(2)
    expect(parts[0]).toBe('a'.repeat(3000))
    expect(parts[1]).toBe('b'.repeat(3000))
  })
})

describe('photoSendUtils — formatBytes', () => {
  it('байты/КБ/МБ', () => {
    expect(formatBytes(2)).toBe('2 Б')
    expect(formatBytes(1024)).toBe('1 КБ')
    expect(formatBytes(348160)).toBe('340 КБ')
    expect(formatBytes(1.7 * 1024 * 1024)).toBe('1.7 МБ')
  })
  it('мусор → пусто', () => {
    expect(formatBytes(NaN)).toBe('')
    expect(formatBytes(-5)).toBe('')
    expect(formatBytes(undefined)).toBe('')
  })
})

describe('photoSendUtils — totalBytes', () => {
  it('сумма размеров', () => {
    expect(totalBytes([{ size: 100 }, { size: 200 }, { size: 0 }])).toBe(300)
    expect(totalBytes([])).toBe(0)
    expect(totalBytes(null)).toBe(0)
    expect(totalBytes([{ }, { size: 50 }])).toBe(50) // без size → 0
  })
})

describe('photoSendUtils — arrayMove', () => {
  it('перестановка вперёд/назад', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(arrayMove(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })
  it('не меняет исходный массив', () => {
    const src = ['a', 'b', 'c']
    const out = arrayMove(src, 0, 2)
    expect(src).toEqual(['a', 'b', 'c'])
    expect(out).not.toBe(src)
  })
  it('одинаковые/некорректные индексы → копия без изменений', () => {
    expect(arrayMove(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(arrayMove(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
    expect(arrayMove(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
  })
})

describe('photoSendUtils — overallUploadPercent', () => {
  it('процент по сумме загруженного/всего', () => {
    expect(overallUploadPercent({ f1: { uploaded: 50, total: 100 } })).toBe(50)
    expect(overallUploadPercent({ f1: { uploaded: 30, total: 100 }, f2: { uploaded: 70, total: 100 } })).toBe(50)
    expect(overallUploadPercent({ f1: { uploaded: 100, total: 100 } })).toBe(100)
  })
  it('нет активных / мусор → null', () => {
    expect(overallUploadPercent({})).toBeNull()
    expect(overallUploadPercent(null)).toBeNull()
    expect(overallUploadPercent({ f1: { uploaded: 0, total: 0 } })).toBeNull()
  })
})
