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

  it('#1 цифра бейджа = как на вкладке: режим «только личные» → показывает личные', () => {
    const { getByTestId } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}}
        nativeCcId={NATIVE_CC_ID} overlayMode="personal"
        unreadCounts={{ vk: 10 }} unreadSplit={{ vk: { personal: 3, channels: 7 } }} />
    )
    expect(getByTestId('rail-unread-vk').textContent).toBe('3') // личные, не всего
  })

  it('#1 без режима «личные» → показывает всего', () => {
    const { getByTestId } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}}
        nativeCcId={NATIVE_CC_ID}
        unreadCounts={{ vk: 10 }} unreadSplit={{ vk: { personal: 3, channels: 7 } }} />
    )
    expect(getByTestId('rail-unread-vk').textContent).toBe('10')
  })

  it('#2 клавиатура: Enter на значке переключает источник (значок доступен с клавиатуры)', () => {
    const onSelect = vi.fn()
    const { getByTitle } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={onSelect} onAdd={() => {}} nativeCcId={NATIVE_CC_ID} />
    )
    fireEvent.keyDown(getByTitle('ВКонтакте'), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('vk')
  })

  // ── Этап 2B: правый клик + перетаскивание ──
  it('#2B правый клик по значку зовёт onContextMenu с id и координатами курсора', () => {
    const onContextMenu = vi.fn()
    const { getByTitle } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}}
        nativeCcId={NATIVE_CC_ID} onContextMenu={onContextMenu} />
    )
    fireEvent.contextMenu(getByTitle('ВКонтакте'), { clientX: 120, clientY: 240 })
    expect(onContextMenu).toHaveBeenCalledWith('vk', 120, 240)
  })

  it('#2B перетаскивание значка вызывает обработчики drag с его id', () => {
    const onDragStart = vi.fn()
    const onDragOver = vi.fn()
    const onDrop = vi.fn()
    const { getByTitle } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}}
        nativeCcId={NATIVE_CC_ID} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} />
    )
    const vk = getByTitle('ВКонтакте')
    fireEvent.dragStart(vk)
    fireEvent.dragOver(vk)
    fireEvent.drop(vk)
    expect(onDragStart).toHaveBeenCalledWith('vk')
    expect(onDragOver).toHaveBeenCalledWith('vk')
    expect(onDrop).toHaveBeenCalledWith('vk')
  })

  it('#2 перетаскивание между секциями игнорируется (веб → API не срабатывает)', () => {
    const onDrop = vi.fn()
    const { getByTitle } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}}
        nativeCcId={NATIVE_CC_ID} onDragStart={() => {}} onDragOver={() => {}} onDrop={onDrop} />
    )
    fireEvent.dragStart(getByTitle('ВКонтакте'))   // тащим веб-значок
    fireEvent.drop(getByTitle('ЦентрЧатов'))        // бросаем на API → должно игнорироваться
    expect(onDrop).not.toHaveBeenCalled()
    fireEvent.drop(getByTitle('WhatsApp'))          // бросаем на веб → разрешено
    expect(onDrop).toHaveBeenCalledWith('whatsapp')
  })

  // ── Этап 2C: отдельные аккаунты (аватары) ──
  const accounts = [
    { id: 'tg_1', name: 'Иван', avatar: '', color: '#2AABEE', unread: 3 },
    { id: 'tg_2', name: 'Мария', avatar: 'cc-media://ava', color: '#0077FF', unread: 0 },
  ]

  it('#2C аккаунты рисуются значками (по имени)', () => {
    const { getByTitle } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}}
        nativeCcId={NATIVE_CC_ID} accounts={accounts} />
    )
    expect(getByTitle('Иван')).toBeTruthy()
    expect(getByTitle('Мария')).toBeTruthy()
  })

  it('#2C клик по аккаунту зовёт onSelectAccount с его id', () => {
    const onSelectAccount = vi.fn()
    const { getByTitle } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}}
        nativeCcId={NATIVE_CC_ID} accounts={accounts} onSelectAccount={onSelectAccount} />
    )
    fireEvent.click(getByTitle('Иван'))
    expect(onSelectAccount).toHaveBeenCalledWith('tg_1')
  })

  it('#2C активный аккаунт помечен aria-current + бейдж непрочитанных', () => {
    const { getByTitle } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}}
        nativeCcId={NATIVE_CC_ID} accounts={accounts} activeAccountId="tg_2" />
    )
    expect(getByTitle('Мария').getAttribute('aria-current')).toBe('true')
    expect(getByTitle('Иван').getAttribute('aria-current')).toBe(null)
    expect(getByTitle('Иван').textContent).toContain('3') // бейдж непрочитанных
  })

  it('#2C без аккаунтов значки аккаунтов не рисуются', () => {
    const { queryByTitle } = render(
      <SourceRail messengers={messengers} activeId={NATIVE_CC_ID} onSelect={() => {}} onAdd={() => {}} nativeCcId={NATIVE_CC_ID} />
    )
    expect(queryByTitle('Иван')).toBe(null)
  })

  it('не падает без объектов индикаторов (undefined)', () => {
    // newMessageIds/unreadCounts и т.п. не переданы — гварды внутри должны сработать
    expect(() => render(
      <SourceRail messengers={messengers} activeId="vk" onSelect={() => {}} onAdd={() => {}} nativeCcId={NATIVE_CC_ID} />
    )).not.toThrow()
  })
})
