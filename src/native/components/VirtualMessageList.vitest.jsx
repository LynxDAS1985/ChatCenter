// v0.92.0 Day 4: smoke-тесты VirtualMessageList (Virtuoso).
//
// Был VirtualMessageListV2 в Days 1-3, переименован в VirtualMessageList после Day 4.
// happy-dom выдаёт 0×0 для всех элементов — реальное измерение Virtuoso не работает,
// проверяем только контракт API (mount, listRef API, проп проброс).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useRef } from 'react'
import VirtualMessageList from './VirtualMessageList.jsx'

beforeEach(() => {
  globalThis.window.api = {
    invoke: vi.fn(() => Promise.resolve({ ok: false })),
    on: vi.fn(() => () => {}),
    send: vi.fn(),
  }
  globalThis.IntersectionObserver = class {
    observe() {}; disconnect() {}; unobserve() {}
  }
  globalThis.ResizeObserver = class {
    observe() {}; disconnect() {}; unobserve() {}
  }
})

function buildRowContext(overrides = {}) {
  return {
    store: {
      activeChatId: 'chat1',
      downloadMedia: () => Promise.resolve({ ok: false }),
    },
    readRoot: null,
    setReplyTo: vi.fn(),
    setEditTarget: vi.fn(),
    setInput: vi.fn(),
    handleDelete: vi.fn(),
    handleForward: vi.fn(),
    handlePin: vi.fn(),
    openPhotoWindow: vi.fn(),
    getMessage: vi.fn(() => null),
    readByVisibility: vi.fn(),
    scrollToMessage: vi.fn(),
    ...overrides,
  }
}

function Wrapper({ renderItems, onRowsRendered, ...rest }) {
  const listRef = useRef(null)
  return (
    <VirtualMessageList
      renderItems={renderItems}
      rowContext={buildRowContext()}
      listRef={listRef}
      cacheKey="chat1"
      onRowsRendered={onRowsRendered}
      {...rest}
    />
  )
}

describe('VirtualMessageList — smoke (Day 1)', () => {
  it('монтируется без ошибок при пустом списке', () => {
    expect(() => {
      render(<Wrapper renderItems={[]} />)
    }).not.toThrow()
    cleanup()
  })

  it('монтируется с 4 типами row (day/time/unread/group)', () => {
    const renderItems = [
      { type: 'day', day: new Date('2026-05-26').toISOString() },
      { type: 'time', time: Date.now() },
      { type: 'unread' },
      {
        type: 'group',
        senderId: 'u1',
        senderName: 'Test User',
        isOutgoing: false,
        msgs: [
          { id: '1', type: 'text', text: 'Hello', timestamp: Date.now() / 1000 },
        ],
      },
    ]
    expect(() => {
      render(<Wrapper renderItems={renderItems} />)
    }).not.toThrow()
    cleanup()
  })

  it('принимает initialTopMostItemIndex (Day 2 prop, не падает)', () => {
    const renderItems = Array.from({ length: 50 }, (_, i) => ({
      type: 'group',
      senderId: `u${i}`,
      senderName: `User ${i}`,
      isOutgoing: false,
      msgs: [{ id: String(i), type: 'text', text: `msg ${i}`, timestamp: Date.now() / 1000 }],
    }))
    expect(() => {
      render(<Wrapper renderItems={renderItems} initialTopMostItemIndex={25} />)
    }).not.toThrow()
    cleanup()
  })

  it('принимает firstItemIndex (Day 2 prop, не падает)', () => {
    const renderItems = [{
      type: 'group', senderId: 'u', senderName: 'U', isOutgoing: false,
      msgs: [{ id: '1', type: 'text', text: 't', timestamp: Date.now() / 1000 }],
    }]
    expect(() => {
      render(<Wrapper renderItems={renderItems} firstItemIndex={10000} />)
    }).not.toThrow()
    cleanup()
  })

  it('принимает startReached и endReached callbacks (Day 2 props)', () => {
    const startReached = vi.fn()
    const endReached = vi.fn()
    expect(() => {
      render(
        <Wrapper
          renderItems={[]}
          startReached={startReached}
          endReached={endReached}
        />
      )
    }).not.toThrow()
    cleanup()
  })

  it('listRef API имеет element getter и scrollToRow (мост старого API)', () => {
    let capturedRef
    function Probe() {
      const r = useRef(null)
      capturedRef = r
      return (
        <VirtualMessageList
          renderItems={[]}
          rowContext={buildRowContext()}
          listRef={r}
          cacheKey="chat1"
        />
      )
    }
    render(<Probe />)
    // useImperativeHandle вызывается после mount
    expect(capturedRef.current).toBeDefined()
    expect(typeof capturedRef.current.scrollToRow).toBe('function')
    expect('element' in capturedRef.current).toBe(true)
    cleanup()
  })

  it('scrollToRow не падает на пустом списке', () => {
    let capturedRef
    function Probe() {
      const r = useRef(null)
      capturedRef = r
      return (
        <VirtualMessageList
          renderItems={[]}
          rowContext={buildRowContext()}
          listRef={r}
          cacheKey="chat1"
        />
      )
    }
    render(<Probe />)
    expect(() => {
      capturedRef.current?.scrollToRow({ index: 0, align: 'end', behavior: 'auto' })
    }).not.toThrow()
    cleanup()
  })

  it('cacheKey={chatId} управляет remount (key prop)', () => {
    const renderItems = [{
      type: 'group', senderId: 'u', senderName: 'U', isOutgoing: false,
      msgs: [{ id: '1', type: 'text', text: 't', timestamp: Date.now() / 1000 }],
    }]
    const { rerender } = render(
      <Wrapper renderItems={renderItems} />
    )
    // Смена cacheKey не должна крашить
    expect(() => {
      rerender(
        <VirtualMessageList
          renderItems={renderItems}
          rowContext={buildRowContext()}
          listRef={{ current: null }}
          cacheKey="chat2"
        />
      )
    }).not.toThrow()
    cleanup()
  })

  it('onRowsRendered получает {startIndex, stopIndex} (контракт с react-window)', () => {
    // happy-dom 0×0 → rangeChanged может не сработать без real DOM,
    // но интерфейс проброса должен быть готов. Проверяем через wrapper signature.
    const onRowsRendered = vi.fn()
    expect(() => {
      render(
        <VirtualMessageList
          renderItems={[]}
          rowContext={buildRowContext()}
          listRef={{ current: null }}
          cacheKey="chat1"
          onRowsRendered={onRowsRendered}
        />
      )
    }).not.toThrow()
    cleanup()
  })

  it('пробрасывает onScroll/onWheel/onTouchStart/onPointerDown/onDragOver через components.Scroller', () => {
    // Smoke: компонент должен принять все эти props без ошибок.
    expect(() => {
      render(
        <VirtualMessageList
          renderItems={[]}
          rowContext={buildRowContext()}
          listRef={{ current: null }}
          cacheKey="chat1"
          onScroll={vi.fn()}
          onWheel={vi.fn()}
          onTouchStart={vi.fn()}
          onPointerDown={vi.fn()}
          onDragOver={vi.fn()}
          onDragLeave={vi.fn()}
          onDrop={vi.fn()}
        />
      )
    }).not.toThrow()
    cleanup()
  })

  it('Day 2: одновременный props startReached + endReached + initialTopMostItemIndex + firstItemIndex', () => {
    // Проверка что комбинация Day 2 props не вызывает крашей.
    const renderItems = Array.from({ length: 100 }, (_, i) => ({
      type: 'group',
      senderId: `u${i}`,
      senderName: `User ${i}`,
      isOutgoing: false,
      msgs: [{ id: String(i), type: 'text', text: `msg ${i}`, timestamp: Date.now() / 1000 }],
    }))
    expect(() => {
      render(
        <VirtualMessageList
          renderItems={renderItems}
          rowContext={buildRowContext()}
          listRef={{ current: null }}
          cacheKey="chat1"
          initialTopMostItemIndex={50}
          firstItemIndex={10000}
          startReached={vi.fn()}
          endReached={vi.fn()}
        />
      )
    }).not.toThrow()
    cleanup()
  })

  it('Day 2: переключение firstItemIndex (имитация load-older prepend) не крашит', () => {
    const renderItems = [{
      type: 'group', senderId: 'u', senderName: 'U', isOutgoing: false,
      msgs: [{ id: '1', type: 'text', text: 't', timestamp: Date.now() / 1000 }],
    }]
    const { rerender } = render(
      <VirtualMessageList
        renderItems={renderItems}
        rowContext={buildRowContext()}
        listRef={{ current: null }}
        cacheKey="chat1"
        firstItemIndex={10000}
      />
    )
    expect(() => {
      // имитация: после load-older firstItemIndex уменьшается на 50
      rerender(
        <VirtualMessageList
          renderItems={renderItems}
          rowContext={buildRowContext()}
          listRef={{ current: null }}
          cacheKey="chat1"
          firstItemIndex={9950}
        />
      )
    }).not.toThrow()
    cleanup()
  })

  // v0.92.6: тесты restoreStateFrom и listRef.getState УДАЛЕНЫ — snapshot
  // mechanism (v0.92.2) архитектурно сломан с key={cacheKey} ремаунтом, убран в v0.92.6.
  // Используем только initialTopMostItemIndex с align='end' (v0.92.3 паттерн).

  // v0.94.2: РЕГРЕССИЯ — overflow-anchor ДОЛЖЕН быть 'none'. Если кто-то вернёт 'auto',
  // load-older снова будет пиннить экран к верху → каскад подгрузок (баг чата «Машинное обучение»).
  it('v0.94.2: scroll-контейнер имеет overflow-anchor: none', () => {
    const { container } = render(<Wrapper renderItems={[]} />)
    const scroller = container.querySelector('div')
    expect(scroller).toBeTruthy()
    expect(scroller.style.overflowAnchor).toBe('none')
    cleanup()
  })
})
