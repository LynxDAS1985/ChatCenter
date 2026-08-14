// v1.2.258 — render-смоук боковой полосы (вынесена из NativeApp). Ловит поломку выноса:
// если проп забыт/неверен — компонент упадёт при рендере с реальными данными.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import NativeSidebar from './NativeSidebar.jsx'

afterEach(() => cleanup())

const store = {
  accounts: [], hiddenAccountIds: [], soloAccountId: null, mode: 'chats', accountColors: {},
  showAllAccounts: () => {}, setMode: () => {}, toggleAccountVisible: () => {}, soloAccount: () => {},
}
const modes = [{ id: 'chats', label: 'Чаты', icon: '💬' }]

describe('NativeSidebar', () => {
  it('рисуется без падения + «+» добавить веб + веб-значок', () => {
    const { getByTestId, getByTitle } = render(
      <NativeSidebar
        railWidth={64} railScale={1} isRailResizing={false} store={store}
        orderedAccounts={[]} modes={modes}
        webSources={[{ id: 'vk', name: 'ВКонтакте', emoji: '🅥', color: '#0077FF' }]}
        webUnread={{ vk: 3 }} activeMessengerId="vk"
        onAddWeb={() => {}} onSelectSource={() => {}}
      />
    )
    expect(getByTestId('native-rail-add-web')).toBeTruthy()
    expect(getByTitle('ВКонтакте')).toBeTruthy()
  })

  it('#1/#2: два «+» РАЗЛИЧНЫ — аккаунт (вход) и веб (разные подписи/testid/title)', () => {
    const onAddWeb = () => {}
    const { getByTestId } = render(
      <NativeSidebar railWidth={64} railScale={1} isRailResizing={false} store={store}
        orderedAccounts={[]} modes={modes} onAddWeb={onAddWeb} />
    )
    const addAccount = getByTestId('native-rail-add-account')
    const addWeb = getByTestId('native-rail-add-web')
    expect(addAccount).not.toBe(addWeb)
    expect(addAccount.getAttribute('title')).toContain('аккаунт')     // вход Telegram
    expect(addWeb.getAttribute('title')).toContain('веб')             // добавить веб
    expect(addAccount.textContent).toContain('аккаунт')               // видимая подпись
    expect(addWeb.textContent).toContain('веб')
  })

  it('без веб-мессенджеров всё равно рисует «+» добавить веб', () => {
    const { getByTestId } = render(
      <NativeSidebar railWidth={64} railScale={1} isRailResizing={false} store={store}
        orderedAccounts={[]} modes={modes} onAddWeb={() => {}} />
    )
    expect(getByTestId('native-rail-add-web')).toBeTruthy()
  })
})
