// v0.95.42: тесты для splitWithHighlights util.

import { describe, it, expect } from 'vitest'
import { splitWithHighlights } from './searchHighlight.js'

describe('splitWithHighlights (v0.95.42)', () => {
  it('пустой query → весь текст без подсветки', () => {
    expect(splitWithHighlights('Страховая Компания', '')).toEqual([
      { text: 'Страховая Компания', match: false },
    ])
  })

  it('пустой текст → один пустой фрагмент', () => {
    expect(splitWithHighlights('', 'страх')).toEqual([{ text: '', match: false }])
  })

  it('совпадение в начале', () => {
    const r = splitWithHighlights('Страховая Компания', 'страх')
    expect(r).toEqual([
      { text: 'Страх', match: true },
      { text: 'овая Компания', match: false },
    ])
  })

  it('совпадение в середине', () => {
    const r = splitWithHighlights('Главная Страховая Компания', 'страх')
    expect(r[0]).toEqual({ text: 'Главная ', match: false })
    expect(r[1]).toEqual({ text: 'Страх', match: true })
    expect(r[2]).toEqual({ text: 'овая Компания', match: false })
  })

  it('case-insensitive — Страх найдёт страх/СТРАХ/Страх', () => {
    expect(splitWithHighlights('страх', 'Страх')[0]).toEqual({ text: 'страх', match: true })
    expect(splitWithHighlights('СТРАХ', 'страх')[0]).toEqual({ text: 'СТРАХ', match: true })
  })

  it('несколько совпадений в одной строке', () => {
    const r = splitWithHighlights('aa bb aa', 'aa')
    expect(r.filter(p => p.match).map(p => p.text)).toEqual(['aa', 'aa'])
    expect(r.filter(p => !p.match).map(p => p.text).join('')).toBe(' bb ')
  })

  it('regex specials в query безопасны (.* не трактуется как pattern)', () => {
    const r = splitWithHighlights('a.b.c', '.')
    expect(r.filter(p => p.match).map(p => p.text)).toEqual(['.', '.'])
  })

  it('пробелы и тире в query', () => {
    const r = splitWithHighlights('Главная Страховая', 'Главная С')
    expect(r[0]).toEqual({ text: 'Главная С', match: true })
  })

  it('нет совпадения → один фрагмент без match', () => {
    expect(splitWithHighlights('Привет', 'банан')).toEqual([
      { text: 'Привет', match: false },
    ])
  })

  it('null/undefined → не падает', () => {
    expect(() => splitWithHighlights(null, 'a')).not.toThrow()
    expect(() => splitWithHighlights('a', null)).not.toThrow()
    expect(() => splitWithHighlights(null, null)).not.toThrow()
  })

  it('query только пробелы → trim → нет подсветки', () => {
    expect(splitWithHighlights('Страх', '   ')).toEqual([
      { text: 'Страх', match: false },
    ])
  })
})
