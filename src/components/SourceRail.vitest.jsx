// v1.2.244 — тесты костяка бокового рейла (Этап 1).
// Проверяют: разделение источников (нативные сверху / веб ниже), переключение по клику,
// активную подсветку, кнопку «+», граничный случай пустого списка.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import SourceRail from './SourceRail.jsx'

afterEach(() => cleanup())

const NATIVE_CC_ID = 'native_cc'
const messengers = [
  { id: NATIVE_CC_ID, name: 'ЦентрЧатов', emoji: '💬', color: '#2AABEE', isNative: true },
  { id: 'vk', name: 'ВКонтакте', emoji: '🅥', color: '#0077FF' },
  { id: 'whatsapp', name: 'WhatsApp', emoji: '🟢', color: '#25D366' },
]

describe('SourceRail', () => {
  it('рисует все источники как кнопки со значком', () => {
    const { getByTitle } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}} nativeCcId={NATIVE_CC_ID} />
    )
    expect(getByTitle('ЦентрЧатов')).toBeTruthy()
    expect(getByTitle('ВКонтакте')).toBeTruthy()
    expect(getByTitle('WhatsApp')).toBeTruthy()
  })

  it('нативный источник идёт РАНЬШЕ веба (API сверху, веб ниже)', () => {
    const { getByTestId } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}} nativeCcId={NATIVE_CC_ID} />
    )
    const rail = getByTestId('source-rail')
    const ids = Array.from(rail.querySelectorAll('[data-id]')).map(el => el.getAttribute('data-id'))
    expect(ids.indexOf('native_cc')).toBeLessThan(ids.indexOf('vk'))
    expect(ids.indexOf('native_cc')).toBeLessThan(ids.indexOf('whatsapp'))
  })

  it('клик по значку зовёт onSelect с его id', () => {
    const onSelect = vi.fn()
    const { getByTitle } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={onSelect} onAdd={() => {}} nativeCcId={NATIVE_CC_ID} />
    )
    fireEvent.click(getByTitle('ВКонтакте'))
    expect(onSelect).toHaveBeenCalledWith('vk')
  })

  it('активный источник помечен aria-current', () => {
    const { getByTitle } = render(
      <SourceRail messengers={messengers} activeId="vk" onSelect={() => {}} onAdd={() => {}} nativeCcId={NATIVE_CC_ID} />
    )
    expect(getByTitle('ВКонтакте').getAttribute('aria-current')).toBe('true')
    expect(getByTitle('WhatsApp').getAttribute('aria-current')).toBe(null)
  })

  it('кнопка «+» зовёт onAdd', () => {
    const onAdd = vi.fn()
    const { getByTestId } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={onAdd} nativeCcId={NATIVE_CC_ID} />
    )
    fireEvent.click(getByTestId('source-rail-add'))
    expect(onAdd).toHaveBeenCalled()
  })

  it('пустой список: рисуется только «+», onSelect не зовётся сам', () => {
    const onSelect = vi.fn()
    const { getByTestId, queryAllByRole } = render(
      <SourceRail messengers={[]} activeId={null} onSelect={onSelect} onAdd={() => {}} nativeCcId={NATIVE_CC_ID} />
    )
    expect(getByTestId('source-rail-add')).toBeTruthy()
    // только одна кнопка (сам «+»), значков-источников нет
    expect(queryAllByRole('button').length).toBe(1)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
