// v1.2.232: render-smoke + поведение «Карточки контакта».
// Ловит TDZ/hook-order/битые импорты + проверяет закрытие (Esc/✕) и показ имени/полей.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import ContactCardModal from './ContactCardModal.jsx'

beforeEach(() => {
  globalThis.window.api = {
    invoke: vi.fn((ch) => {
      if (ch === 'tg:get-contact-info') return Promise.resolve({ ok: true, phone: '+7 912 282 2003', username: 'ivan', bio: 'Люблю авто' })
      if (ch === 'clipboard:write-text') return Promise.resolve({ ok: true })
      return Promise.resolve({ ok: true })
    }),
    send: vi.fn(),
    on: vi.fn(() => () => {}),
  }
  try { localStorage.clear() } catch (_) {}
})
afterEach(() => cleanup())

const chat = { id: 'tg_1:42', title: 'Митянин Александр', type: 'user', isOnline: true, avatar: '' }

describe('ContactCardModal', () => {
  it('показывает имя собеседника', () => {
    const { container } = render(<ContactCardModal chat={chat} onClose={() => {}} />)
    expect(container.textContent).toContain('Митянин Александр')
  })

  it('подтягивает и показывает телефон/username из tg:get-contact-info', async () => {
    const { container } = render(<ContactCardModal chat={chat} onClose={() => {}} />)
    await waitFor(() => expect(container.textContent).toContain('+7 912 282 2003'))
    expect(container.textContent).toContain('@ivan')
    expect(container.textContent).toContain('Люблю авто')
  })

  it('Escape вызывает onClose', () => {
    const onClose = vi.fn()
    render(<ContactCardModal chat={chat} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('кнопка ✕ закрывает', () => {
    const onClose = vi.fn()
    const { getByTitle } = render(<ContactCardModal chat={chat} onClose={onClose} />)
    fireEvent.click(getByTitle('Закрыть (Esc)'))
    expect(onClose).toHaveBeenCalled()
  })

  it('клик по копии имени пишет в буфер (clipboard:write-text) и показывает тост', async () => {
    const { getByTitle, container } = render(<ContactCardModal chat={chat} onClose={() => {}} />)
    fireEvent.click(getByTitle('Копировать имя'))
    await waitFor(() => expect(window.api.invoke).toHaveBeenCalledWith('clipboard:write-text', 'Митянин Александр'))
    await waitFor(() => expect(container.textContent).toContain('Скопировано'))
  })

  it('переключатель звука зовёт onMute', () => {
    const onMute = vi.fn()
    const { getAllByTitle } = render(<ContactCardModal chat={chat} onClose={() => {}} onMute={onMute} />)
    // строка «Уведомления чата»
    fireEvent.click(getAllByTitle('Уведомления чата')[0])
    expect(onMute).toHaveBeenCalledWith('tg_1:42', 2147483647)  // заглушить навсегда
  })

  // v1.2.235: «Написать» закрывает окно и ставит курсор в поле ввода чата (id=native-message-composer).
  it('«Написать» закрывает окно и фокусирует поле ввода чата', () => {
    const ta = document.createElement('textarea')
    ta.id = 'native-message-composer'
    document.body.appendChild(ta)
    const origRAF = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (cb) => { cb(); return 0 }
    const onClose = vi.fn()
    const { getByText } = render(<ContactCardModal chat={chat} onClose={onClose} />)
    fireEvent.click(getByText('Написать'))
    expect(onClose).toHaveBeenCalled()
    expect(document.activeElement).toBe(ta)
    globalThis.requestAnimationFrame = origRAF
    document.body.removeChild(ta)
  })

  // v1.2.234: звук переключается ТОЛЬКО нижним тумблером — верхней кнопки «Заглушить» больше нет.
  it('нет дублирующей быстрой кнопки «Заглушить» (звук только нижним тумблером)', () => {
    const { container } = render(<ContactCardModal chat={chat} onClose={() => {}} onMute={() => {}} />)
    expect(container.textContent).not.toContain('Заглушить')
    // регулятор звука ровно один — строка «Уведомления чата»
    expect(container.querySelectorAll('[title="Уведомления чата"]').length).toBe(1)
  })

  it('группа/не-личный чат: без телефона карточка всё равно показывает имя и заметку, БЕЗ ошибки', async () => {
    window.api.invoke = vi.fn((ch) => ch === 'tg:get-contact-info'
      ? Promise.resolve({ ok: false, error: 'not a private chat' })
      : Promise.resolve({ ok: true }))
    const { container } = render(<ContactCardModal chat={{ id: 'tg_1:-100', title: 'Группа', type: 'group' }} onClose={() => {}} />)
    expect(container.textContent).toContain('Группа')
    expect(container.textContent).toContain('Заметка о клиенте')
    // v1.2.233: у группы ok:false — норма, сообщение об ошибке НЕ показываем
    await waitFor(() => expect(container.textContent).not.toContain('Не удалось загрузить профиль'))
    // и кнопки «В Telegram» у группы нет
    expect(container.textContent).not.toContain('В Telegram')
  })

  // v1.2.233: у ЛИЧНОГО чата ok:false = реальный сбой → показываем понятное сообщение.
  it('личный чат + сбой профиля (ok:false) → сообщение «Не удалось загрузить профиль»', async () => {
    window.api.invoke = vi.fn((ch) => ch === 'tg:get-contact-info'
      ? Promise.resolve({ ok: false, error: 'account not found' })
      : Promise.resolve({ ok: true }))
    const { container } = render(<ContactCardModal chat={chat} onClose={() => {}} />)
    await waitFor(() => expect(container.textContent).toContain('Не удалось загрузить профиль'))
  })

  // v1.2.233: кнопка «В Telegram» открывает контакт через app:open-external.
  it('кнопка «В Telegram» зовёт app:open-external', async () => {
    const { getByTitle, container } = render(<ContactCardModal chat={chat} onClose={() => {}} />)
    // ждём пока профиль подгрузился (username в DOM) → тогда ссылка t.me/<username>
    await waitFor(() => expect(container.textContent).toContain('@ivan'))
    fireEvent.click(getByTitle('Открыть в официальном Telegram'))
    expect(window.api.invoke).toHaveBeenCalledWith('app:open-external', 'https://t.me/ivan')
  })
})
