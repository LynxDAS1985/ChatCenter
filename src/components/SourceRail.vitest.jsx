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

  // ── Этап 2A: индикаторы на значках ──
  it('бейдж непрочитанных: показывает число, когда есть непрочитанные', () => {
    const { getByTestId, queryByTestId } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}}
        nativeCcId={NATIVE_CC_ID} unreadCounts={{ vk: 5 }} />
    )
    expect(getByTestId('rail-unread-vk').textContent).toBe('5')
    expect(queryByTestId('rail-unread-whatsapp')).toBe(null) // без непрочитанных — нет бейджа
  })

  it('бейдж непрочитанных: >99 показывает «99+»', () => {
    const { getByTestId } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}}
        nativeCcId={NATIVE_CC_ID} unreadCounts={{ vk: 150 }} />
    )
    expect(getByTestId('rail-unread-vk').textContent).toBe('99+')
  })

  it('точка связи: клик по (увеличенной) обёртке зовёт onOpenConnections и НЕ переключает источник', () => {
    const onOpenConnections = vi.fn()
    const onSelect = vi.fn()
    const { getByTestId } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={onSelect} onAdd={() => {}}
        nativeCcId={NATIVE_CC_ID} onOpenConnections={onOpenConnections} />
    )
    fireEvent.click(getByTestId('rail-dot-vk')) // клик по всей области-обёртке (20px)
    expect(onOpenConnections).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled() // stopPropagation: источник не переключился
  })

  it('подсказка значка включает имя аккаунта, если оно есть', () => {
    const { getByTestId } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}}
        nativeCcId={NATIVE_CC_ID} accountInfo={{ vk: 'Иван Петров' }} />
    )
    // кнопка значка ВК (data-id="vk") — её title
    const rail = getByTestId('source-rail')
    const vkBtn = rail.querySelector('[data-id="vk"]')
    expect(vkBtn.getAttribute('title')).toContain('Иван Петров')
  })

  it('не падает без объектов индикаторов (undefined)', () => {
    // newMessageIds/unreadCounts и т.п. не переданы — гварды внутри должны сработать
    expect(() => render(
      <SourceRail messengers={messengers} activeId="vk" onSelect={() => {}} onAdd={() => {}} nativeCcId={NATIVE_CC_ID} />
    )).not.toThrow()
  })
})
