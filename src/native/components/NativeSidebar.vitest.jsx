// v1.2.258 — render-смоук боковой полосы (вынесена из NativeApp). Ловит поломку выноса:
// если проп забыт/неверен — компонент упадёт при рендере с реальными данными.
// v1.2.264 — две «+» (аккаунт/веб) заменены ОДНОЙ кнопкой «＋ Добавить» (открывает окно
// «протокол → мессенджер»). Клик сперва зовёт onActivateNative (вернуть API-инбокс), затем onOpenAddSource.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import NativeSidebar from './NativeSidebar.jsx'
// v1.2.494: метка «нет сети» — она зависит от «пульса интернета» (главный процесс сам щупает сеть,
// main/handlers/netPulseHandlers.js). applyPulse — та же дверь, через которую в окно приходит вердикт.
import { applyPulse } from '../../hooks/useOpenPageWatch.js'

afterEach(() => { cleanup(); delete window.__ccNetPulse; delete window.__ccNetOnline })

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

  // ── v1.2.494: метка «нет сети» (поведение, а не текст в файле) ──
  const railProps = {
    railWidth: 64, railScale: 1, isRailResizing: false, store, orderedAccounts: [], modes,
    webSources: [{ id: 'vk', name: 'ВКонтакте', emoji: '🅥', color: '#0077FF' }],
    onOpenAddSource: () => {}, onSelectSource: () => {},
  }

  it('[!] интернет есть (или ещё не проверяли) — метки «нет сети» НЕТ', () => {
    const { queryByText, container } = render(<NativeSidebar {...railProps} />)
    expect(queryByText('нет сети')).toBeNull()
    window.__ccNetPulse = { online: true, checkedAt: Date.now() }
    cleanup()
    expect(render(<NativeSidebar {...railProps} />).queryByText('нет сети')).toBeNull()
    expect(container).toBeTruthy()
  })

  it('[!] интернет пропал → метка появляется прямо на полосе, без перерисовки всего окна', () => {
    window.__ccNetPulse = { online: true, checkedAt: Date.now() }
    window.__ccNetOnline = true
    const { queryByText } = render(<NativeSidebar {...railProps} />)
    expect(queryByText('нет сети')).toBeNull()
    // Пульс сообщил «интернета нет» — переход true → false (обратный порядок не берём: возврат сети
    // запускает 30-секундный подсчёт сводки, и в тесте остался бы висящий таймер).
    act(() => { applyPulse({ online: false, checkedAt: Date.now() }) })
    expect(queryByText('нет сети')).toBeTruthy()
  })
})
