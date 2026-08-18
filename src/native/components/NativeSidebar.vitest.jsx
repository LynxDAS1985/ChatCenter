// v1.2.258 — render-смоук боковой полосы (вынесена из NativeApp). Ловит поломку выноса:
// если проп забыт/неверен — компонент упадёт при рендере с реальными данными.
// v1.2.264 — две «+» (аккаунт/веб) заменены ОДНОЙ кнопкой «＋ Добавить» (открывает окно
// «протокол → мессенджер»). Клик сперва зовёт onActivateNative (вернуть API-инбокс), затем onOpenAddSource.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import NativeSidebar from './NativeSidebar.jsx'

afterEach(() => cleanup())

const store = {
  accounts: [], hiddenAccountIds: [], soloAccountId: null, mode: 'chats', accountColors: {},
  showAllAccounts: () => {}, setMode: () => {}, toggleAccountVisible: () => {}, soloAccount: () => {},
}
const modes = [{ id: 'chats', label: 'Чаты', icon: '💬' }]

describe('NativeSidebar', () => {
  it('рисуется без падения + одна кнопка «Добавить» + веб-значок', () => {
    const { getByTestId, getByTitle } = render(
      <NativeSidebar
        railWidth={64} railScale={1} isRailResizing={false} store={store}
        orderedAccounts={[]} modes={modes}
        webSources={[{ id: 'vk', name: 'ВКонтакте', emoji: '🅥', color: '#0077FF' }]}
        webUnread={{ vk: 3 }} activeMessengerId="vk"
        onOpenAddSource={() => {}} onSelectSource={() => {}}
      />
    )
    const add = getByTestId('native-rail-add')
    expect(add).toBeTruthy()
    expect(add.textContent).toContain('Добавить')
    expect(getByTitle('ВКонтакте')).toBeTruthy()
  })

  it('клик по «Добавить» → сперва возврат к API (onActivateNative), затем открыть окно (onOpenAddSource)', () => {
    const onActivateNative = vi.fn()
    const onOpenAddSource = vi.fn()
    const { getByTestId } = render(
      <NativeSidebar railWidth={64} railScale={1} isRailResizing={false} store={store}
        orderedAccounts={[]} modes={modes}
        onActivateNative={onActivateNative} onOpenAddSource={onOpenAddSource} />
    )
    fireEvent.click(getByTestId('native-rail-add'))
    expect(onActivateNative).toHaveBeenCalledTimes(1)
    expect(onOpenAddSource).toHaveBeenCalledTimes(1)
  })

  it('без веб-мессенджеров всё равно рисует единственную кнопку «Добавить»', () => {
    const { getByTestId } = render(
      <NativeSidebar railWidth={64} railScale={1} isRailResizing={false} store={store}
        orderedAccounts={[]} modes={modes} onOpenAddSource={() => {}} />
    )
    expect(getByTestId('native-rail-add')).toBeTruthy()
  })
})
