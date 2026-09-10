// v1.2.441: тесты чистых помощников сброса/записей фото аккаунта (shared/webAvatarGate.js).
// Поведение хука проверяется отдельно — src/hooks/useWebAccountAvatars.vitest.jsx.
import { describe, it, expect } from 'vitest'
import {
  AVATAR_RESET_EVENT, avatarLogGateKey, dropGateKeys, forgetAvatar, applyAvatarReset,
  avatarOkLine, avatarReplacedLine, avatarFailLine,
} from '../../shared/webAvatarGate.js'

describe('Гейт записей журнала', () => {
  it('🔴 размер снимка в sel не создаёт новый ключ (повтор в журнале)', () => {
    expect(avatarLogGateKey('m1', 'onscreen-big-4360', 'ok'))
      .toBe(avatarLogGateKey('m1', 'auto-settings-4360'.replace('auto-settings', 'onscreen-big'), 'ok'))
    expect(avatarLogGateKey('m1', 'onscreen-big-1', 'ok')).toBe(avatarLogGateKey('m1', 'onscreen-big-999999', 'ok'))
  })

  it('цифры в имени источника СОХРАНЯЮТСЯ (иначе два мессенджера слились бы в один ключ)', () => {
    expect(avatarLogGateKey('custom_111', 'stored')).not.toBe(avatarLogGateKey('custom_222', 'stored'))
  })

  it('разное состояние — разные ключи', () => {
    expect(avatarLogGateKey('m1', 'stored', 'ok')).not.toBe(avatarLogGateKey('m1', 'stored', 'устарел'))
    expect(avatarLogGateKey('m1', 'none', '', 'no-el')).not.toBe(avatarLogGateKey('m1', 'none', '', 'throw:TypeError'))
  })

  it('снятие гейтов затрагивает ТОЛЬКО свой источник', () => {
    const set = new Set(['m1', 'm1|stored|ok', 'm1|none||no-el', 'm2|stored|ok', 'm11|stored|ok'])
    const n = dropGateKeys(set, 'm1')
    expect(n).toBe(3)
    expect([...set].sort()).toEqual(['m11|stored|ok', 'm2|stored|ok'])
  })

  it('снятие гейтов на пустых данных не падает', () => {
    expect(dropGateKeys(null, 'm1')).toBe(0)
    expect(dropGateKeys(new Set(), '')).toBe(0)
  })
})

describe('Забыть фото одного источника', () => {
  it('фото убирается, остальные не тронуты', () => {
    const next = forgetAvatar({ a: '1', b: '2' }, 'a')
    expect(next).toEqual({ b: '2' })
  })

  it('если фото и не было — возвращается ТОТ ЖЕ объект (нет лишней перерисовки)', () => {
    const prev = { b: '2' }
    expect(forgetAvatar(prev, 'a')).toBe(prev)
    expect(forgetAvatar(prev, '')).toBe(prev)
  })

  it('пустое состояние не ломает', () => {
    expect(forgetAvatar(null, 'a')).toEqual({})
  })
})

describe('Применение сброса (applyAvatarReset)', () => {
  const make = () => ({
    calls: [],
    gates: [new Set(['m1|stored|ok']), new Set(['m1'])],
    photos: new Map([['m1', 'фото'], ['m2', 'фото2']]),
  })

  it('🔴 ЛОВУШКА: сброс убирает фото + снимает гейты + возвращает строку для журнала', () => {
    const h = make()
    let state = { m1: 'фото', m2: 'фото2' }
    const line = applyAvatarReset({
      ev: { detail: 'm1' },
      setAvatars: (fn) => { state = fn(state) },
      gateSets: h.gates,
      lastPhotos: h.photos,
    })
    expect(state).toEqual({ m2: 'фото2' })
    expect(h.gates[0].size).toBe(0)
    expect(h.gates[1].size).toBe(0)
    expect(h.photos.has('m1')).toBe(false)
    expect(h.photos.has('m2')).toBe(true)
    expect(line).toContain('значок ЗАБЫЛ старое фото: m1')
    expect(line).toContain('снято гейтов журнала: 2')
  })

  it('id можно передать и объектом {id}', () => {
    const h = make()
    expect(applyAvatarReset({ ev: { detail: { id: 'm1' } }, setAvatars: () => {}, gateSets: h.gates, lastPhotos: h.photos }))
      .toContain('m1')
  })

  it('пустое событие → null, состояние не трогаем', () => {
    let touched = false
    for (const ev of [null, {}, { detail: '' }, { detail: {} }, { detail: 123 }]) {
      expect(applyAvatarReset({ ev, setAvatars: () => { touched = true } })).toBe(null)
    }
    expect(touched).toBe(false)
  })

  it('вызов без наборов и карты не падает', () => {
    expect(applyAvatarReset({ ev: { detail: 'm1' } })).toContain('m1')
  })
})

describe('Тексты записей в журнал', () => {
  it('успех несёт где нашли и причину', () => {
    expect(avatarOkLine('m1', { sel: 'crisp-stored', avwhy: 'ok' }))
      .toBe('[web-avatar] получен аватар: m1 (sel=crisp-stored, причина=ok)')
  })

  it('успех без причины — без хвоста «причина=»', () => {
    expect(avatarOkLine('m1', { sel: 'stored' })).toBe('[web-avatar] получен аватар: m1 (sel=stored)')
  })

  it('замена фото — отдельная запись (доказывает, что сброс сработал)', () => {
    expect(avatarReplacedLine('m1', { sel: 'onscreen-big-4360', avwhy: 'устарел' }))
      .toContain('фото ЗАМЕНЕНО: m1')
  })

  it('неудача несёт ошибку, причину и дамп', () => {
    const l = avatarFailLine('m1', { sel: 'none', err: 'no-el', avwhy: 'мелкий-80', dump: 'IMG.x' })
    expect(l).toContain('НЕТ фото — sel=none err=no-el')
    expect(l).toContain('причина=мелкий-80')
    expect(l).toContain('dump=IMG.x')
  })

  it('v1.2.442: ЗАМЕР «имя-рядом» попадает в запись, но только когда он есть', () => {
    const withNear = avatarOkLine('m1', { sel: 'header img', avwhy: 'снят-заново', avnear: 'да' })
    expect(withNear).toContain('имя-рядом=да')
    // без замера хвоста нет — старые записи журнала не меняются
    expect(avatarOkLine('m1', { sel: 'stored' })).not.toContain('имя-рядом')
  })

  it('крайний случай: пустой ответ скрипта не ломает текст', () => {
    expect(typeof avatarFailLine('m1', null)).toBe('string')
    expect(typeof avatarOkLine('m1', null)).toBe('string')
    expect(typeof avatarReplacedLine('m1', undefined)).toBe('string')
  })

  it('в записях НЕТ имени аккаунта и самого фото (только техника)', () => {
    const l = avatarOkLine('m1', { sel: 'crisp-stored', avwhy: 'ok', who: 'Иван', avatar: 'data:image/jpeg;base64,AAA' })
    expect(l).not.toContain('Иван')
    expect(l).not.toContain('data:image')
  })

  it('имя события совпадает с тем, что шлёт меню', () => {
    expect(AVATAR_RESET_EVENT).toBe('cc-avatar-reset')
  })
})
